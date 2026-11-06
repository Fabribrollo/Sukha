import { type CanalPedido, type EstadoPedido, type MetodoEntrega, type MetodoPago, type Seguimiento, sinEmail } from '../compartido';
import { conectar } from '../config';
import { ErrorApp, esDuplicado, noEncontrado, violaCheck } from '../utils/errores';
import { AHORA_SQL } from '../utils/http';
import { registrar } from '../utils/registro';
import { nuevoToken, sha256Hex } from '../utils/crypto';
import { digitosCp, numeroPedido } from '../utils/texto';
import type { DatosPedido } from '../validations/tienda.validation';
import { leerConfiguracion } from './configuracion.service';
import { productoVisibleSql } from './catalogo.service';
import { comboSql, precioVigenteSql } from './promociones.service';
import { cuponVigente } from './cupones.service';
import { elegirBulto, pesoTotal } from './bultos';
import { excedePesoDeEnvio, opcionesDeEnvio } from './envios.service';
import { sentenciaRecuperado } from './carritos.service';
import { cotizarMiCorreo, micorreoActivo } from './micorreo.service';
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
  peso: number | null;
  combo_id: number | null;
  combo_tipo: '2x1' | '3x2' | null;
  combo_nombre: string | null;
};

// Precios y stock actuales de las variantes pedidas. Solo cuentan productos publicados y variantes activas.
async function cargarLineas(d1: D1Database, items: ItemPedido[]) {
  const marcas = items.map(() => '?').join(', ');
  const { results } = await d1
    .prepare(
      `SELECT v.id, v.sku, v.stock, p.nombre, ${precioVigenteSql('p')} AS precio,
              t.nombre AS talle, c.nombre AS color, p.peso_gramos AS peso,
              ${comboSql('id')} AS combo_id, ${comboSql('tipo')} AS combo_tipo, ${comboSql('nombre')} AS combo_nombre
         FROM variante v
         JOIN producto p ON p.id = v.producto_id
         LEFT JOIN talle t ON t.id = v.talle_id
         LEFT JOIN color c ON c.id = v.color_id
        WHERE v.activa = 1 AND ${productoVisibleSql('p')} AND v.id IN (${marcas})`,
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
        pesoGramos: v.peso,
        combo: v.combo_id ? { id: v.combo_id, cada: v.combo_tipo === '2x1' ? (2 as const) : (3 as const), nombre: v.combo_nombre ?? v.combo_tipo! } : null,
      });
    }
  }
  return { lineas, problemas };
}

// Si MiCorreo está configurado, reemplaza el precio de las opciones de Correo Argentino por la cotización real del
// carrito (peso y bulto). Si no está configurado o falla, quedan los precios de la tabla de zonas.
export async function conPreciosDeMiCorreo<O extends { transporte: string; modalidad: string; precioCentavos: number }>(
  env: Env,
  config: Awaited<ReturnType<typeof leerConfiguracion>>,
  opciones: O[],
  lineas: { pesoGramos: number | null; cantidad: number }[],
  codigoPostal: string,
): Promise<O[]> {
  const cp = digitosCp(codigoPostal);
  if (cp === null || lineas.length === 0 || !opciones.some((o) => o.transporte === 'correo_argentino') || !micorreoActivo(env, config)) return opciones;
  const { bulto, gramos } = elegirBulto(lineas, config.bultos, config.peso_defecto_gramos);
  const precios = await cotizarMiCorreo(env, env.DB, config, { cpDestino: String(cp), bulto, pesoGramos: gramos });
  if (!precios) return opciones;
  return opciones.map((o) => {
    const nuevo = o.transporte !== 'correo_argentino' ? null : o.modalidad === 'sucursal' ? precios.sucursal : precios.domicilio;
    return nuevo ? { ...o, precioCentavos: nuevo } : o;
  });
}

