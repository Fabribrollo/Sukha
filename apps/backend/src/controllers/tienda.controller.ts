import type { Context } from 'hono';
import { type AppEnv, COOKIE_SESION, EMAILS_POR_TANDA, conectar } from '../config';
import * as catalogo from '../services/catalogo.service';
import { leerConfiguracion, leerContenido } from '../services/configuracion.service';
import { procesarCola } from '../services/emails.service';
import { opcionesDeEnvio } from '../services/envios.service';
import { crearPreferencia, firmaValida, procesarPago } from '../services/pagos.service';
import { buscarToken, cargarPedido, cotizar, crearPedido, opcionesParaCarrito, seguimiento, vistaSeguimiento } from '../services/pedidos.service';
import { cabeceraResuelta } from '../services/cabecera.service';
import { leerPortadas, resolverPortada } from '../services/portada-secciones.service';
import { sesionVigente } from '../services/auth.service';
import { getCookie } from 'hono/cookie';
import { crearSolicitud, darDeBaja, suscribir } from '../services/postventa.service';
import { buscarCalles, buscarLocalidades } from '../services/georef.service';
import { buscarRedireccion } from '../services/redirecciones.service';
import { guardarCarrito, itemsDeCarrito } from '../services/carritos.service';
import { alertar, avisarStockBajo } from '../services/alertas.service';
import { ErrorApp } from '../utils/errores';
import { mensajeDe, registrar } from '../utils/registro';
import { ahora, cuerpo } from '../utils/http';
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
// Con los mismos parámetros de alcance que el listado (categoria, coleccion, q, oferta, destacado), talles, colores y
// precio salen solo de esos productos.
export const filtros = async (c: C) =>
  c.json(
    await catalogo.listarFiltros(conectar(c.env), {
      categoria: c.req.query('categoria'),
      coleccion: c.req.query('coleccion'),
      q: c.req.query('q')?.slice(0, 60),
      oferta: c.req.query('oferta') === '1',
      destacado: c.req.query('destacado') === '1',
    }),
  );
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

// Menú de la cabecera ya resuelto (nombres, enlaces y fotos). Con `?borrador=1` y sesión de admin, el borrador del panel
// (nunca en caché); sin sesión se ignora y sale el menú publicado.
export async function cabecera(c: C) {
  const db = conectar(c.env);
  const pidioBorrador = c.req.query('borrador') === '1';
  const token = getCookie(c, COOKIE_SESION);
  const verBorrador = pidioBorrador && Boolean(token && (await sesionVigente(db, token)));
  const r = c.json(await cabeceraResuelta(db, c.env.DB, verBorrador));
  if (pidioBorrador) r.headers.set('cache-control', 'no-store');
  return r;
}

// Portada: secciones en orden, con sus productos, categorías y banners ya resueltos. Con `?borrador=1` y sesión de admin, la
// vista previa del borrador; sin sesión se ignora y sale la portada publicada.

export async function portada(c: C) {
  const db = conectar(c.env);
  const token = getCookie(c, COOKIE_SESION);
  const esAdmin = Boolean(token && (await sesionVigente(db, token)));
  const { publicada, borrador } = await leerPortadas(c.env.DB);
  const usar = c.req.query('borrador') === '1' && esAdmin ? (borrador ?? publicada) : publicada;
  const r = c.json({ secciones: await resolverPortada(c.env, db, usar), borrador: c.req.query('borrador') === '1' && esAdmin && borrador !== null });
  // La vista previa no se guarda en ninguna caché.
  if (c.req.query('borrador') === '1') r.headers.set('cache-control', 'no-store');
  return r;
}

