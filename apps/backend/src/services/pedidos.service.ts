import { conectar } from '../config';
import { ErrorApp, esDuplicado, noEncontrado, violaCheck } from '../utils/errores';
import { nuevoToken, sha256Hex } from '../utils/crypto';
import { numeroPedido } from '../utils/texto';
import type { DatosPedido } from '../validations/tienda.validation';
import { leerConfiguracion } from './configuracion.service';
import { cuponVigente } from './cupones.service';
import { opcionesDeEnvio } from './envios.service';
import { type CuponAplicable, calcularTotales } from './totales';

type ItemPedido = { varianteId: number; cantidad: number };

type FilaVariante = {
  id: number;
  sku: string;
  stock: number;
  nombre: string;
  precio: number;
  talle: string | null;
  color: string | null;
};

// Precios y stock actuales de las variantes pedidas. Solo cuentan productos publicados y variantes activas.
async function cargarLineas(d1: D1Database, items: ItemPedido[]) {
  const marcas = items.map(() => '?').join(', ');
  const { results } = await d1
    .prepare(
      `SELECT v.id, v.sku, v.stock, p.nombre, coalesce(p.precio_oferta_centavos, p.precio_centavos) AS precio,
              t.nombre AS talle, c.nombre AS color
         FROM variante v
         JOIN producto p ON p.id = v.producto_id
         LEFT JOIN talle t ON t.id = v.talle_id
         LEFT JOIN color c ON c.id = v.color_id
        WHERE v.activa = 1 AND p.estado = 'publicado' AND v.id IN (${marcas})`,
    )
    .bind(...items.map((i) => i.varianteId))
    .all<FilaVariante>();
  const porId = new Map(results.map((v) => [v.id, v]));

  const lineas = [];
  const problemas = [];
  for (const item of items) {
    const v = porId.get(item.varianteId);
    if (!v) {
      problemas.push({ varianteId: item.varianteId, motivo: 'Ya no está disponible.', disponible: 0 });
    } else if (v.stock < item.cantidad) {
      problemas.push({
        varianteId: v.id,
        motivo: v.stock === 0 ? `${v.nombre}: agotado.` : `${v.nombre}: quedan ${v.stock}.`,
        disponible: v.stock,
      });
    } else {
      lineas.push({
        varianteId: v.id,
        sku: v.sku,
        nombre: v.nombre,
        talle: v.talle,
        color: v.color,
        precioCentavos: v.precio,
        cantidad: item.cantidad,
      });
    }
  }
  return { lineas, problemas };
}

// Recalcula todo en el servidor a partir de las variantes y cantidades: precios, envío, cupón y descuentos.
// Lo usan tanto la validación del carrito como la creación del pedido, así siempre dan el mismo total.
export async function cotizar(
  env: Env,
  entrada: {
    items: ItemPedido[];
    cupon: string | null;
    zonaEnvioId?: number | null;
    codigoPostal?: string | null;
    metodoPago: 'mercadopago' | 'transferencia';
  },
) {
  const db = conectar(env);
  const [{ lineas, problemas }, config] = await Promise.all([cargarLineas(env.DB, entrada.items), leerConfiguracion(env.DB)]);

  let zona = null;
  if (entrada.zonaEnvioId) {
    const opciones = entrada.codigoPostal ? await opcionesDeEnvio(db, entrada.codigoPostal) : [];
    zona = opciones.find((o) => o.zonaEnvioId === entrada.zonaEnvioId) ?? null;
    if (!zona) throw new ErrorApp(400, 'Esa opción de envío no llega a tu código postal.');
  }

  let cupon: CuponAplicable | null = null;
  let cuponRechazado: string | null = null;
  if (entrada.cupon) {
    const r = await cuponVigente(db, entrada.cupon);
    if ('cupon' in r) cupon = r.cupon;
    else cuponRechazado = r.motivo;
  }

  const totales = calcularTotales({
    lineas,
    envioCentavos: zona?.precioCentavos ?? 0,
    envioGratisDesdeCentavos: zona?.gratisDesdeCentavos ?? null,
    cupon,
    porcentajeTransferencia: entrada.metodoPago === 'transferencia' ? config.descuento_transferencia_porcentaje : 0,
  });
  return { lineas, problemas, zona, config, ...totales, cuponRechazado: cuponRechazado ?? totales.cuponRechazado };
}

const AHORA_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

