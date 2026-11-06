import type { Context } from 'hono';
import { type AppEnv, EMAILS_POR_TANDA, conectar } from '../config';
import { procesarCola } from '../services/emails.service';
import { guardarConfiguracion, leerConfiguracion, leerContenido } from '../services/configuracion.service';
import * as cupones from '../services/cupones.service';
import * as promociones from '../services/promociones.service';
import * as envios from '../services/envios.service';
import { cambiarEstado as aplicarCambio } from '../services/estados.service';
import { cargarPedido } from '../services/pedidos.service';
import { reembolsarEnMercadoPago } from '../services/pagos.service';
import { editarSolicitud as guardarSolicitud, listarSolicitudes as buscarSolicitudes } from '../services/postventa.service';
import * as reportes from '../services/reportes.service';
import * as ventaManual from '../services/venta-manual.service';
import * as carritos from '../services/carritos.service';
import * as plantillas from '../services/plantillas.service';
import { envolverEmail } from '../services/emails.service';
import { Resend } from 'resend';
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

// ───────────── Promociones ─────────────
export const listarPromociones = async (c: C) => c.json(await promociones.listarPromociones(conectar(c.env)));
export const crearPromocion = async (c: C) => c.json(await promociones.crearPromocion(conectar(c.env), await cuerpo(c, v.NuevaPromocion)), 201);
export const editarPromocion = async (c: C) =>
  c.json(await promociones.editarPromocion(conectar(c.env), idDe(c), await cuerpo(c, v.EdicionPromocion)));

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
      desde: c.req.query('desde'),
    }),
  );
export const conteosPedidos = async (c: C) => c.json(await reportes.conteosPedidos(c.env.DB));
// Para armar el paquete: cada prenda con su foto (la del color elegido, si hay) y el transportista de la zona.
// Venta por WhatsApp o Instagram cargada a mano: el pedido queda esperando el pago (o pagado, si ya pagó).
export const prendasParaVender = async (c: C) => c.json(await ventaManual.prendasParaVender(c.env.DB));
export async function crearVentaManual(c: C) {
  const pedido = await ventaManual.crearVentaManual(c.env, await cuerpo(c, v.NuevaVentaManual), c.var.adminId);
  c.executionCtx.waitUntil(procesarCola(c.env, EMAILS_POR_TANDA).catch(console.error));
  return c.json(pedido, 201);
}
export async function verPedido(c: C) {
  const d1 = c.env.DB;
  const p = await cargarPedido(d1, { id: idDe(c) });
  const [fotos, zona] = await d1.batch([
    d1.prepare(
      `SELECT i.id, (SELECT clave FROM imagen WHERE producto_id = v.producto_id AND (color_id IS NULL OR color_id = v.color_id)
                     ORDER BY color_id IS NULL, orden, id LIMIT 1) AS foto
         FROM pedido_item i JOIN variante v ON v.id = i.variante_id WHERE i.pedido_id = ?`,
    ).bind(p.id),
    d1.prepare('SELECT transporte FROM zona_envio WHERE id = ?').bind(p.zona_envio_id),
  ]);
  const foto = new Map((fotos.results as { id: number; foto: string | null }[]).map((f) => [f.id, f.foto]));
  return c.json({
    ...p,
    transporte: (zona.results[0] as { transporte: string } | undefined)?.transporte ?? null,
    items: p.items.map((i) => ({ ...i, foto: foto.get(i.id) ?? null })),
  });
}

