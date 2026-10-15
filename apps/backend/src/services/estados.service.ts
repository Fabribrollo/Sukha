import { ErrorApp, violaCheck } from '../utils/errores';
import { leerConfiguracion } from './configuracion.service';
import { type PedidoCompleto, cargarPedido } from './pedidos.service';

// Máquina de estados del pedido. Antes del pago la única salida es cancelar; después solo avanza o se reembolsa.
// "a_revisar" es para pagos que llegaron y no se pudieron aplicar solos (reserva vencida sin stock, monto distinto):
// un pedido en ese estado nunca tiene stock reservado.
export const TRANSICIONES: Record<string, string[]> = {
  pendiente_pago: ['pagado', 'cancelado'],
  pagado: ['en_preparacion', 'reembolsado'],
  en_preparacion: ['enviado', 'listo_para_retirar', 'reembolsado'],
  enviado: ['entregado', 'reembolsado'],
  listo_para_retirar: ['entregado', 'reembolsado'],
  entregado: ['reembolsado'],
  cancelado: ['pagado', 'a_revisar'],
  a_revisar: ['pagado', 'reembolsado', 'cancelado'],
  reembolsado: [],
};

// Devuelve por qué no se puede hacer el cambio, o null si se puede.
export function motivoBloqueo(de: string, a: string, metodoEntrega: string, numeroSeguimiento: string | null): string | null {
  if (!TRANSICIONES[de]?.includes(a)) return `Un pedido "${de}" no puede pasar a "${a}".`;
  if (a === 'enviado' && metodoEntrega === 'retiro') return 'Este pedido es con retiro: no se envía.';
  if (a === 'enviado' && !numeroSeguimiento) return 'Para marcarlo como enviado hace falta el número de seguimiento.';
  if (a === 'listo_para_retirar' && metodoEntrega !== 'retiro') return 'Este pedido es con envío: no se retira.';
  return null;
}

// Email que recibe la clienta al entrar a cada estado.
const EMAIL_CLIENTA: Record<string, string> = {
  pagado: 'pago_aprobado',
  enviado: 'pedido_enviado',
  listo_para_retirar: 'listo_para_retirar',
  cancelado: 'pedido_cancelado',
  reembolsado: 'pedido_reembolsado',
};
// Aviso que recibe la dueña.
const AVISO_ADMIN: Record<string, string> = { pagado: 'aviso_nueva_venta', a_revisar: 'aviso_a_revisar' };

const AHORA_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

export type CambioEstado = {
  a: string;
  adminId?: number | null; // null = cambio automático
  nota?: string | null;
  numeroSeguimiento?: string | null;
  devolverStock?: boolean;
};

