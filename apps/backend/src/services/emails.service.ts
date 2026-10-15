import { Resend } from 'resend';
import { MAX_INTENTOS_EMAIL } from '../config';
import { enPesos, escaparHtml as h } from '../utils/texto';
import { type Configuracion } from '../validations/tienda.validation';
import { leerConfiguracion } from './configuracion.service';
import { type PedidoCompleto, cargarPedido } from './pedidos.service';

// Plantillas en código. Cada una devuelve asunto y párrafos; el armado del HTML es común.
type Plantilla = (p: PedidoCompleto, c: Configuracion, sitio: string) => { asunto: string; parrafos: string[] };

const link = (url: string, texto: string) => `<a href="${h(url)}">${h(texto)}</a>`;
const seguimiento = (p: PedidoCompleto, sitio: string) => `${sitio}/pedido/${p.token_seguimiento}`;
const panel = (p: PedidoCompleto, sitio: string) => `${sitio}/admin/pedidos/${p.id}`;

const PLANTILLAS: Record<string, Plantilla> = {
  pedido_recibido: (p, c, sitio) => ({
    asunto: `Recibimos tu pedido ${p.numero}`,
    parrafos: [
      `Hola ${h(p.nombre)}, recibimos tu pedido <strong>${p.numero}</strong> por ${enPesos(p.total_centavos)}.`,
      p.metodo_pago === 'transferencia'
        ? `Para confirmarlo, transferí <strong>${enPesos(p.total_centavos)}</strong> al alias <strong>${h(c.alias_transferencia)}</strong>` +
          `${c.titular_transferencia ? ` (${h(c.titular_transferencia)})` : ''} y envianos el comprobante indicando el número de pedido. ` +
          `Te reservamos las prendas por ${c.reserva_transferencia_horas} horas.`
        : `Si todavía no pagaste, podés hacerlo desde el seguimiento. Te reservamos las prendas por ${c.reserva_mercado_pago_minutos} minutos.`,
      `Podés seguir tu pedido acá: ${link(seguimiento(p, sitio), 'ver mi pedido')}.`,
    ],
  }),
  pago_aprobado: (p, _c, sitio) => ({
    asunto: `Pago aprobado: pedido ${p.numero}`,
    parrafos: [
      `Hola ${h(p.nombre)}, confirmamos el pago de tu pedido <strong>${p.numero}</strong>. Ya lo estamos preparando.`,
      `Seguilo acá: ${link(seguimiento(p, sitio), 'ver mi pedido')}.`,
    ],
  }),
  pedido_enviado: (p, _c, sitio) => ({
    asunto: `Tu pedido ${p.numero} está en camino`,
    parrafos: [
      `Hola ${h(p.nombre)}, despachamos tu pedido <strong>${p.numero}</strong>.`,
      `Número de seguimiento del correo: <strong>${h(p.numero_seguimiento ?? '')}</strong>.`,
      `Más detalle: ${link(seguimiento(p, sitio), 'ver mi pedido')}.`,
    ],
  }),
  listo_para_retirar: (p, c) => ({
    asunto: `Tu pedido ${p.numero} está listo para retirar`,
    parrafos: [
      `Hola ${h(p.nombre)}, tu pedido <strong>${p.numero}</strong> ya está listo.`,
      `Retiralo en ${h(c.retiro_direccion)}. Horario: ${h(c.retiro_horario)}.`,
    ],
  }),
  pedido_cancelado: (p) => ({
    asunto: `Tu pedido ${p.numero} fue cancelado`,
    parrafos: [
      `Hola ${h(p.nombre)}, tu pedido <strong>${p.numero}</strong> se canceló porque no recibimos el pago a tiempo y las prendas volvieron a estar disponibles.`,
      'Si ya habías pagado, respondé este email y lo resolvemos.',
    ],
  }),
  pedido_reembolsado: (p) => ({
    asunto: `Reembolso de tu pedido ${p.numero}`,
    parrafos: [`Hola ${h(p.nombre)}, registramos el reembolso de tu pedido <strong>${p.numero}</strong>. Puede tardar unos días en verse reflejado.`],
  }),
  aviso_nueva_venta: (p, _c, sitio) => ({
    asunto: `Nueva venta: ${p.numero} por ${enPesos(p.total_centavos)}`,
    parrafos: [`${h(p.nombre)} pagó el pedido ${p.numero}.`, link(panel(p, sitio), 'Abrir en el panel')],
  }),
  aviso_transferencia: (p, _c, sitio) => ({
    asunto: `Transferencia por confirmar: ${p.numero}`,
    parrafos: [
      `${h(p.nombre)} eligió pagar ${enPesos(p.total_centavos)} por transferencia. Cuando veas la plata en tu banco, marcá el pedido como pagado.`,
      link(panel(p, sitio), 'Abrir en el panel'),
    ],
  }),
  aviso_a_revisar: (p, _c, sitio) => ({
    asunto: `Pedido a revisar: ${p.numero}`,
    parrafos: [
      `El pedido ${p.numero} recibió un pago que no se pudo aplicar solo (llegó tarde y no hay stock, o el monto no coincide). Hay que reembolsar o reponer.`,
      link(panel(p, sitio), 'Abrir en el panel'),
    ],
  }),
  aviso_postventa: (p, _c, sitio) => ({
    asunto: `Solicitud de post-venta: ${p.numero}`,
    parrafos: [`${h(p.nombre)} inició una solicitud sobre el pedido ${p.numero}.`, link(panel(p, sitio), 'Abrir en el panel')],
  }),
};

