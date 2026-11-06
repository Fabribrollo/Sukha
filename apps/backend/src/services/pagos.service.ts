import { ErrorApp } from '../utils/errores';
import { registrar } from '../utils/registro';
import { leerConfiguracion } from './configuracion.service';
import { enPesos, numeroPedido } from '../utils/texto';
import { type Configuracion } from '../validations/tienda.validation';
import { anotarParaRevisar, cambiarEstado } from './estados.service';
import { type PedidoCompleto, cargarPedido } from './pedidos.service';

// Mercado Pago por su API REST (Checkout Pro): la clienta paga en su sitio y la confirmación llega por webhook.
// La tienda nunca ve datos de tarjetas.
const API = 'https://api.mercadopago.com';

// Con `tolerar404`, un 404 (el recurso no existe) devuelve null en lugar de fallar.
async function mp<T>(env: Env, ruta: string, init?: RequestInit, tolerar404 = false): Promise<T> {
  if (!env.MP_ACCESS_TOKEN) throw new ErrorApp(503, 'El pago con Mercado Pago todavía no está configurado.');
  const r = await fetch(`${API}${ruta}`, {
    ...init,
    headers: { authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, 'content-type': 'application/json', ...init?.headers },
  });
  if (tolerar404 && r.status === 404) return null as T;
  if (!r.ok) {
    registrar('error', 'mercadopago_error', { ruta: ruta.split('?')[0], estado: r.status, respuesta: (await r.text()).slice(0, 300) });
    throw new ErrorApp(502, 'Mercado Pago no respondió. Probá de nuevo en un momento.');
  }
  return r.json();
}

// Crea la preferencia de pago y devuelve la dirección a la que hay que mandar a la clienta.
// Si quien llama ya leyó la configuración, la pasa y no se vuelve a leer.
export async function crearPreferencia(env: Env, pedido: PedidoCompleto, configLeida?: Configuracion) {
  if (pedido.estado !== 'pendiente_pago' || pedido.metodo_pago !== 'mercadopago') {
    throw new ErrorApp(409, 'Este pedido no está esperando un pago con Mercado Pago.');
  }
  const seguimiento = `${env.SITE_URL}/pedido/${pedido.token_seguimiento}`;
  const config = configLeida ?? (await leerConfiguracion(env.DB));
  const preferencia = await mp<{ init_point: string }>(env, '/checkout/preferences', {
    method: 'POST',
    // Reintentar con el mismo pedido y el mismo vencimiento no crea preferencias distintas.
    headers: { 'x-idempotency-key': `${pedido.id}-${pedido.reserva_vence_en}` },
    body: JSON.stringify({
      // Una sola línea por el total: descuentos y envío ya están calculados por la tienda.
      items: [
        {
          id: String(pedido.id),
          title: `Pedido ${numeroPedido(pedido.id)} en Sukhä`,
          quantity: 1,
          currency_id: 'ARS',
          unit_price: pedido.total_centavos / 100,
        },
      ],
      // Se ofrecen todos los medios (débito, crédito, dinero en cuenta) menos efectivo: el pedido reserva stock y el pago en
      // efectivo tarda días. Con las cuotas apagadas se paga en un solo pago; encendidas, hasta la cantidad configurada.
      payment_methods: {
        excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
        installments: config.cuotas_sin_interes ? config.cuotas_cantidad : 1,
      },
      payer: { name: pedido.nombre, email: pedido.email },
      external_reference: String(pedido.id),
      notification_url: `${env.SITE_URL}/api/webhooks/mercadopago`,
      back_urls: { success: seguimiento, pending: seguimiento, failure: seguimiento },
      auto_return: 'approved',
      // Pasada la reserva ya no se puede pagar: el stock vuelve a estar a la venta.
      expires: true,
      expiration_date_to: pedido.reserva_vence_en,
      date_of_expiration: pedido.reserva_vence_en,
    }),
  });
  return preferencia.init_point;
}

const aHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

// Mercado Pago firma cada aviso: x-signature trae "ts=...,v1=..." y v1 es el HMAC-SHA256 de
// "id:{data.id};request-id:{x-request-id};ts:{ts};" con la clave secreta del webhook.
export async function firmaValida(secreto: string, firma: string | undefined, idSolicitud: string | undefined, idDato: string) {
  const partes = Object.fromEntries((firma ?? '').split(',').map((p) => p.trim().split('=') as [string, string]));
  if (!partes.ts || !partes.v1) return false;
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const texto = `id:${idDato.toLowerCase()};request-id:${idSolicitud ?? ''};ts:${partes.ts};`;
  const esperado = aHex(await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(texto)));
  if (esperado.length !== partes.v1.length) return false;
  let distinto = 0; // comparación en tiempo constante
  for (let i = 0; i < esperado.length; i++) distinto |= esperado.charCodeAt(i) ^ partes.v1.charCodeAt(i);
  return distinto === 0;
}

const ESTADO_PAGO: Record<string, string> = {
  approved: 'aprobado',
  rejected: 'rechazado',
  cancelled: 'rechazado',
  refunded: 'reembolsado',
  charged_back: 'reembolsado',
};

type PagoMp = {
  id: number;
  status: string;
  status_detail: string;
  external_reference: string | null;
  transaction_amount: number;
  currency_id: string;
  payment_method_id: string;
};

