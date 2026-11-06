import { Resend } from 'resend';
import { HORAS_ENTRE_ALERTAS } from '../config';
import { ahora } from '../utils/http';
import { registrar } from '../utils/registro';
import { escaparHtml as h } from '../utils/texto';
import { leerConfiguracion } from './configuracion.service';

// Después de una venta: si alguna prenda publicada quedó con el stock en el límite o por debajo, avisa por email (una vez por día).
// Una consulta por venta; el turno diario lo toma `alertar`.
export async function avisarStockBajo(env: Env) {
  try {
    const { stock_bajo_umbral, email_avisos } = await leerConfiguracion(env.DB);
    if (!email_avisos) return;
    const { results } = await env.DB.prepare(
      `SELECT p.nombre AS producto, t.nombre AS talle, c.nombre AS color, v.stock
         FROM variante v JOIN producto p ON p.id = v.producto_id
         LEFT JOIN talle t ON t.id = v.talle_id LEFT JOIN color c ON c.id = v.color_id
        WHERE v.activa = 1 AND p.estado = 'publicado' AND v.stock <= ? ORDER BY v.stock, p.nombre LIMIT 15`,
    ).bind(stock_bajo_umbral).all<{ producto: string; talle: string | null; color: string | null; stock: number }>();
    if (!results.length) return;
    const lista = results.map((v) => `${v.producto}${[v.talle, v.color].filter(Boolean).length ? ` (${[v.talle, v.color].filter(Boolean).join(' · ')})` : ''}: ${v.stock === 0 ? 'agotado' : `quedan ${v.stock}`}`).join('; ');
    await alertar(env, 'stock', lista);
  } catch (e) {
    registrar('error', 'stock_bajo_no_revisado', { error: String(e) });
  }
}

// Avisos a la dueña cuando falla algo del sistema y no de un pedido en particular: un aviso de Mercado Pago que no se pudo
// procesar, emails que no salen o un paso de la tarea programada. Sin esto, un error en producción solo se ve si alguien
// mira los registros.
export type Alerta = 'webhook' | 'firma' | 'emails' | 'tarea' | 'stock';

const ASUNTOS: Record<Alerta, string> = {
  webhook: 'Falló un aviso de pago de Mercado Pago',
  firma: 'Llegó un aviso de pago con firma inválida',
  emails: 'Hay emails de la tienda que no salen',
  tarea: 'Falló la tarea automática de la tienda',
  stock: 'Quedan pocas unidades de algunas prendas',
};

const QUE_HACER: Record<Alerta, string> = {
  webhook: 'Mercado Pago lo va a reintentar solo. Si el problema sigue, revisá en Mercado Pago que el pago figure en el pedido del panel.',
  firma: 'Puede ser un intento falso (no pasa nada: se rechazó) o la clave del webhook de Mercado Pago mal cargada. Si los pagos no se aprueban solos en el panel, revisá esa clave.',
  emails: 'Revisá en el panel el pedido que se menciona y, si hace falta, escribile a la clienta a mano.',
  tarea: 'La tarea vuelve a correr en 5 minutos. Si este aviso se repite, hay que revisarlo.',
  stock: 'Cargá stock desde Productos o pausá la prenda si no vas a reponerla. El límite se cambia en Configuración.',
};
// Cada cuántas horas puede repetirse un aviso: el de stock, una vez por día; los de fallas, cada HORAS_ENTRE_ALERTAS.
const HORAS: Partial<Record<Alerta, number>> = { stock: 24 };

// Manda el aviso a `email_avisos` directo por Resend, sin pasar por la cola (si la cola es lo que falla, no llegaría).
// Como mucho uno cada HORAS_ENTRE_ALERTAS por tipo, para no gastar el tope de 100 emails por día: el turno se guarda en
// `cache_externa` (clave "alerta:tipo"), que ya tiene vencimiento y limpieza. Siempre queda en los registros.
// Nunca falla: un aviso que no se pudo mandar no puede romper lo que estaba haciendo quien llama.
export async function alertar(env: Env, tipo: Alerta, detalle: string) {
  registrar('error', 'alerta', { tipo, detalle });
  try {
    if (!env.RESEND_API_KEY) return false;
    const horas = HORAS[tipo] ?? HORAS_ENTRE_ALERTAS;
    const vence = new Date(Date.now() + horas * 3_600_000).toISOString();
    // Toma el turno solo si no hay otro vigente del mismo tipo (si dos fallas llegan juntas, una sola gana).
    const { meta } = await env.DB.prepare(
      `INSERT INTO cache_externa (clave, valor, vence_en) VALUES (?, ?, ?)
       ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, vence_en = excluded.vence_en WHERE cache_externa.vence_en < ?`,
    )
      .bind(`alerta:${tipo}`, detalle.slice(0, 500), vence, ahora())
      .run();
    if (!meta.changes) return false;
    const { email_avisos } = await leerConfiguracion(env.DB);
    if (!email_avisos) return false;
    const { error } = await new Resend(env.RESEND_API_KEY).emails.send({
      from: env.EMAIL_FROM,
      to: email_avisos,
      subject: `Aviso de la tienda: ${ASUNTOS[tipo]}`,
      html: `<div style="font-family:sans-serif;max-width:560px"><p>${h(detalle)}</p><p>${h(QUE_HACER[tipo])}</p>
        <p style="color:#666">Si vuelve a pasar en las próximas ${horas} horas no llega otro aviso.</p><p>Sukhä</p></div>`,
    });
    if (error) registrar('error', 'alerta_no_enviada', { tipo, error: `${error.name}: ${error.message}` });
    return !error;
  } catch (e) {
    registrar('error', 'alerta_no_enviada', { tipo, error: String(e) });
    return false;
  }
}