export function armarEmail(tipo: string, p: PedidoCompleto, c: Configuracion, sitio: string) {
  const plantilla = PLANTILLAS[tipo];
  if (!plantilla) return null;
  const { asunto, parrafos } = plantilla(p, c, sitio);
  const detalle = tipo.startsWith('aviso_')
    ? ''
    : `<ul>${p.items.map((i) => `<li>${i.cantidad} × ${h(i.nombre_producto)}${i.talle ? `, talle ${h(i.talle)}` : ''}${i.color ? `, ${h(i.color)}` : ''}</li>`).join('')}</ul>`;
  const html = `<div style="font-family:sans-serif;max-width:560px">${parrafos.map((x) => `<p>${x}</p>`).join('')}${detalle}<p>Sukhä</p></div>`;
  return { asunto, html };
}

type FilaEmail = { id: number; pedido_id: number | null; destinatario: string; tipo: string; intentos: number };

// Manda los emails pendientes cuya hora llegó. Lo llaman la tarea programada y, sin esperar, cada pedido nuevo.
// Sin clave de Resend los emails quedan en cola (así el backend funciona en local sin enviar nada).
export async function procesarCola(env: Env, limite: number) {
  if (!env.RESEND_API_KEY) return 0;
  const d1 = env.DB;
  const { results } = await d1
    .prepare(
      `SELECT id, pedido_id, destinatario, tipo, intentos FROM email_saliente
        WHERE estado = 'pendiente' AND proximo_intento_en <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ORDER BY proximo_intento_en LIMIT ?`,
    )
    .bind(limite)
    .all<FilaEmail>();
  if (!results.length) return 0;

  const resend = new Resend(env.RESEND_API_KEY);
  const config = await leerConfiguracion(d1);
  let enviados = 0;
  for (const fila of results) {
    const pedido = fila.pedido_id ? await cargarPedido(d1, { id: fila.pedido_id }).catch(() => null) : null;
    const email = pedido && armarEmail(fila.tipo, pedido, config, env.SITE_URL);
    if (!email) {
      await d1.prepare("UPDATE email_saliente SET estado = 'fallido', error = 'Sin plantilla o sin pedido' WHERE id = ?").bind(fila.id).run();
      continue;
    }
    const { error } = await resend.emails.send(
      { from: env.EMAIL_FROM, to: fila.destinatario, subject: email.asunto, html: email.html },
      // Si el envío salió pero no se llegó a registrar, el reintento no manda el email dos veces.
      { idempotencyKey: `email-${fila.id}` },
    );
    if (!error) {
      await d1
        .prepare("UPDATE email_saliente SET estado = 'enviado', enviado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), error = NULL WHERE id = ?")
        .bind(fila.id)
        .run();
      enviados++;
      continue;
    }
    // Tope diario o por segundo de Resend: no cuenta como intento fallido; se frena la tanda y sigue más tarde.
    const sinCupo = /quota|rate_limit/.test(error.name);
    const intentos = fila.intentos + (sinCupo ? 0 : 1);
    const esperaMin = sinCupo ? 60 : Math.min(5 * 2 ** intentos, 24 * 60);
    await d1
      .prepare('UPDATE email_saliente SET estado = ?, intentos = ?, proximo_intento_en = ?, error = ? WHERE id = ?')
      .bind(
        intentos >= MAX_INTENTOS_EMAIL ? 'fallido' : 'pendiente',
        intentos,
        new Date(Date.now() + esperaMin * 60_000).toISOString(),
        `${error.name}: ${error.message}`.slice(0, 300),
        fila.id,
      )
      .run();
    if (sinCupo) break;
  }
  return enviados;
}