// Procesa el aviso de un pago. Nunca se confía en el contenido del aviso: se consulta el pago a Mercado Pago.
// Es idempotente: el mismo aviso puede llegar varias veces sin duplicar pagos ni cambios de estado.
export async function procesarPago(env: Env, idPago: string) {
  // Un aviso de un pago que Mercado Pago no conoce (por ejemplo, la "simulación" del panel) se registra y se da por
  // recibido: si se responde con error, Mercado Pago lo reintenta una y otra vez.
  const pago = await mp<PagoMp | null>(env, `/v1/payments/${encodeURIComponent(idPago)}`, undefined, true);
  if (!pago) {
    registrar('warn', 'pago_inexistente', { pago: idPago });
    return 'pago_inexistente';
  }
  const idPedido = Number(pago.external_reference);
  if (!Number.isInteger(idPedido) || idPedido <= 0) return 'sin_pedido';

  const pedido = await cargarPedido(env.DB, { id: idPedido }).catch(() => null);
  if (!pedido) {
    registrar('warn', 'pago_sin_pedido', { pago: pago.id, referencia: pago.external_reference });
    return 'sin_pedido';
  }

  const estado = ESTADO_PAGO[pago.status] ?? 'pendiente';
  const monto = Math.round(pago.transaction_amount * 100);
  // Cómo estaba este pago antes del aviso: los avisos a la dueña salen solo cuando cambia, no en cada repetición.
  const previo = pedido.pagos.find((p) => p.proveedor === 'mercadopago' && p.id_externo === String(pago.id));
  const cambio = previo?.estado !== estado;
  registrar('info', 'aviso_de_pago', { pedido: pedido.numero, pago: pago.id, estadoMp: pago.status, estadoPedido: pedido.estado, cambio });
  await env.DB.prepare(
    `INSERT INTO pago (pedido_id, proveedor, id_externo, estado, monto_centavos, respuesta_proveedor)
     VALUES (?, 'mercadopago', ?, ?, ?, ?)
     ON CONFLICT (proveedor, id_externo) DO UPDATE SET
       estado = excluded.estado, respuesta_proveedor = excluded.respuesta_proveedor,
       actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  )
    .bind(
      pedido.id,
      String(pago.id),
      estado,
      Math.max(monto, 1),
      // Solo lo necesario para diagnosticar; no se guardan datos personales del pagador.
      JSON.stringify({ status: pago.status, detalle: pago.status_detail, medio: pago.payment_method_id, moneda: pago.currency_id }),
    )
    .run();

  // Ni el pago doble ni la devolución cambian el estado del pedido: lo decide la dueña desde el panel.
  if (cambio && estado === 'aprobado' && pedido.pagos.some((p) => p !== previo && p.estado === 'aprobado')) {
    await anotarParaRevisar(
      env,
      pedido,
      `Llegó un segundo pago aprobado (Mercado Pago ${pago.id}, ${enPesos(monto)}) para un pedido que ya estaba pagado: se cobró dos veces. Devolvé uno desde Mercado Pago.`,
    );
    return 'pago_doble';
  }
  if (cambio && previo?.estado === 'aprobado' && pedido.estado !== 'reembolsado') {
    const que = pago.status === 'charged_back' ? 'un contracargo: la clienta desconoció el pago ante su tarjeta' : 'que el pago se devolvió o se anuló';
    await anotarParaRevisar(env, pedido, `Mercado Pago informó ${que} (pago ${pago.id}). Si el pedido todavía no salió, no lo despaches.`);
    return estado;
  }
  if (estado !== 'aprobado') return estado;

  const auto = { adminId: null };
  try {
    if (monto !== pedido.total_centavos || pago.currency_id !== 'ARS') {
      // Pagó un monto distinto al del pedido: no se aprueba solo. Se libera la reserva y queda para revisar a mano.
      let actual = pedido;
      if (actual.estado === 'pendiente_pago') {
        actual = await cambiarEstado(env, actual, { ...auto, a: 'cancelado', nota: 'El monto pagado no coincide con el total.' });
      }
      if (actual.estado === 'cancelado') {
        await cambiarEstado(env, actual, { ...auto, a: 'a_revisar', nota: `Mercado Pago informó ${monto} centavos (pago ${pago.id}).` });
      }
      return 'a_revisar';
    }
    if (pedido.estado === 'pendiente_pago') {
      await cambiarEstado(env, pedido, { ...auto, a: 'pagado', nota: `Pago ${pago.id} aprobado por Mercado Pago.` });
    } else if (pedido.estado === 'cancelado') {
      // El pago llegó después de vencida la reserva: se intenta volver a tomar el stock.
      try {
        await cambiarEstado(env, pedido, { ...auto, a: 'pagado', nota: `Pago ${pago.id} aprobado después de vencer la reserva.` });
      } catch (e) {
        if (!(e instanceof ErrorApp)) throw e;
        await cambiarEstado(env, pedido, { ...auto, a: 'a_revisar', nota: `Pago ${pago.id} aprobado tarde y ya no hay stock: reembolsar o reponer.` });
        return 'a_revisar';
      }
    }
    // En cualquier otro estado el pago ya estaba aplicado: no hay nada que hacer.
  } catch (e) {
    // Otro aviso del mismo pago se procesó al mismo tiempo y ganó: está bien.
    if (!(e instanceof ErrorApp)) throw e;
  }
  return estado;
}

// Devuelve a la clienta, por Mercado Pago, el total del pago aprobado del pedido (reembolso completo). La clave de
// idempotencia evita devolver dos veces si se repite el clic. Si Mercado Pago falla, tira el error y el pedido no cambia.
export async function reembolsarEnMercadoPago(env: Env, pedido: PedidoCompleto) {
  const pago = pedido.pagos.find((p) => p.proveedor === 'mercadopago' && p.estado === 'aprobado' && p.id_externo);
  if (!pago) throw new ErrorApp(409, 'Este pedido no tiene un pago aprobado de Mercado Pago para devolver.');
  await mp(env, `/v1/payments/${encodeURIComponent(String(pago.id_externo))}/refunds`, {
    method: 'POST',
    headers: { 'x-idempotency-key': `reembolso-${pedido.numero}-${String(pago.id_externo)}` },
    body: '{}',
  });
  registrar('info', 'reembolso_en_mercadopago', { pedido: pedido.numero, pago: pago.id_externo });
}
