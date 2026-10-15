import type { Context } from 'hono';
import { type AppEnv, EMAILS_POR_TANDA, conectar } from '../config';
import * as catalogo from '../services/catalogo.service';
import { leerConfiguracion, leerContenido } from '../services/configuracion.service';
import { procesarCola } from '../services/emails.service';
import { opcionesDeEnvio } from '../services/envios.service';
import { crearPreferencia, firmaValida, procesarPago } from '../services/pagos.service';
import { buscarToken, cargarPedido, cotizar, crearPedido, seguimiento } from '../services/pedidos.service';
import { bannersVigentes } from '../services/portada.service';
import { crearSolicitud, darDeBaja, suscribir } from '../services/postventa.service';
import { ErrorApp } from '../utils/errores';
import { cuerpo } from '../utils/http';
import * as v from '../validations/tienda.validation';

type C = Context<AppEnv>;
// Si el campo señuelo vino completo, lo llenó un bot. El mensaje es genérico y recuperable
// por si un autocompletado del navegador lo llenara por error.
function descartarBots(senuelo: string | undefined) {
  if (senuelo) throw new ErrorApp(400, 'No pudimos procesar el formulario. Recargá la página e intentá de nuevo.');
}

// "3,4" → [3, 4]; ignora lo que no sea un número entero positivo y limita la cantidad.
const ids = (valor: string | undefined) =>
  (valor ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 30);

const numero = (valor: string | undefined) => (valor && Number.isFinite(Number(valor)) ? Number(valor) : undefined);

// ───────────── Catálogo ─────────────
export const filtros = async (c: C) => c.json(await catalogo.listarFiltros(conectar(c.env)));
export const productos = async (c: C) =>
  c.json(
    await catalogo.listarProductos(conectar(c.env), {
      categoria: c.req.query('categoria'),
      coleccion: c.req.query('coleccion'),
      talleIds: ids(c.req.query('talle')),
      colorIds: ids(c.req.query('color')),
      limite: numero(c.req.query('limite')),
      min: numero(c.req.query('min')),
      max: numero(c.req.query('max')),
      q: c.req.query('q')?.slice(0, 60),
      oferta: c.req.query('oferta') === '1',
      destacado: c.req.query('destacado') === '1',
      orden: c.req.query('orden'),
      pagina: numero(c.req.query('pagina')),
    }),
  );
export const sitemap = async (c: C) => c.json(await catalogo.datosSitemap(conectar(c.env)));
export const producto = async (c: C) => c.json(await catalogo.obtenerProducto(conectar(c.env), c.req.param('slug')!));

// Portada: banners vigentes y las secciones de productos.
export async function portada(c: C) {
  const [banners, secciones] = await Promise.all([bannersVigentes(c.env.DB), catalogo.seccionesPortada(conectar(c.env))]);
  return c.json({ banners, ...secciones });
}

// Datos de la tienda que necesita el checkout y textos editables desde el panel.
export async function tienda(c: C) {
  const [config, contenido] = await Promise.all([leerConfiguracion(c.env.DB), leerContenido(c.env.DB)]);
  return c.json({
    descuentoTransferenciaPorcentaje: config.descuento_transferencia_porcentaje,
    cuotasSinInteres: config.cuotas_sin_interes ? { cantidad: config.cuotas_cantidad } : null,
    reservaMercadoPagoMinutos: config.reserva_mercado_pago_minutos,
    reservaTransferenciaHoras: config.reserva_transferencia_horas,
    emailContacto: config.email_contacto,
    datosLegales: config.datos_legales,
    retiro: config.retiro_habilitado ? { direccion: config.retiro_direccion, horario: config.retiro_horario } : null,
    barraAnuncios: config.barra_anuncios,
    whatsapp: config.whatsapp,
    instagram: config.instagram,
    ultimasUnidadesUmbral: config.ultimas_unidades_umbral,
    maxUnidadesPorPedido: config.max_unidades_por_pedido,
    contenido,
  });
}