// Opciones de envío de un código postal para un carrito (las que ve la clienta al calcular el envío).
// Con el carrito, el precio es el del tramo de peso; si pesa más de 10 kg no hay opciones de envío (se consulta por WhatsApp).
export async function opcionesParaCarrito(env: Env, codigoPostal: string, items: ItemPedido[]) {
  if (items.length === 0) return { opciones: await opcionesDeEnvio(conectar(env), codigoPostal), pesoGramos: null, excedePeso: false };
  const [{ lineas }, config] = await Promise.all([cargarLineas(env.DB, items), leerConfiguracion(env.DB)]);
  const pesoGramos = pesoTotal(lineas, config.peso_defecto_gramos);
  if (excedePesoDeEnvio(pesoGramos)) return { opciones: [], pesoGramos, excedePeso: true };
  const opciones = await opcionesDeEnvio(conectar(env), codigoPostal, pesoGramos);
  return { opciones: await conPreciosDeMiCorreo(env, config, opciones, lineas, codigoPostal), pesoGramos, excedePeso: false };
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

  const pesoGramos = lineas.length ? pesoTotal(lineas, config.peso_defecto_gramos) : null;
  let zona = null;
  if (entrada.zonaEnvioId) {
    if (excedePesoDeEnvio(pesoGramos)) throw new ErrorApp(400, 'Tu pedido pesa más de 10 kg: consultanos el envío por WhatsApp o elegí retirarlo en persona.');
    const base = entrada.codigoPostal ? await opcionesDeEnvio(db, entrada.codigoPostal, pesoGramos) : [];
    const opciones = entrada.codigoPostal ? await conPreciosDeMiCorreo(env, config, base, lineas, entrada.codigoPostal) : [];
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
  return { lineas, problemas, zona, config, pesoGramos, excedePeso: excedePesoDeEnvio(pesoGramos), ...totales, cuponRechazado: cuponRechazado ?? totales.cuponRechazado };
}


// Crea el pedido en estado pendiente de pago y reserva el stock, todo en un solo lote de D1:
// si falta una sola prenda (o el cupón se agotó en el medio), no se guarda nada.
// Venta cargada desde el panel: sin topes por visitante, reserva larga, y envío y descuento que se pueden poner a mano.
export type VentaManual = { canal: Exclude<CanalPedido, 'web'>; adminId: number; envioCentavos?: number | null; descuentoCentavos?: number | null; notaInterna?: string | null };

export async function crearPedido(env: Env, d: DatosPedido, ip: string, manual?: VentaManual) {
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
  // Modo vacaciones: la tienda no toma pedidos nuevos (las ventas cargadas a mano desde el panel sí).
  if (!manual && c.config.vacaciones_activo) throw new ErrorApp(409, `Estamos de vacaciones y no tomamos pedidos por ahora. ${c.config.vacaciones_mensaje}`.trim());
  if (!conEnvio && !c.config.retiro_habilitado) throw new ErrorApp(400, 'El retiro en persona no está disponible.');
  if (c.zona && c.zona.modalidad !== entrega.metodoEntrega) {
    throw new ErrorApp(400, 'La opción de envío elegida no coincide con la forma de entrega.');
  }
  if (manual) {
    if (conEnvio && manual.envioCentavos != null) c.envioCentavos = manual.envioCentavos;
    // El descuento a mano va después de los demás y nunca pasa el subtotal.
    const extra = Math.min(manual.descuentoCentavos ?? 0, c.subtotalCentavos - c.descuentoCentavos);
    if (extra > 0) {
      c.descuentos.push({ tipo: 'promo', cuponId: null, descripcion: 'Descuento', montoCentavos: extra });
      c.descuentoCentavos += extra;
    }
    c.totalCentavos = c.subtotalCentavos - c.descuentoCentavos + c.envioCentavos;
  }
  if (c.totalCentavos <= 0) throw new ErrorApp(409, 'El pedido quedó sin monto a pagar. Escribinos para coordinarlo.');

  // Topes contra pedidos falsos: cada pedido sin pagar retiene stock hasta que vence, así que se limita
  // cuántas unidades entran en un pedido y cuántos pedidos sin pagar puede tener abiertos un mismo visitante o email.
  const unidades = c.lineas.reduce((suma, l) => suma + l.cantidad, 0);
  if (unidades > c.config.max_unidades_por_pedido) {
    throw new ErrorApp(400, `Un pedido puede tener hasta ${c.config.max_unidades_por_pedido} prendas. Para más, escribinos.`);
  }
  const ipHash = manual ? null : (await sha256Hex(`sukha-ip:${ip}`)).slice(0, 32);
  const abiertos = manual ? { n: 0 } : await d1
    .prepare("SELECT count(*) AS n FROM pedido WHERE estado = 'pendiente_pago' AND (ip_hash = ? OR email = ?)")
    .bind(ipHash, d.email)
    .first<{ n: number }>();
  if (abiertos!.n >= c.config.max_pedidos_pendientes) {
    throw new ErrorApp(429, 'Tenés pedidos esperando el pago. Pagalos o esperá a que venzan para hacer uno nuevo.');
  }

  const token = nuevoToken();
  // Una venta por WhatsApp espera el pago como una transferencia: el link de Mercado Pago no vence a la media hora.
  const minutosReserva =
    manual || d.metodoPago === 'transferencia' ? c.config.reserva_transferencia_horas * 60 : c.config.reserva_mercado_pago_minutos;
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
           cuit, condicion_iva, reserva_vence_en, ip_hash, nota_clienta, canal, nota_interna)
         VALUES (?, ?, (SELECT id FROM clienta WHERE email = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        d.nota ?? null,
        manual?.canal ?? 'web',
        manual?.notaInterna ?? null,
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
    // La venta manual la cargó la dueña: no hace falta avisarle.
    if (c.config.email_avisos && !manual) {
      sentencias.push(
        d1
          .prepare(`INSERT INTO email_saliente (pedido_id, destinatario, tipo) VALUES (${PEDIDO}, ?, 'aviso_transferencia')`)
          .bind(clave, c.config.email_avisos),
      );
    }
  }

  sentencias.push(
    d1.prepare(`INSERT INTO historial_estado (pedido_id, admin_id, estado_nuevo) VALUES (${PEDIDO}, ?, 'pendiente_pago')`).bind(clave, manual?.adminId ?? null),
    sentenciaRecuperado(d1, d.email),
  );
  if (!sinEmail(d.email)) {
    sentencias.push(d1.prepare(`INSERT INTO email_saliente (pedido_id, destinatario, tipo) VALUES (${PEDIDO}, ?, 'pedido_recibido')`).bind(clave, d.email));
  }

  let idPedido: number;
  try {
    // La segunda sentencia del lote es la que crea el pedido.
    idPedido = (await d1.batch(sentencias))[1].meta.last_row_id;
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
  registrar('info', 'pedido_creado', { pedido: numeroPedido(idPedido), pago: d.metodoPago, entrega: entrega.metodoEntrega, canal: manual?.canal ?? 'web' });
  // La configuración ya leída para cotizar viaja con el resultado: quien llama no la vuelve a leer.
  return { token, repetido: false, config: c.config };
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
  estado: EstadoPedido;
  nombre: string;
  email: string;
  telefono: string;
  dni: string;
  metodo_entrega: MetodoEntrega;
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
  metodo_pago: MetodoPago;
  subtotal_centavos: number;
  descuento_centavos: number;
  envio_centavos: number;
  total_centavos: number;
  cuit: string | null;
  condicion_iva: string | null;
  factura_numero: string | null;
  nota_clienta: string | null;
  nota_interna: string | null;
  canal: CanalPedido;
  reserva_vence_en: string | null;
  creado_en: string;
  actualizado_en: string;
};

export type FilaHistorial = {
  estado_anterior: EstadoPedido | null;
  estado_nuevo: EstadoPedido;
  nota: string | null;
  admin_id: number | null;
  creado_en: string;
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
    historial: historial.results as FilaHistorial[],
  };
}
export type PedidoCompleto = Awaited<ReturnType<typeof cargarPedido>>;

// Lo que ve la clienta en la página de seguimiento: sin datos internos (notas, ids de pago, quién cambió qué).
export async function seguimiento(env: Env, token: string) {
  const [p, config] = await Promise.all([cargarPedido(env.DB, { token }), leerConfiguracion(env.DB)]);
  return vistaSeguimiento(p, config);
}

// La misma vista con el pedido y la configuración ya leídos.
export function vistaSeguimiento(p: PedidoCompleto, config: Awaited<ReturnType<typeof leerConfiguracion>>): Seguimiento {
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
    // Las notas internas (mismo estado antes y después, como un pago doble) no son pasos del pedido.
    historial: p.historial.filter((h) => h.estado_anterior !== h.estado_nuevo).map((h) => ({ estado: h.estado_nuevo, fecha: h.creado_en })),
    transferencia:
      pendiente && p.metodo_pago === 'transferencia'
        ? { alias: config.alias_transferencia, titular: config.titular_transferencia, montoCentavos: p.total_centavos }
        : null,
    retiro:
      p.metodo_entrega === 'retiro' ? { direccion: config.retiro_direccion, horario: config.retiro_horario } : null,
  };
}
