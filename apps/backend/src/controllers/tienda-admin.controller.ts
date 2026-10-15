import type { Context } from 'hono';
import { type AppEnv, EMAILS_POR_TANDA, conectar } from '../config';
import { procesarCola } from '../services/emails.service';
import { guardarConfiguracion, leerConfiguracion, leerContenido } from '../services/configuracion.service';
import * as cupones from '../services/cupones.service';
import * as envios from '../services/envios.service';
import { cambiarEstado as aplicarCambio } from '../services/estados.service';
import { cargarPedido } from '../services/pedidos.service';
import { editarSolicitud as guardarSolicitud, listarSolicitudes as buscarSolicitudes } from '../services/postventa.service';
import * as reportes from '../services/reportes.service';
import { ErrorApp } from '../utils/errores';
import { cuerpo, idDe } from '../utils/http';
import * as v from '../validations/tienda.validation';

type C = Context<AppEnv>;

// ───────────── Envíos ─────────────
export const listarZonas = async (c: C) => c.json(await envios.listarZonas(conectar(c.env)));
export const crearZona = async (c: C) => c.json(await envios.crearZona(conectar(c.env), await cuerpo(c, v.NuevaZona)), 201);
export const editarZona = async (c: C) => c.json(await envios.editarZona(conectar(c.env), idDe(c), await cuerpo(c, v.EdicionZona)));
export const agregarRango = async (c: C) =>
  c.json(await envios.agregarRango(conectar(c.env), idDe(c), await cuerpo(c, v.NuevoRango)), 201);
export async function eliminarRango(c: C) {
  await envios.eliminarRango(conectar(c.env), idDe(c));
  return c.json({ ok: true });
}

// ───────────── Cupones ─────────────
export const listarCupones = async (c: C) => c.json(await cupones.listarCupones(conectar(c.env)));
export const crearCupon = async (c: C) => c.json(await cupones.crearCupon(conectar(c.env), await cuerpo(c, v.NuevoCupon)), 201);
export const editarCupon = async (c: C) =>
  c.json(await cupones.editarCupon(conectar(c.env), idDe(c), await cuerpo(c, v.EdicionCupon)));

// ───────────── Configuración y contenido ─────────────
export const verConfiguracion = async (c: C) =>
  c.json({ ...(await leerConfiguracion(c.env.DB)), ...(await leerContenido(c.env.DB)) });
export async function guardarClave(c: C) {
  const datos = (await c.req.json().catch(() => null)) as { valor?: unknown } | null;
  if (!datos || !('valor' in datos)) throw new ErrorApp(400, 'Se esperaba { "valor": ... }.');
  return c.json(await guardarConfiguracion(c.env.DB, c.req.param('clave')!, datos.valor));
}

// ───────────── Pedidos ─────────────
export const listarPedidos = async (c: C) =>
  c.json(
    await reportes.listarPedidos(c.env.DB, {
      estado: c.req.query('estado'),
      q: c.req.query('q'),
      pagina: Number(c.req.query('pagina')) || 1,
    }),
  );
export const verPedido = async (c: C) => c.json(await cargarPedido(c.env.DB, { id: idDe(c) }));

// Marcar pagada una transferencia, pasar a preparación, cargar el seguimiento, entregar, cancelar o reembolsar.
export async function cambiarEstado(c: C) {
  const d = await cuerpo(c, v.CambioEstado);
  const pedido = await cargarPedido(c.env.DB, { id: idDe(c) });
  const actualizado = await aplicarCambio(c.env, pedido, {
    a: d.estado,
    adminId: c.var.adminId,
    nota: d.nota,
    numeroSeguimiento: d.numeroSeguimiento,
    devolverStock: d.devolverStock,
  });
  c.executionCtx.waitUntil(procesarCola(c.env, EMAILS_POR_TANDA).catch(console.error));
  return c.json(actualizado);
}

export async function editarPedido(c: C) {
  const d = await cuerpo(c, v.EdicionPedido);
  const id = idDe(c);
  await c.env.DB.prepare(
    `UPDATE pedido SET numero_seguimiento = CASE WHEN ?1 THEN ?2 ELSE numero_seguimiento END,
                       factura_numero = CASE WHEN ?3 THEN ?4 ELSE factura_numero END,
                       actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?5`,
  )
    .bind(
      d.numeroSeguimiento !== undefined ? 1 : 0,
      d.numeroSeguimiento ?? null,
      d.facturaNumero !== undefined ? 1 : 0,
      d.facturaNumero ?? null,
      id,
    )
    .run();
  return c.json(await cargarPedido(c.env.DB, { id }));
}

// ───────────── Post-venta ─────────────
export const listarSolicitudes = async (c: C) => c.json(await buscarSolicitudes(c.env.DB, c.req.query('estado')));
export const editarSolicitud = async (c: C) =>
  c.json(await guardarSolicitud(c.env.DB, idDe(c), await cuerpo(c, v.EdicionSolicitud)));

// ───────────── Reportes y exportaciones ─────────────

// Período ?desde=2026-10-01&hasta=2026-10-31 (inclusive); por defecto, los últimos 30 días.
function periodo(c: C) {
  const dia = /^\d{4}-\d{2}-\d{2}$/;
  const hoy = new Date();
  const desde = c.req.query('desde') ?? new Date(hoy.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const hasta = c.req.query('hasta') ?? hoy.toISOString().slice(0, 10);
  if (!dia.test(desde) || !dia.test(hasta)) throw new ErrorApp(400, 'Las fechas van como AAAA-MM-DD.');
  // "hasta" incluye ese día entero.
  return { desde, hasta: new Date(new Date(hasta).getTime() + 86_400_000).toISOString().slice(0, 10) };
}

export async function verResumen(c: C) {
  const { desde, hasta } = periodo(c);
  const { stock_bajo_umbral } = await leerConfiguracion(c.env.DB);
  return c.json(await reportes.resumen(c.env.DB, desde, hasta, stock_bajo_umbral));
}

const csv = (c: C, nombre: string, lista: Record<string, unknown>[]) =>
  c.body(reportes.aCsv(lista), 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${nombre}.csv"`,
  });

export async function exportarPedidos(c: C) {
  const { desde, hasta } = periodo(c);
  return csv(c, 'pedidos', await reportes.pedidosParaExportar(c.env.DB, desde, hasta));
}
export const listarClientas = async (c: C) => c.json(await reportes.listarClientas(c.env.DB));
export const exportarClientas = async (c: C) => csv(c, 'clientas', await reportes.listarClientas(c.env.DB));