// Crea el pedido en estado pendiente de pago y reserva el stock, todo en un solo lote de D1:
// si falta una sola prenda (o el cupón se agotó en el medio), no se guarda nada.
export async function crearPedido(env: Env, d: DatosPedido, ip: string) {
  const d1 = env.DB;
  const existente = await d1
    .prepare('SELECT token_seguimiento AS token FROM pedido WHERE clave_idempotencia = ?')
    .bind(d.claveIdempotencia)
    .first<{ token: string }>();
  if (existente) return { token: existente.token, repetido: true };

  const entrega = d.entrega;
  const conEnvio = entrega.metodoEntrega !== 'retiro';
  const c = await cotizar(env, {
    items: d.items,
    cupon: d.cupon,
    zonaEnvioId: conEnvio ? entrega.zonaEnvioId : null,
    codigoPostal: conEnvio ? entrega.codigoPostal : null,
    metodoPago: d.metodoPago,
  });
  if (c.problemas.length) throw new ErrorApp(409, c.problemas.map((p) => p.motivo).join(' '));
  if (c.cuponRechazado) throw new ErrorApp(409, c.cuponRechazado);
  if (!conEnvio && !c.config.retiro_habilitado) throw new ErrorApp(400, 'El retiro en persona no está disponible.');
  if (c.zona && c.zona.modalidad !== entrega.metodoEntrega) {
    throw new ErrorApp(400, 'La opción de envío elegida no coincide con la forma de entrega.');
  }
  if (c.totalCentavos <= 0) throw new ErrorApp(409, 'El pedido quedó sin monto a pagar. Escribinos para coordinarlo.');

  // Topes contra pedidos falsos: cada pedido sin pagar retiene stock hasta que vence, así que se limita
  // cuántas unidades entran en un pedido y cuántos pedidos sin pagar puede tener abiertos un mismo visitante o email.
  const unidades = c.lineas.reduce((suma, l) => suma + l.cantidad, 0);
  if (unidades > c.config.max_unidades_por_pedido) {
    throw new ErrorApp(400, `Un pedido puede tener hasta ${c.config.max_unidades_por_pedido} prendas. Para más, escribinos.`);
  }
  const ipHash = (await sha256Hex(`sukha-ip:${ip}`)).slice(0, 32);
  const abiertos = await d1
    .prepare("SELECT count(*) AS n FROM pedido WHERE estado = 'pendiente_pago' AND (ip_hash = ? OR email = ?)")
    .bind(ipHash, d.email)
    .first<{ n: number }>();
  if (abiertos!.n >= c.config.max_pedidos_pendientes) {
    throw new ErrorApp(429, 'Tenés pedidos esperando el pago. Pagalos o esperá a que venzan para hacer uno nuevo.');
  }

  const token = nuevoToken();
  const minutosReserva =
    d.metodoPago === 'transferencia' ? c.config.reserva_transferencia_horas * 60 : c.config.reserva_mercado_pago_minutos;
  const reservaVence = new Date(Date.now() + minutosReserva * 60_000).toISOString();
  // El id del pedido todavía no existe: las sentencias del lote lo buscan por su clave de idempotencia.
  const PEDIDO = '(SELECT id FROM pedido WHERE clave_idempotencia = ?)';
  const clave = d.claveIdempotencia;
  const novedades = d.aceptaNovedades ? 1 : 0;

  const sentencias = [
    d1
      .prepare(
        `INSERT INTO clienta (email, nombre, telefono, dni, acepta_novedades, acepta_novedades_en, token_baja)
         VALUES (?1, ?2, ?3, ?4, ?5, CASE WHEN ?5 = 1 THEN ${AHORA_SQL} END, ?6)
         ON CONFLICT (email) DO UPDATE SET
           nombre = excluded.nombre, telefono = excluded.telefono, dni = excluded.dni, actualizado_en = ${AHORA_SQL},
           acepta_novedades_en = CASE WHEN excluded.acepta_novedades = 1 AND clienta.acepta_novedades = 0
                                      THEN excluded.acepta_novedades_en ELSE clienta.acepta_novedades_en END,
           acepta_novedades = max(clienta.acepta_novedades, excluded.acepta_novedades)`,
      )
      .bind(d.email, d.nombre, d.telefono, d.dni, novedades, nuevoToken()),
    d1
      .prepare(
        `INSERT INTO pedido (token_seguimiento, clave_idempotencia, clienta_id, nombre, email, telefono, dni,
           metodo_entrega, calle, altura, piso_depto, localidad, provincia, codigo_postal, indicaciones, sucursal_correo,
           zona_envio_id, metodo_pago, subtotal_centavos, descuento_centavos, envio_centavos, total_centavos,
           cuit, condicion_iva, reserva_vence_en, ip_hash)
         VALUES (?, ?, (SELECT id FROM clienta WHERE email = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        token,
        clave,
        d.email,
        d.nombre,
        d.email,
        d.telefono,
        d.dni,
        entrega.metodoEntrega,
        entrega.metodoEntrega === 'domicilio' ? entrega.calle : null,
        entrega.metodoEntrega === 'domicilio' ? entrega.altura : null,
        entrega.metodoEntrega === 'domicilio' ? entrega.pisoDepto : null,
        conEnvio ? entrega.localidad : null,
        conEnvio ? entrega.provincia : null,
        conEnvio ? entrega.codigoPostal : null,
        entrega.metodoEntrega === 'domicilio' ? entrega.indicaciones : null,
        entrega.metodoEntrega === 'sucursal' ? entrega.sucursalCorreo : null,
        c.zona?.zonaEnvioId ?? null,
        d.metodoPago,
        c.subtotalCentavos,
        c.descuentoCentavos,
        c.envioCentavos,
        c.totalCentavos,
        d.cuit ?? null,
        d.condicionIva ?? null,
        reservaVence,
        ipHash,
      ),
  ];

  for (const l of c.lineas) {
    sentencias.push(
      // La base prohíbe stock negativo: si no alcanza, esta sentencia falla y se deshace todo el lote.
      d1.prepare(`UPDATE variante SET stock = stock - ?, actualizado_en = ${AHORA_SQL} WHERE id = ?`).bind(l.cantidad, l.varianteId),
      d1
        .prepare(
          `INSERT INTO pedido_item (pedido_id, variante_id, nombre_producto, talle, color, sku, precio_unitario_centavos, cantidad)
           VALUES (${PEDIDO}, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(clave, l.varianteId, l.nombre, l.talle, l.color, l.sku, l.precioCentavos, l.cantidad),
      d1
        .prepare(`INSERT INTO movimiento_stock (variante_id, pedido_id, tipo, cantidad) VALUES (?, ${PEDIDO}, 'reserva', ?)`)
        .bind(l.varianteId, clave, -l.cantidad),
    );
  }

  for (const desc of c.descuentos) {
    sentencias.push(
      d1
        .prepare(`INSERT INTO pedido_descuento (pedido_id, tipo, cupon_id, descripcion, monto_centavos) VALUES (${PEDIDO}, ?, ?, ?, ?)`)
        .bind(clave, desc.tipo, desc.cuponId, desc.descripcion, desc.montoCentavos),
    );
    // La base prohíbe pasar los usos máximos: si otra compra usó el último, se deshace todo.
    if (desc.cuponId) sentencias.push(d1.prepare('UPDATE cupon SET usos = usos + 1 WHERE id = ?').bind(desc.cuponId));
  }

  if (d.metodoPago === 'transferencia') {
    sentencias.push(
      d1
        .prepare(`INSERT INTO pago (pedido_id, proveedor, estado, monto_centavos) VALUES (${PEDIDO}, 'transferencia', 'pendiente', ?)`)
        .bind(clave, c.totalCentavos),
    );
    if (c.config.email_avisos) {
      sentencias.push(
        d1
          .prepare(`INSERT INTO email_saliente (pedido_id, destinatario, tipo) VALUES (${PEDIDO}, ?, 'aviso_transferencia')`)
          .bind(clave, c.config.email_avisos),
      );
    }
  }

  sentencias.push(
    d1.prepare(`INSERT INTO historial_estado (pedido_id, estado_nuevo) VALUES (${PEDIDO}, 'pendiente_pago')`).bind(clave),
    d1.prepare(`INSERT INTO email_saliente (pedido_id, destinatario, tipo) VALUES (${PEDIDO}, ?, 'pedido_recibido')`).bind(clave, d.email),
  );

  try {
    await d1.batch(sentencias);
  } catch (e) {
    if (violaCheck(e, 'stock')) throw new ErrorApp(409, 'Alguna prenda se quedó sin stock mientras confirmabas. Revisá el carrito.');
    if (violaCheck(e, 'usos')) throw new ErrorApp(409, 'El cupón ya no tiene usos disponibles.');
    if (esDuplicado(e)) {
      // Dos envíos simultáneos del mismo formulario: gana uno y el otro devuelve ese mismo pedido.
      const ganador = await d1
        .prepare('SELECT token_seguimiento AS token FROM pedido WHERE clave_idempotencia = ?')
        .bind(clave)
        .first<{ token: string }>();
      if (ganador) return { token: ganador.token, repetido: true };
    }
    throw e;
  }
  return { token, repetido: false };
}

// Devuelve el token de seguimiento si el número y el email coinciden con un pedido, o null.
// No dice cuál de los dos datos falló, para que no sirva para averiguar qué emails compraron.
export async function buscarToken(d1: D1Database, numero: string, email: string) {
  const id = Number(numero.match(/^\s*(?:SUK-?)?0*(\d{1,9})\s*$/i)?.[1]);
  if (!Number.isInteger(id) || id <= 0) return null;
  const fila = await d1
    .prepare('SELECT token_seguimiento AS token FROM pedido WHERE id = ? AND lower(email) = ?')
    .bind(id, email.trim().toLowerCase())
    .first<{ token: string }>();
  return fila?.token ?? null;
}

export type FilaPedido = {
  id: number;
  token_seguimiento: string;
  estado: string;
  nombre: string;
  email: string;
  telefono: string;
  dni: string;
  metodo_entrega: 'domicilio' | 'sucursal' | 'retiro';
  calle: string | null;
  altura: string | null;
  piso_depto: string | null;
  localidad: string | null;
  provincia: string | null;
  codigo_postal: string | null;
  indicaciones: string | null;
  sucursal_correo: string | null;
  zona_envio_id: number | null;
  numero_seguimiento: string | null;
  metodo_pago: 'mercadopago' | 'transferencia';
  subtotal_centavos: number;
  descuento_centavos: number;
  envio_centavos: number;
  total_centavos: number;
  cuit: string | null;
  condicion_iva: string | null;
  factura_numero: string | null;
  reserva_vence_en: string | null;
  creado_en: string;
  actualizado_en: string;
};

export type FilaItem = {
  id: number;
  variante_id: number;
  nombre_producto: string;
  talle: string | null;
  color: string | null;
  sku: string;
  precio_unitario_centavos: number;
  cantidad: number;
};

// Pedido completo con sus ítems, descuentos, pagos e historial. Se busca por id (panel) o por token (clienta).
export async function cargarPedido(d1: D1Database, por: { id: number } | { token: string }) {
  const pedido = await d1
    .prepare(`SELECT * FROM pedido WHERE ${'id' in por ? 'id' : 'token_seguimiento'} = ?`)
    .bind('id' in por ? por.id : por.token)
    .first<FilaPedido & { clave_idempotencia?: string }>();
  if (!pedido) throw noEncontrado('el pedido');
  delete pedido.clave_idempotencia;

  const [items, descuentos, pagos, historial] = await d1.batch([
    d1.prepare('SELECT id, variante_id, nombre_producto, talle, color, sku, precio_unitario_centavos, cantidad FROM pedido_item WHERE pedido_id = ?').bind(pedido.id),
    d1.prepare('SELECT tipo, descripcion, monto_centavos FROM pedido_descuento WHERE pedido_id = ?').bind(pedido.id),
    d1.prepare('SELECT id, proveedor, id_externo, estado, monto_centavos, creado_en, actualizado_en FROM pago WHERE pedido_id = ? ORDER BY id').bind(pedido.id),
    d1.prepare('SELECT estado_anterior, estado_nuevo, nota, admin_id, creado_en FROM historial_estado WHERE pedido_id = ? ORDER BY id').bind(pedido.id),
  ]);
  return {
    ...pedido,
    numero: numeroPedido(pedido.id),
    items: items.results as FilaItem[],
    descuentos: descuentos.results as { tipo: string; descripcion: string; monto_centavos: number }[],
    pagos: pagos.results as Record<string, unknown>[],
    historial: historial.results as Record<string, unknown>[],
  };
}
export type PedidoCompleto = Awaited<ReturnType<typeof cargarPedido>>;

// Lo que ve la clienta en la página de seguimiento: sin datos internos (notas, ids de pago, quién cambió qué).
export async function seguimiento(env: Env, token: string) {
  const p = await cargarPedido(env.DB, { token });
  const config = await leerConfiguracion(env.DB);
  const pendiente = p.estado === 'pendiente_pago';
  return {
    numero: p.numero,
    estado: p.estado,
    creadoEn: p.creado_en,
    nombre: p.nombre,
    metodoEntrega: p.metodo_entrega,
    numeroSeguimiento: p.numero_seguimiento,
    metodoPago: p.metodo_pago,
    subtotalCentavos: p.subtotal_centavos,
    descuentoCentavos: p.descuento_centavos,
    envioCentavos: p.envio_centavos,
    totalCentavos: p.total_centavos,
    reservaVenceEn: pendiente ? p.reserva_vence_en : null,
    items: p.items.map((i) => ({
      id: i.id,
      nombre: i.nombre_producto,
      talle: i.talle,
      color: i.color,
      precioUnitarioCentavos: i.precio_unitario_centavos,
      cantidad: i.cantidad,
    })),
    descuentos: p.descuentos.map((x) => ({ descripcion: x.descripcion, montoCentavos: x.monto_centavos })),
    historial: p.historial.map((h) => ({ estado: h.estado_nuevo, fecha: h.creado_en })),
    transferencia:
      pendiente && p.metodo_pago === 'transferencia'
        ? { alias: config.alias_transferencia, titular: config.titular_transferencia, montoCentavos: p.total_centavos }
        : null,
    retiro:
      p.metodo_entrega === 'retiro' ? { direccion: config.retiro_direccion, horario: config.retiro_horario } : null,
  };
}