// Marcar pagada una transferencia, pasar a preparación, cargar el seguimiento, entregar, cancelar o reembolsar.
export async function cambiarEstado(c: C) {
  const d = await cuerpo(c, v.CambioEstado);
  const pedido = await cargarPedido(c.env.DB, { id: idDe(c) });
  if (d.estado === 'reembolsado' && d.devolverPlata) await reembolsarEnMercadoPago(c.env, pedido);
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
                       nota_interna = CASE WHEN ?6 THEN ?7 ELSE nota_interna END,
                       actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?5`,
  )
    .bind(
      d.numeroSeguimiento !== undefined ? 1 : 0,
      d.numeroSeguimiento ?? null,
      d.facturaNumero !== undefined ? 1 : 0,
      d.facturaNumero ?? null,
      id,
      d.notaInterna !== undefined ? 1 : 0,
      d.notaInterna ?? null,
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
// Reporte de ventas: días de Argentina, ?desde y ?hasta incluidos (por defecto, el mes en curso).
function diasDelReporte(c: C) {
  const dia = /^\d{4}-\d{2}-\d{2}$/;
  const hoy = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const desde = c.req.query('desde') || `${hoy.slice(0, 8)}01`;
  const hasta = c.req.query('hasta') || hoy;
  if (!dia.test(desde) || !dia.test(hasta) || desde > hasta) throw new ErrorApp(400, 'Revisá las fechas: van como AAAA-MM-DD y «desde» no puede ser posterior a «hasta».');
  return { desde, hasta };
}
export async function verReporte(c: C) {
  const { desde, hasta } = diasDelReporte(c);
  return c.json(await reportes.reporteDeVentas(c.env.DB, desde, hasta));
}
// El mismo reporte en CSV, una tabla por vez (?tabla=dias|meses|productos|pagos|zonas|marcas).
export async function exportarReporte(c: C) {
  const { desde, hasta } = diasDelReporte(c);
  const r = await reportes.reporteDeVentas(c.env.DB, desde, hasta);
  const pesos = (v: unknown) => (typeof v === 'number' ? v / 100 : v);
  const tablas: Record<string, Record<string, unknown>[]> = {
    dias: r.porDia.map((f: any) => ({ dia: f.dia, pedidos: f.pedidos, ventas: pesos(f.ventas_centavos) })),
    meses: r.porMes.map((f: any) => ({ mes: f.mes, pedidos: f.pedidos, ventas: pesos(f.ventas_centavos) })),
    productos: r.productos.map((f: any) => ({ producto: f.producto, unidades: f.unidades, monto_prendas: pesos(f.prendas_centavos) })),
    pagos: r.pagos.map((f: any) => ({ medio_de_pago: f.clave, pedidos: f.pedidos, ventas: pesos(f.ventas_centavos) })),
    zonas: r.zonas.map((f: any) => ({ zona: f.clave, pedidos: f.pedidos, ventas: pesos(f.ventas_centavos) })),
    marcas: r.marcas.map((f: any) => ({ marca: f.clave, unidades: f.unidades, monto_prendas: pesos(f.prendas_centavos) })),
  };
  const tabla = c.req.query('tabla') ?? 'dias';
  if (!tablas[tabla]) throw new ErrorApp(400, 'Esa tabla no existe.');
  return csv(c, `ventas-${tabla}-${desde}-a-${hasta}`, tablas[tabla]);
}
export const listarCarritos = async (c: C) => c.json(await carritos.listarCarritos(c.env.DB));
export const marcarCarrito = async (c: C) => c.json(await carritos.marcarCarrito(c.env.DB, idDe(c), (await cuerpo(c, v.EstadoCarrito)).estado));
export const listarClientas = async (c: C) => c.json(await reportes.listarClientas(c.env.DB));
export const exportarClientas = async (c: C) => csv(c, 'clientas', await reportes.listarClientas(c.env.DB));

// ───────────── Plantillas de email ─────────────
const tipoDePlantilla = (c: C) => {
  const tipo = c.req.param('tipo')!;
  if (!plantillas.PLANTILLAS[tipo]) throw new ErrorApp(404, 'Esa plantilla no existe.');
  return tipo;
};
export const listarPlantillas = async (c: C) => c.json(plantillas.listarPlantillas((await leerConfiguracion(c.env.DB)).plantillas_email));
export async function guardarPlantilla(c: C) {
  const tipo = tipoDePlantilla(c);
  const d = await cuerpo(c, v.TextoPlantilla);
  if (!plantillas.PLANTILLAS[tipo].esMensaje && !d.asunto) throw new ErrorApp(400, 'El asunto no puede quedar vacío.');
  const { plantillas_email } = await leerConfiguracion(c.env.DB);
  await guardarConfiguracion(c.env.DB, 'plantillas_email', { ...plantillas_email, [tipo]: d });
  return c.json({ ok: true });
}
export async function restaurarPlantilla(c: C) {
  const tipo = tipoDePlantilla(c);
  const { [tipo]: _, ...resto } = (await leerConfiguracion(c.env.DB)).plantillas_email;
  await guardarConfiguracion(c.env.DB, 'plantillas_email', resto);
  return c.json({ ok: true });
}
// Cómo queda con datos de ejemplo (para la vista previa mientras se escribe).
function armarEjemplo(tipo: string, d: { asunto: string; texto: string }) {
  const valores = plantillas.valoresDeEjemplo();
  const ejemplo = [{ cantidad: 1, nombre_producto: 'Vestido Lino', talle: 'M', color: 'Crema' }];
  const conPrendas = tipo.startsWith('pedido_') || tipo === 'pago_aprobado' || tipo === 'listo_para_retirar';
  return { asunto: plantillas.asuntoCon(d.asunto, valores), html: envolverEmail(plantillas.htmlDe(d.texto, valores), conPrendas ? ejemplo : null), texto: plantillas.textoCon(d.texto, valores) };
}
export const vistaPreviaPlantilla = async (c: C) => c.json(armarEjemplo(tipoDePlantilla(c), await cuerpo(c, v.TextoPlantilla)));
// «Enviarme una prueba»: a la casilla de quien está en el panel (gasta 1 de los emails del día).
export async function probarPlantilla(c: C) {
  const tipo = tipoDePlantilla(c);
  if (tipo === 'carrito_whatsapp') throw new ErrorApp(400, 'El mensaje de WhatsApp no se manda por email: probalo desde Carritos abandonados.');
  if (!c.env.RESEND_API_KEY) throw new ErrorApp(503, 'Los emails todavía no están configurados (falta la clave de Resend).');
  const admin = await c.env.DB.prepare('SELECT email FROM admin WHERE id = ?').bind(c.var.adminId).first<{ email: string }>();
  if (!admin) throw new ErrorApp(401, 'No autorizado.');
  const email = armarEjemplo(tipo, await cuerpo(c, v.TextoPlantilla));
  const { error } = await new Resend(c.env.RESEND_API_KEY).emails.send({ from: c.env.EMAIL_FROM, to: admin.email, subject: `[Prueba] ${email.asunto}`, html: email.html });
  if (error) throw new ErrorApp(502, `No se pudo enviar la prueba: ${error.message}`);
  return c.json({ enviadoA: admin.email });
}