// Datos de la tienda que necesita el checkout y textos editables desde el panel.
export async function tienda(c: C) {
  const [config, contenido, gratis] = await Promise.all([
    leerConfiguracion(c.env.DB),
    leerContenido(c.env.DB),
    c.env.DB.prepare('SELECT min(gratis_desde_centavos) AS desde FROM zona_envio WHERE activa = 1').first<{ desde: number | null }>(),
  ]);
  return c.json({
    // Desde cuánto alguna zona envía gratis (para el aviso «Te faltan $X»); null si ninguna.
    envioGratisDesdeCentavos: gratis?.desde ?? null,
    descuentoTransferenciaPorcentaje: config.descuento_transferencia_porcentaje,
    cuotasSinInteres: config.cuotas_sin_interes ? { cantidad: config.cuotas_cantidad } : null,
    reservaMercadoPagoMinutos: config.reserva_mercado_pago_minutos,
    reservaTransferenciaHoras: config.reserva_transferencia_horas,
    emailContacto: config.email_contacto,
    datosLegales: config.datos_legales,
    retiro: config.retiro_habilitado ? { direccion: config.retiro_direccion, horario: config.retiro_horario } : null,
    // Dirección del logo, o null si no hay (se usa el nombre en texto).
    logo: config.logo_clave ? `/api/imagenes/${config.logo_clave}/grande.webp` : null,
    favicon: config.favicon_clave ? `/api/imagenes/${config.favicon_clave}/grande.webp` : null,
    titulo: config.titulo_tienda,
    barraAnuncios: config.barra_anuncios,
    analyticsToken: config.analytics_token,
    vacaciones: config.vacaciones_activo ? { mensaje: config.vacaciones_mensaje } : null,
    whatsapp: config.whatsapp,
    instagram: config.instagram,
    ultimasUnidadesUmbral: config.ultimas_unidades_umbral,
    maxUnidadesPorPedido: config.max_unidades_por_pedido,
    contenido,
    // Datos del comercio para el pie y los textos legales (vacío = falta cargarlo en Configuración).
    comercio: { razonSocial: config.razon_social, cuit: config.cuit, condicionFiscal: config.condicion_fiscal, domicilio: config.domicilio_comercial, horarioAtencion: config.horario_atencion, responsableAtencion: config.responsable_atencion, dataFiscalUrl: config.data_fiscal_url },
  });
}

