import { TRANSICIONES, type EstadoPedido, sinEmail } from '../compartido';
import { HORAS_PAGO_PENDIENTE } from '../config';
import { ErrorApp, violaCheck } from '../utils/errores';
import { AHORA_SQL } from '../utils/http';
import { registrar } from '../utils/registro';
import { leerConfiguracion } from './configuracion.service';
import { type PedidoCompleto, cargarPedido } from './pedidos.service';

// La máquina de estados (TRANSICIONES) vive en compartido.ts: el panel la usa para ofrecer los botones.

// Devuelve por qué no se puede hacer el cambio, o null si se puede.
export function motivoBloqueo(de: string, a: string, metodoEntrega: string, numeroSeguimiento: string | null): string | null {
  if (!TRANSICIONES[de as EstadoPedido]?.includes(a as EstadoPedido)) return `Un pedido "${de}" no puede pasar a "${a}".`;
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


export type CambioEstado = {
  a: string;
  adminId?: number | null; // null = cambio automático
  nota?: string | null;
  numeroSeguimiento?: string | null;
  devolverStock?: boolean;
  avisarA?: string | null; // además, el aviso "a revisar" a este email (la nota del cambio es el motivo)
};

// Aplica un cambio de estado con todos sus efectos (stock, cupón, pagos, historial, emails) en un solo lote.
// Cada sentencia lleva la condición "el pedido sigue en el estado esperado" y la que cambia el estado va última:
// si dos cambios llegan a la vez (dos avisos de Mercado Pago, o el vencimiento y un pago), solo uno se aplica.
// Devuelve el pedido actualizado.
export async function cambiarEstado(env: Env, pedido: PedidoCompleto, cambio: CambioEstado) {
  await aplicarEstado(env, pedido, cambio);
  return cargarPedido(env.DB, { id: pedido.id });
}

// Lo mismo sin volver a leer el pedido: ahorra 2 consultas cuando quien llama no lo necesita (tarea programada, webhook).
export async function aplicarEstado(env: Env, pedido: PedidoCompleto, cambio: CambioEstado) {
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
  if (EMAIL_CLIENTA[a] && !sinEmail(pedido.email)) encolar(EMAIL_CLIENTA[a], pedido.email);
  if (AVISO_ADMIN[a]) {
    const { email_avisos } = await leerConfiguracion(d1);
    if (email_avisos) encolar(AVISO_ADMIN[a], email_avisos);
  }
  if (cambio.avisarA && AVISO_ADMIN[a] !== 'aviso_a_revisar') encolar('aviso_a_revisar', cambio.avisarA);

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
  registrar('info', 'cambio_de_estado', { pedido: pedido.numero, de, a, automatico: !cambio.adminId });
}

// Algo pasó con el pago que no cambia el estado solo (pago doble, contracargo, reembolso desde Mercado Pago):
// queda una nota en el historial (mismo estado antes y después) y le llega el aviso "a revisar" a la dueña.
export async function anotarParaRevisar(env: Env, pedido: PedidoCompleto, nota: string) {
  const d1 = env.DB;
  const { email_avisos } = await leerConfiguracion(d1);
  const sentencias = [
    d1
      .prepare('INSERT INTO historial_estado (pedido_id, estado_anterior, estado_nuevo, nota) VALUES (?, ?, ?, ?)')
      .bind(pedido.id, pedido.estado, pedido.estado, nota),
  ];
  if (email_avisos) {
    sentencias.push(
      d1.prepare("INSERT INTO email_saliente (pedido_id, destinatario, tipo) VALUES (?, ?, 'aviso_a_revisar')").bind(pedido.id, email_avisos),
    );
  }
  await d1.batch(sentencias);
  registrar('warn', 'pedido_a_revisar', { pedido: pedido.numero, nota });
}

// Cancela los pedidos cuya reserva venció sin pago. Si Mercado Pago tiene un pago en proceso
// (por ejemplo, una tarjeta en revisión), se espera su aviso; pasadas HORAS_PAGO_PENDIENTE se cancela igual,
// se libera el stock y se avisa a la dueña. Si el pago se aprueba después, entra como pago tardío (ver pagos.service).
export async function vencerReservas(env: Env, limite: number) {
  const pendiente = `SELECT 1 FROM pago WHERE pedido_id = p.id AND proveedor = 'mercadopago' AND estado = 'pendiente'`;
  const { results } = await env.DB.prepare(
    `SELECT id, EXISTS (${pendiente}) AS con_pago_pendiente FROM pedido p
      WHERE estado = 'pendiente_pago' AND reserva_vence_en < ${AHORA_SQL}
        AND NOT EXISTS (${pendiente} AND creado_en > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${HORAS_PAGO_PENDIENTE} hours'))
      ORDER BY reserva_vence_en LIMIT ?`,
  )
    .bind(limite)
    .all<{ id: number; con_pago_pendiente: number }>();
  // La configuración se lee una sola vez y solo si hace falta avisar.
  const avisos = results.some((r) => r.con_pago_pendiente) ? (await leerConfiguracion(env.DB)).email_avisos : null;
  let cancelados = 0;
  for (const { id, con_pago_pendiente } of results) {
    const cambio = con_pago_pendiente
      ? {
          a: 'cancelado',
          nota: `El pago de Mercado Pago siguió pendiente más de ${HORAS_PAGO_PENDIENTE} horas: se canceló el pedido y se liberó el stock.`,
          avisarA: avisos,
        }
      : { a: 'cancelado', nota: 'Reserva vencida sin pago.' };
    try {
      await aplicarEstado(env, await cargarPedido(env.DB, { id }), cambio);
      cancelados++;
    } catch (e) {
      // Si justo entró el pago, el cambio ya no corresponde: se sigue con los demás.
      if (!(e instanceof ErrorApp)) throw e;
    }
  }
  return cancelados;
}