// Aplica un cambio de estado con todos sus efectos (stock, cupón, pagos, historial, emails) en un solo lote.
// Cada sentencia lleva la condición "el pedido sigue en el estado esperado" y la que cambia el estado va última:
// si dos cambios llegan a la vez (dos avisos de Mercado Pago, o el vencimiento y un pago), solo uno se aplica.
export async function cambiarEstado(env: Env, pedido: PedidoCompleto, cambio: CambioEstado) {
  const d1 = env.DB;
  const de = pedido.estado;
  const { a } = cambio;
  const seguimiento = cambio.numeroSeguimiento ?? pedido.numero_seguimiento;
  const bloqueo = motivoBloqueo(de, a, pedido.metodo_entrega, seguimiento);
  if (bloqueo) throw new ErrorApp(409, bloqueo);

  const id = pedido.id;
  const SIGUE = '(SELECT estado FROM pedido WHERE id = ?) = ?';
  const sentencias: D1PreparedStatement[] = [];

  // Mueve el stock de todas las prendas del pedido y lo anota en el libro.
  const moverStock = (signo: 1 | -1, tipo: string) => {
    for (const item of pedido.items) {
      const delta = signo * item.cantidad;
      sentencias.push(
        d1
          .prepare(`UPDATE variante SET stock = stock + ?, actualizado_en = ${AHORA_SQL} WHERE id = ? AND ${SIGUE}`)
          .bind(delta, item.variante_id, id, de),
        d1
          .prepare(`INSERT INTO movimiento_stock (variante_id, pedido_id, admin_id, tipo, cantidad) SELECT ?, ?, ?, ?, ? WHERE ${SIGUE}`)
          .bind(item.variante_id, id, cambio.adminId ?? null, tipo, delta, id, de),
      );
    }
  };

  if (a === 'cancelado' && de === 'pendiente_pago') {
    // Se libera la reserva y se devuelve el uso del cupón.
    moverStock(1, 'liberacion');
    sentencias.push(
      d1
        .prepare(
          `UPDATE cupon SET usos = usos - 1
            WHERE id IN (SELECT cupon_id FROM pedido_descuento WHERE pedido_id = ? AND cupon_id IS NOT NULL) AND usos > 0 AND ${SIGUE}`,
        )
        .bind(id, id, de),
      d1
        .prepare(`UPDATE pago SET estado = 'rechazado', actualizado_en = ${AHORA_SQL} WHERE pedido_id = ? AND estado = 'pendiente' AND ${SIGUE}`)
        .bind(id, id, de),
    );
  }
  if (a === 'pagado') {
    // Viniendo de cancelado o a revisar no hay stock reservado: hay que volver a tomarlo.
    // Si no alcanza, la base rechaza el lote entero y el pedido queda como estaba.
    if (de !== 'pendiente_pago') moverStock(-1, 'reserva');
    sentencias.push(
      d1
        .prepare(
          `UPDATE pago SET estado = 'aprobado', actualizado_en = ${AHORA_SQL}
            WHERE pedido_id = ? AND proveedor = 'transferencia' AND estado IN ('pendiente', 'rechazado') AND ${SIGUE}`,
        )
        .bind(id, id, de),
    );
  }
  if (a === 'reembolsado') {
    // Un pedido "a revisar" no tiene stock tomado, así que no hay nada que devolver.
    if (cambio.devolverStock && de !== 'a_revisar') moverStock(1, 'devolucion');
    sentencias.push(
      d1
        .prepare(`UPDATE pago SET estado = 'reembolsado', actualizado_en = ${AHORA_SQL} WHERE pedido_id = ? AND estado = 'aprobado' AND ${SIGUE}`)
        .bind(id, id, de),
    );
  }

  sentencias.push(
    d1
      .prepare(`INSERT INTO historial_estado (pedido_id, admin_id, estado_anterior, estado_nuevo, nota) SELECT ?, ?, ?, ?, ? WHERE ${SIGUE}`)
      .bind(id, cambio.adminId ?? null, de, a, cambio.nota ?? null, id, de),
  );
  const encolar = (tipo: string, destinatario: string) =>
    sentencias.push(
      d1
        .prepare(`INSERT INTO email_saliente (pedido_id, destinatario, tipo) SELECT ?, ?, ? WHERE ${SIGUE}`)
        .bind(id, destinatario, tipo, id, de),
    );
  if (EMAIL_CLIENTA[a]) encolar(EMAIL_CLIENTA[a], pedido.email);
  if (AVISO_ADMIN[a]) {
    const { email_avisos } = await leerConfiguracion(d1);
    if (email_avisos) encolar(AVISO_ADMIN[a], email_avisos);
  }

  // Última: el cambio de estado en sí. Si no modifica ninguna fila, otro cambio ganó la carrera.
  sentencias.push(
    d1
      .prepare(`UPDATE pedido SET estado = ?, numero_seguimiento = ?, actualizado_en = ${AHORA_SQL} WHERE id = ? AND estado = ?`)
      .bind(a, seguimiento, id, de),
  );

  let resultados: D1Result[];
  try {
    resultados = await d1.batch(sentencias);
  } catch (e) {
    if (violaCheck(e, 'stock')) throw new ErrorApp(409, 'No hay stock suficiente para reactivar este pedido.');
    throw e;
  }
  if (!resultados.at(-1)!.meta.changes) throw new ErrorApp(409, 'El pedido cambió de estado mientras tanto. Volvé a cargarlo.');
  return cargarPedido(d1, { id });
}

// Cancela los pedidos cuya reserva venció sin pago. Si Mercado Pago tiene un pago en proceso
// (por ejemplo, efectivo en Rapipago), se espera su aviso en lugar de cancelar.
export async function vencerReservas(env: Env, limite: number) {
  const { results } = await env.DB.prepare(
    `SELECT id FROM pedido p
      WHERE estado = 'pendiente_pago' AND reserva_vence_en < ${AHORA_SQL}
        AND NOT EXISTS (SELECT 1 FROM pago WHERE pedido_id = p.id AND proveedor = 'mercadopago' AND estado = 'pendiente')
      ORDER BY reserva_vence_en LIMIT ?`,
  )
    .bind(limite)
    .all<{ id: number }>();
  let cancelados = 0;
  for (const { id } of results) {
    try {
      await cambiarEstado(env, await cargarPedido(env.DB, { id }), { a: 'cancelado', nota: 'Reserva vencida sin pago.' });
      cancelados++;
    } catch (e) {
      // Si justo entró el pago, el cambio ya no corresponde: se sigue con los demás.
      if (!(e instanceof ErrorApp)) throw e;
    }
  }
  return cancelados;
}
