import { Resend } from 'resend';
import { HORAS_EMAIL_ATRASADO, MAX_INTENTOS_EMAIL, RESERVA_EMAILS_PEDIDOS, TOPE_EMAILS_DIA } from '../config';
import { registrar } from '../utils/registro';
import { enPesos, escaparHtml as h } from '../utils/texto';
import { type Configuracion } from '../validations/tienda.validation';
import { alertar } from './alertas.service';
import { leerConfiguracion } from './configuracion.service';
import { type PedidoCompleto, cargarPedido } from './pedidos.service';
import { PLANTILLAS as EDITABLES, asuntoCon, htmlDe, plantillaDelPedido, textoDe, valoresDelPedido } from './plantillas.service';

// Plantillas en código. Cada una devuelve asunto y párrafos; el armado del HTML es común.
type Plantilla = (p: PedidoCompleto, c: Configuracion, sitio: string) => { asunto: string; parrafos: string[] };

const link = (url: string, texto: string) => `<a href="${h(url)}">${h(texto)}</a>`;
const seguimiento = (p: PedidoCompleto, sitio: string) => `${sitio}/pedido/${p.token_seguimiento}`;
const panel = (p: PedidoCompleto, sitio: string) => `${sitio}/admin/pedidos/${p.id}`;

// Los emails a la clienta salen de las plantillas editables (plantillas.service); los avisos internos quedan en código.
const PLANTILLAS: Record<string, Plantilla> = {
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
  // El motivo es la última nota automática del historial (pago tardío sin stock, monto distinto, pago doble,
  // contracargo, reembolso o pago pendiente vencido).
  aviso_a_revisar: (p, _c, sitio) => {
    const motivo = [...p.historial].reverse().find((x) => !x.admin_id && x.nota)?.nota;
    return {
      asunto: `Pedido a revisar: ${p.numero}`,
      parrafos: [
        `Hay que revisar el pedido ${p.numero}.${motivo ? ` ${h(String(motivo))}` : ''}`,
        link(panel(p, sitio), 'Abrir en el panel'),
      ],
    };
  },
  aviso_postventa: (p, _c, sitio) => ({
    asunto: `Solicitud de post-venta: ${p.numero}`,
    parrafos: [`${h(p.nombre)} inició una solicitud sobre el pedido ${p.numero}.`, link(panel(p, sitio), 'Abrir en el panel')],
  }),
};

// Arma el HTML común: el cuerpo, el detalle de las prendas (en los emails a la clienta) y la firma.
export function envolverEmail(cuerpo: string, items: { cantidad: number; nombre_producto: string; talle: string | null; color: string | null }[] | null) {
  const detalle = items ? `<ul>${items.map((i) => `<li>${i.cantidad} × ${h(i.nombre_producto)}${i.talle ? `, talle ${h(i.talle)}` : ''}${i.color ? `, ${h(i.color)}` : ''}</li>`).join('')}</ul>` : '';
  return `<div style="font-family:sans-serif;max-width:560px">${cuerpo}${detalle}<p>Sukhä</p></div>`;
}

export function armarEmail(tipo: string, p: PedidoCompleto, c: Configuracion, sitio: string) {
  const editable = plantillaDelPedido(tipo, p.metodo_pago);
  if (EDITABLES[editable]) {
    const { asunto, texto } = textoDe(editable, c.plantillas_email);
    const valores = valoresDelPedido(p, c, sitio);
    return { asunto: asuntoCon(asunto, valores), html: envolverEmail(htmlDe(texto, valores), p.items) };
  }
  const plantilla = PLANTILLAS[tipo];
  if (!plantilla) return null;
  const { asunto, parrafos } = plantilla(p, c, sitio);
  return { asunto, html: envolverEmail(parrafos.map((x) => `<p>${x}</p>`).join(''), tipo.startsWith('aviso_') ? null : p.items) };
}

type FilaEmail = { id: number; pedido_id: number | null; destinatario: string; tipo: string; intentos: number };

// Los emails de marketing se reconocen por el tipo: "marketing_recordatorio_pago", "marketing_newsletter"…
const ES_MARKETING = "tipo LIKE 'marketing!_%' ESCAPE '!'";

// Los emails pendientes cuya hora llegó, primero los de pedidos. Los de marketing quedan esperando si en las últimas
// 24 horas ya salieron TOPE_EMAILS_DIA - RESERVA_EMAILS_PEDIDOS: el resto del cupo diario de Resend es para las compras.
export async function emailsParaMandar(d1: D1Database, limite: number) {
  const { results } = await d1
    .prepare(
      `SELECT id, pedido_id, destinatario, tipo, intentos FROM email_saliente
        WHERE estado = 'pendiente' AND proximo_intento_en <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          AND (NOT ${ES_MARKETING} OR (SELECT count(*) FROM email_saliente
                WHERE estado = 'enviado' AND enviado_en > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')) < ?)
        ORDER BY ${ES_MARKETING}, proximo_intento_en LIMIT ?`,
    )
    .bind(TOPE_EMAILS_DIA - RESERVA_EMAILS_PEDIDOS, limite)
    .all<FilaEmail>();
  return results;
}