// ───────────── Sugerencias de dirección (Georef) ─────────────
// Las respuestas se guardan 30 días en `cache_externa` (D1): las mismas búsquedas no vuelven a Georef. La Cache API de
// Cloudflare no sirve acá porque el backend no tiene dominio propio. Si Georef no responde, se usa lo guardado aunque
// haya vencido (la tarea programada lo borra 30 días después).
const VIGENCIA_GEOREF_MS = 30 * 86_400_000;
async function conCache(c: C, tipo: string, calcular: (provincia: string, q: string, localidad: string | null) => Promise<unknown[] | null>) {
  const provincia = c.req.query('provincia') ?? '';
  const q = c.req.query('q') ?? '';
  const localidad = c.req.query('localidad') ?? null;
  const clave = `georef:${tipo}:${provincia}:${localidad ?? ''}:${q}`.trim().toLowerCase();
  const guardada = await c.env.DB.prepare('SELECT valor, vence_en FROM cache_externa WHERE clave = ?').bind(clave).first<{ valor: string; vence_en: string }>();
  const responder = (cuerpo: string) => c.body(cuerpo, 200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' });
  if (guardada && guardada.vence_en > ahora()) return responder(guardada.valor);
  const lista = await calcular(provincia, q, localidad);
  if (lista === null) {
    if (guardada) return responder(guardada.valor);
    // Georef no respondió y no hay nada guardado: el checkout lo usa para dejar escribir a mano.
    return c.json({ error: 'Sugerencias no disponibles.' }, 503);
  }
  const valor = JSON.stringify(lista);
  // Una lista vacía puede ser un fallo de Georef: no se guarda.
  if (lista.length)
    c.executionCtx.waitUntil(
      c.env.DB.prepare('INSERT INTO cache_externa (clave, valor, vence_en) VALUES (?, ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, vence_en = excluded.vence_en')
        .bind(clave, valor, new Date(Date.now() + VIGENCIA_GEOREF_MS).toISOString())
        .run(),
    );
  return responder(valor);
}
export const georefLocalidades = (c: C) => conCache(c, 'localidades', (provincia, q) => buscarLocalidades(provincia, q));
export const georefCalles = (c: C) => conCache(c, 'calles', buscarCalles);

// ───────────── Carrito y checkout ─────────────
export async function cotizarEnvio(c: C) {
  const { codigoPostal, items } = await cuerpo(c, v.CotizarEnvio);
  return c.json(await opcionesParaCarrito(c.env, codigoPostal, items ?? []));
}

// El carrito vive en el navegador: acá se revisa stock y precio y se devuelve el total real.
export async function validarCarrito(c: C) {
  const r = await cotizar(c.env, await cuerpo(c, v.ValidarCarrito));
  const { config: _, zona, ...resto } = r;
  return c.json({ ...resto, envio: zona });
}

export async function nuevoPedido(c: C) {
  const datos = await cuerpo(c, v.NuevoPedido);
  descartarBots(datos.comentarioExtra);
  const { token, repetido, config: leida } = await crearPedido(c.env, datos, c.req.header('cf-connecting-ip') ?? 'local');
  // El pedido y la configuración se leen una sola vez y se pasan a la preferencia y al seguimiento.
  const [pedido, config] = await Promise.all([cargarPedido(c.env.DB, { token }), leida ?? leerConfiguracion(c.env.DB)]);
  // El email de "recibimos tu pedido" sale sin hacer esperar a la clienta.
  c.executionCtx.waitUntil(procesarCola(c.env, EMAILS_POR_TANDA).catch(console.error));
  if (!repetido) c.executionCtx.waitUntil(avisarStockBajo(c.env));

  // Si Mercado Pago falla, el pedido igual queda creado: puede pagar desde el seguimiento.
  let urlPago: string | null = null;
  if (pedido.metodo_pago === 'mercadopago' && pedido.estado === 'pendiente_pago') {
    urlPago = await crearPreferencia(c.env, pedido, config).catch((e) => {
      if (!(e instanceof ErrorApp)) console.error(e);
      return null;
    });
  }
  return c.json({ numero: pedido.numero, token, urlPago, pedido: vistaSeguimiento(pedido, config) }, repetido ? 200 : 201);
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
// Si algo falla se le avisa a la dueña (ver alertas.service) y se responde con error para que Mercado Pago lo reintente.
export async function webhookMercadoPago(c: C) {
  const aviso = (await c.req.json().catch(() => null)) as { type?: string; data?: { id?: string | number } } | null;
  const idDato = c.req.query('data.id') ?? String(aviso?.data?.id ?? '');
  // Sin clave configurada no se puede saber si el aviso es de Mercado Pago: se rechaza.
  if (!c.env.MP_WEBHOOK_SECRET) {
    c.executionCtx.waitUntil(alertar(c.env, 'firma', 'Llegó un aviso de pago de Mercado Pago, pero falta cargar la clave del webhook (MP_WEBHOOK_SECRET): no se pudo procesar.'));
    return c.json({ error: 'Firma inválida.' }, 401);
  }
  if (!(await firmaValida(c.env.MP_WEBHOOK_SECRET, c.req.header('x-signature'), c.req.header('x-request-id'), idDato))) {
    registrar('warn', 'webhook_firma_invalida', { pago: idDato.slice(0, 40) });
    c.executionCtx.waitUntil(alertar(c.env, 'firma', `Llegó un aviso de pago (pago ${idDato.slice(0, 40) || 'sin número'}) con una firma que no coincide con la clave del webhook.`));
    return c.json({ error: 'Firma inválida.' }, 401);
  }
  const tipo = aviso?.type ?? c.req.query('type');
  if (tipo === 'payment' && idDato) {
    try {
      await procesarPago(c.env, idDato);
    } catch (e) {
      c.executionCtx.waitUntil(alertar(c.env, 'webhook', `No se pudo procesar el aviso del pago ${idDato} de Mercado Pago: ${mensajeDe(e)}`));
      throw e;
    }
    c.executionCtx.waitUntil(procesarCola(c.env, EMAILS_POR_TANDA).catch(console.error));
  }
  // Cualquier otro tipo de aviso se da por recibido para que Mercado Pago no lo reintente.
  return c.json({ ok: true });
}

// La tienda pregunta acá solo cuando una dirección da 404: si hay una redirección, a dónde mandar.
export async function redireccion(c: C) {
  const ruta = (c.req.query('ruta') ?? '').slice(0, 300);
  const fila = ruta.startsWith('/') ? await buscarRedireccion(conectar(c.env), ruta.length > 1 ? ruta.replace(/[/]+$/, '') : ruta) : null;
  if (!fila) return c.json({ error: 'Sin redirección.' }, 404);
  return c.json(fila, 200, { 'cache-control': 'public, max-age=300' });
}

// Carrito abandonado: el checkout avisa el email y el carrito. Siempre responde lo mismo, para no revelar nada.
export async function avisarCarrito(c: C) {
  const datos = await cuerpo(c, v.CarritoAbandonado);
  descartarBots(datos.comentarioExtra);
  await guardarCarrito(c.env.DB, datos);
  return c.json({ ok: true });
}
export const verCarrito = async (c: C) => c.json(await itemsDeCarrito(c.env.DB, c.req.param('codigo')!.slice(0, 40)));
