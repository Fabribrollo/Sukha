import type { z } from 'zod';
import { ErrorApp, noEncontrado } from '../utils/errores';
import { nuevoToken } from '../utils/crypto';
import type { EdicionSolicitud, NuevaSolicitud } from '../validations/tienda.validation';
import { leerConfiguracion } from './configuracion.service';
import { cargarPedido } from './pedidos.service';

// Arrepentimiento, cambio o devolución. La inicia la clienta desde el seguimiento de su pedido;
// queda registrada para el panel y avisa por email. El reembolso en sí se hace desde Mercado Pago o por transferencia.
const ESTADOS_CON_POSTVENTA = ['pagado', 'en_preparacion', 'enviado', 'listo_para_retirar', 'entregado'];

export async function crearSolicitud(env: Env, token: string, d: z.infer<typeof NuevaSolicitud>) {
  const d1 = env.DB;
  const pedido = await cargarPedido(d1, { token });
  if (!ESTADOS_CON_POSTVENTA.includes(pedido.estado)) {
    throw new ErrorApp(409, 'Este pedido no admite solicitudes en su estado actual.');
  }
  // Sin detalle, la solicitud abarca todo el pedido.
  const items = d.items.length ? d.items : pedido.items.map((i) => ({ pedidoItemId: i.id, cantidad: i.cantidad }));
  for (const item of items) {
    const original = pedido.items.find((i) => i.id === item.pedidoItemId);
    if (!original || item.cantidad > original.cantidad) throw new ErrorApp(400, 'Las prendas indicadas no coinciden con el pedido.');
  }

  const solicitud = await d1
    .prepare('INSERT INTO solicitud_postventa (pedido_id, tipo, motivo) VALUES (?, ?, ?) RETURNING id')
    .bind(pedido.id, d.tipo, d.motivo)
    .first<{ id: number }>();
  const { email_avisos } = await leerConfiguracion(d1);
  await d1.batch([
    ...items.map((i) =>
      d1.prepare('INSERT INTO solicitud_item (solicitud_id, pedido_item_id, cantidad) VALUES (?, ?, ?)').bind(solicitud!.id, i.pedidoItemId, i.cantidad),
    ),
    ...(email_avisos
      ? [d1.prepare("INSERT INTO email_saliente (pedido_id, destinatario, tipo) VALUES (?, ?, 'aviso_postventa')").bind(pedido.id, email_avisos)]
      : []),
  ]);
  return { id: solicitud!.id, numero: pedido.numero };
}

export async function listarSolicitudes(d1: D1Database, estado?: string) {
  const { results } = await d1
    .prepare(
      `SELECT s.*, p.nombre, p.email, p.total_centavos,
              (SELECT json_group_array(json_object('pedidoItemId', si.pedido_item_id, 'cantidad', si.cantidad, 'nombre', pi.nombre_producto, 'talle', pi.talle, 'color', pi.color))
                 FROM solicitud_item si JOIN pedido_item pi ON pi.id = si.pedido_item_id WHERE si.solicitud_id = s.id) AS items
         FROM solicitud_postventa s JOIN pedido p ON p.id = s.pedido_id
        WHERE (?1 IS NULL OR s.estado = ?1) ORDER BY s.id DESC LIMIT 200`,
    )
    .bind(estado ?? null)
    .all<Record<string, unknown>>();
  return results.map((s) => ({ ...s, items: JSON.parse(s.items as string) }));
}

export async function editarSolicitud(d1: D1Database, id: number, d: z.infer<typeof EdicionSolicitud>) {
  const fila = await d1
    .prepare(
      `UPDATE solicitud_postventa
          SET estado = coalesce(?, estado),
              reembolso_centavos = CASE WHEN ? THEN ? ELSE reembolso_centavos END,
              actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ? RETURNING *`,
    )
    .bind(d.estado ?? null, d.reembolsoCentavos !== undefined ? 1 : 0, d.reembolsoCentavos ?? null, id)
    .first();
  if (!fila) throw noEncontrado('la solicitud');
  return fila;
}

// ───────────── Novedades (newsletter) ─────────────

export async function suscribir(d1: D1Database, email: string) {
  await d1
    .prepare(
      `INSERT INTO clienta (email, acepta_novedades, acepta_novedades_en, token_baja)
       VALUES (?1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?2)
       ON CONFLICT (email) DO UPDATE SET
         acepta_novedades_en = CASE WHEN clienta.acepta_novedades = 0 THEN excluded.acepta_novedades_en ELSE clienta.acepta_novedades_en END,
         acepta_novedades = 1`,
    )
    .bind(email, nuevoToken())
    .run();
}

export async function darDeBaja(d1: D1Database, tokenBaja: string) {
  const r = await d1.prepare('UPDATE clienta SET acepta_novedades = 0 WHERE token_baja = ?').bind(tokenBaja).run();
  if (!r.meta.changes) throw noEncontrado('la suscripción');
}