// Manda los emails pendientes cuya hora llegó. Lo llaman la tarea programada y, sin esperar, cada pedido nuevo.
// Sin clave de Resend los emails quedan en cola (así el backend funciona en local sin enviar nada).
export async function procesarCola(env: Env, limite: number) {
  if (!env.RESEND_API_KEY) return 0;
  const d1 = env.DB;
  const results = await emailsParaMandar(d1, limite);
  if (!results.length) return 0;

  const resend = new Resend(env.RESEND_API_KEY);
  const config = await leerConfiguracion(d1);
  let enviados = 0;
  for (const fila of results) {
    const pedido = fila.pedido_id ? await cargarPedido(d1, { id: fila.pedido_id }).catch(() => null) : null;
    const email = pedido && armarEmail(fila.tipo, pedido, config, env.SITE_URL);
    const numero = pedido?.numero ?? null;
    if (!email) {
      await d1.prepare("UPDATE email_saliente SET estado = 'fallido', error = 'Sin plantilla o sin pedido' WHERE id = ?").bind(fila.id).run();
      await alertar(env, 'emails', `No se pudo armar el email "${fila.tipo}"${numero ? ` del pedido ${numero}` : ''}: falta la plantilla o el pedido.`);
      continue;
    }
    const { error } = await resend.emails.send(
      { from: env.EMAIL_FROM, to: fila.destinatario, subject: email.asunto, html: email.html },
      // Si el envío salió pero no se llegó a registrar, el reintento no manda el email dos veces. La clave lleva el número de
      // intento: Resend recuerda el cuerpo 24 h y, si el email cambió entre intentos, rechazaría todos los siguientes.
      { idempotencyKey: `email-${fila.id}-${fila.intentos}` },
    );
    if (!error) {
      await d1
        .prepare("UPDATE email_saliente SET estado = 'enviado', enviado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), error = NULL WHERE id = ?")
        .bind(fila.id)
        .run();
      registrar('info', 'email_enviado', { pedido: numero, tipo: fila.tipo });
      enviados++;
      continue;
    }
    // Tope diario o por segundo de Resend: no cuenta como intento fallido; se frena la tanda y sigue más tarde.
    const sinCupo = /quota|rate_limit/.test(error.name);
    const intentos = fila.intentos + (sinCupo ? 0 : 1);
    const esperaMin = sinCupo ? 60 : Math.min(5 * 2 ** intentos, 24 * 60);
    const fallido = intentos >= MAX_INTENTOS_EMAIL;
    const motivo = `${error.name}: ${error.message}`.slice(0, 300);
    registrar(fallido ? 'error' : 'warn', fallido ? 'email_fallido' : 'email_reintento', { pedido: numero, tipo: fila.tipo, intentos, error: motivo });
    await d1
      .prepare('UPDATE email_saliente SET estado = ?, intentos = ?, proximo_intento_en = ?, error = ? WHERE id = ?')
      .bind(
        fallido ? 'fallido' : 'pendiente',
        intentos,
        new Date(Date.now() + esperaMin * 60_000).toISOString(),
        motivo,
        fila.id,
      )
      .run();
    if (fallido) {
      await alertar(
        env,
        'emails',
        `El email "${fila.tipo}"${numero ? ` del pedido ${numero}` : ''} para ${fila.destinatario} no salió después de ${intentos} intentos (${motivo}).`,
      );
    }
    if (sinCupo) break;
  }
  return enviados;
}

// Emails que siguen en la cola pasado HORAS_EMAIL_ATRASADO (Resend sin cupo o caído, la clave mal cargada…): se avisa.
// Los de marketing no cuentan: esperar es lo normal para ellos cuando el cupo del día se usa en pedidos.
export async function revisarAtrasados(env: Env) {
  const fila = await env.DB.prepare(
    `SELECT count(*) AS n, min(creado_en) AS desde FROM email_saliente
      WHERE estado = 'pendiente' AND NOT ${ES_MARKETING} AND creado_en < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${HORAS_EMAIL_ATRASADO} hours')`,
  ).first<{ n: number; desde: string | null }>();
  if (!fila?.n) return 0;
  await alertar(env, 'emails', `Hay ${fila.n} email${fila.n === 1 ? '' : 's'} de pedidos esperando para salir hace más de ${HORAS_EMAIL_ATRASADO} horas (el más viejo, del ${fila.desde}).`);
  return fila.n;
}