// ───────────── Carrito y checkout ─────────────
export const cotizarEnvio = async (c: C) =>
  c.json(await opcionesDeEnvio(conectar(c.env), (await cuerpo(c, v.CotizarEnvio)).codigoPostal));

// El carrito vive en el navegador: acá se revisa stock y precio y se devuelve el total real.
export async function validarCarrito(c: C) {
  const r = await cotizar(c.env, await cuerpo(c, v.ValidarCarrito));
  const { config: _, zona, ...resto } = r;
  return c.json({ ...resto, envio: zona });
}

export async function nuevoPedido(c: C) {
  const datos = await cuerpo(c, v.NuevoPedido);
  descartarBots(datos.comentarioExtra);
  const { token, repetido } = await crearPedido(c.env, datos, c.req.header('cf-connecting-ip') ?? 'local');
  const pedido = await cargarPedido(c.env.DB, { token });
  // El email de "recibimos tu pedido" sale sin hacer esperar a la clienta.
  c.executionCtx.waitUntil(procesarCola(c.env, EMAILS_POR_TANDA).catch(console.error));

  // Si Mercado Pago falla, el pedido igual queda creado: puede pagar desde el seguimiento.
  let urlPago: string | null = null;
  if (pedido.metodo_pago === 'mercadopago' && pedido.estado === 'pendiente_pago') {
    urlPago = await crearPreferencia(c.env, pedido).catch((e) => {
      if (!(e instanceof ErrorApp)) console.error(e);
      return null;
    });
  }
  return c.json({ numero: pedido.numero, token, urlPago, pedido: await seguimiento(c.env, token) }, repetido ? 200 : 201);
}

export async function buscarPedido(c: C) {
  const datos = await cuerpo(c, v.BuscarPedido);
  const token = await buscarToken(c.env.DB, datos.numero, datos.email);
  if (!token) throw new ErrorApp(404, 'No encontramos un pedido con esos datos.');
  return c.json({ token });
}

export const verSeguimiento = async (c: C) => c.json(await seguimiento(c.env, c.req.param('token')!));

// Reintentar el pago mientras dure la reserva.
export async function pagar(c: C) {
  const pedido = await cargarPedido(c.env.DB, { token: c.req.param('token')! });
  return c.json({ urlPago: await crearPreferencia(c.env, pedido) });
}

export const nuevaSolicitud = async (c: C) =>
  c.json(await crearSolicitud(c.env, c.req.param('token')!, await cuerpo(c, v.NuevaSolicitud)), 201);

// ───────────── Novedades ─────────────
export async function suscribirse(c: C) {
  const datos = await cuerpo(c, v.Suscripcion);
  descartarBots(datos.comentarioExtra);
  await suscribir(c.env.DB, datos.email);
  return c.json({ ok: true }, 201);
}
export async function baja(c: C) {
  await darDeBaja(c.env.DB, c.req.param('token')!);
  return c.json({ ok: true });
}

// ───────────── Webhook de Mercado Pago ─────────────
export async function webhookMercadoPago(c: C) {
  const aviso = (await c.req.json().catch(() => null)) as { type?: string; data?: { id?: string | number } } | null;
  const idDato = c.req.query('data.id') ?? String(aviso?.data?.id ?? '');
  // Sin clave configurada no se puede saber si el aviso es de Mercado Pago: se rechaza.
  if (
    !c.env.MP_WEBHOOK_SECRET ||
    !(await firmaValida(c.env.MP_WEBHOOK_SECRET, c.req.header('x-signature'), c.req.header('x-request-id'), idDato))
  ) {
    return c.json({ error: 'Firma inválida.' }, 401);
  }
  const tipo = aviso?.type ?? c.req.query('type');
  if (tipo === 'payment' && idDato) {
    await procesarPago(c.env, idDato);
    c.executionCtx.waitUntil(procesarCola(c.env, EMAILS_POR_TANDA).catch(console.error));
  }
  // Cualquier otro tipo de aviso se da por recibido para que Mercado Pago no lo reintente.
  return c.json({ ok: true });
}
