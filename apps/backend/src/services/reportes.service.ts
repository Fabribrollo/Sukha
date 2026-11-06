import { precioVigenteSql } from './promociones.service';
import { numeroPedido } from '../utils/texto';

// Un pedido cuenta como venta desde que se paga y mientras no se reembolse.
const VENDIDO = "estado IN ('pagado', 'en_preparacion', 'enviado', 'listo_para_retirar', 'entregado')";

const filas = <T = Record<string, unknown>>(s: D1PreparedStatement) => s.all<T>().then((r) => r.results);

export function listarPedidos(d1: D1Database, f: { estado?: string; q?: string; pagina?: number; desde?: string }) {
  const pagina = Math.max(1, f.pagina ?? 1);
  // Busca por número (SUK-0012 o 12), email o nombre.
  const numero = Number(f.q?.replace(/^SUK-?/i, ''));
  // Período: desde una fecha (los chips Hoy, 7 y 30 días). Una fecha que no se entiende se ignora.
  const desde = f.desde && !Number.isNaN(Date.parse(f.desde)) ? new Date(f.desde).toISOString() : null;
  return filas(
    d1
      .prepare(
        `SELECT id, estado, nombre, email, metodo_entrega, metodo_pago, total_centavos, creado_en, canal, telefono
           FROM pedido
          WHERE (?1 IS NULL OR instr(',' || ?1 || ',', ',' || estado || ',') > 0)
            AND (?2 IS NULL OR id = ?3 OR email LIKE '%' || ?2 || '%' OR nombre LIKE '%' || ?2 || '%')
            AND (?5 IS NULL OR creado_en >= ?5)
          ORDER BY id DESC LIMIT 50 OFFSET ?4`,
      )
      .bind(f.estado ?? null, f.q || null, Number.isInteger(numero) ? numero : -1, (pagina - 1) * 50, desde),
  ).then((r) => r.map((p) => ({ ...p, numero: numeroPedido(p.id as number) })));
}

// Cantidad de pedidos y de productos por estado, para los números al lado de las pestañas.
export const conteosPedidos = (d1: D1Database) => conteos(d1.prepare('SELECT estado, count(*) AS n FROM pedido GROUP BY estado'));
export const conteosProductos = (d1: D1Database) => conteos(d1.prepare('SELECT estado, count(*) AS n FROM producto GROUP BY estado'));
const conteos = (s: D1PreparedStatement) => filas<{ estado: string; n: number }>(s).then((r) => Object.fromEntries(r.map((x) => [x.estado, x.n])));

// Una fila por variante, para llevar el stock a una planilla (Productos → Exportar).
export function stockParaExportar(d1: D1Database) {
  return filas(
    d1.prepare(
      `SELECT p.nombre AS producto, ca.nombre AS categoria, p.estado AS estado_producto, t.nombre AS talle, c.nombre AS color, v.sku,
              v.stock, CASE WHEN v.activa = 1 THEN 'sí' ELSE 'no' END AS activa, ${precioVigenteSql('p')} / 100.0 AS precio
         FROM variante v JOIN producto p ON p.id = v.producto_id JOIN categoria ca ON ca.id = p.categoria_id
         LEFT JOIN talle t ON t.id = v.talle_id LEFT JOIN color c ON c.id = v.color_id
        ORDER BY p.nombre, t.orden, c.orden`,
    ),
  );
}

export async function resumen(d1: D1Database, desde: string, hasta: string, umbralStock: number) {
  const [hoy, porDia, masVendidos, stockBajo, pendientes] = await d1.batch([
    // "Hoy" según la hora de Argentina (UTC-3), no la del servidor.
    d1.prepare(
      `SELECT (SELECT count(*) FROM pedido WHERE ${VENDIDO} AND date(creado_en, '-3 hours') = date('now', '-3 hours')) AS ventas,
              (SELECT coalesce(sum(total_centavos), 0) FROM pedido WHERE ${VENDIDO} AND date(creado_en, '-3 hours') = date('now', '-3 hours')) AS total_centavos,
              (SELECT count(*) FROM pedido WHERE estado = 'pendiente_pago' AND metodo_pago = 'transferencia') AS transferencias_por_confirmar,
              (SELECT count(*) FROM pedido WHERE estado IN ('pagado', 'en_preparacion')) AS por_despachar,
              (SELECT count(*) FROM pedido WHERE estado = 'a_revisar') AS a_revisar,
              (SELECT count(*) FROM solicitud_postventa WHERE estado = 'abierta') AS solicitudes_abiertas,
              (SELECT count(*) FROM email_saliente WHERE estado = 'fallido') AS emails_fallidos`,
    ),
    d1
      .prepare(
        `SELECT date(creado_en) AS dia, count(*) AS pedidos, sum(total_centavos) AS total_centavos
           FROM pedido WHERE ${VENDIDO} AND creado_en >= ?1 AND creado_en < ?2 GROUP BY dia ORDER BY dia`,
      )
      .bind(desde, hasta),
    d1
      .prepare(
        `SELECT pi.nombre_producto AS producto, sum(pi.cantidad) AS unidades, sum(pi.cantidad * pi.precio_unitario_centavos) AS total_centavos
           FROM pedido_item pi JOIN pedido p ON p.id = pi.pedido_id
          WHERE p.${VENDIDO} AND p.creado_en >= ?1 AND p.creado_en < ?2
          GROUP BY pi.nombre_producto ORDER BY unidades DESC LIMIT 10`,
      )
      .bind(desde, hasta),
    d1
      .prepare(
        `SELECT v.id AS variante_id, v.sku, v.stock, p.nombre AS producto, t.nombre AS talle, c.nombre AS color
           FROM variante v JOIN producto p ON p.id = v.producto_id
           LEFT JOIN talle t ON t.id = v.talle_id LEFT JOIN color c ON c.id = v.color_id
          WHERE v.activa = 1 AND p.estado = 'publicado' AND v.stock <= ? ORDER BY v.stock, p.nombre LIMIT 100`,
      )
      .bind(umbralStock),
    d1.prepare("SELECT estado, count(*) AS pedidos FROM pedido WHERE estado IN ('pendiente_pago', 'pagado', 'en_preparacion', 'a_revisar') GROUP BY estado"),
  ]);
  return { hoy: hoy.results[0], porDia: porDia.results, masVendidos: masVendidos.results, stockBajo: stockBajo.results, pendientes: pendientes.results };
}

export const listarClientas = (d1: D1Database) =>
  filas(
    d1.prepare(
      `SELECT c.id, c.email, c.nombre, c.telefono, c.acepta_novedades, c.creado_en,
              count(p.id) AS pedidos, coalesce(sum(p.total_centavos), 0) AS total_centavos
         FROM clienta c LEFT JOIN pedido p ON p.clienta_id = c.id AND p.${VENDIDO}
        GROUP BY c.id ORDER BY c.creado_en DESC LIMIT 1000`,
    ),
  );

// Para abrir en Excel: separador punto y coma y BOM, que es lo que espera Excel en español.
export function aCsv(lista: Record<string, unknown>[]) {
  if (!lista.length) return '﻿';
  const columnas = Object.keys(lista[0]);
  const celda = (v: unknown) => {
    let texto = v == null ? '' : String(v);
    // Evita que Excel interprete como fórmula un texto cargado por una clienta.
    if (/^[=+\-@]/.test(texto)) texto = `'${texto}`;
    return `"${texto.replaceAll('"', '""')}"`;
  };
  return `﻿${[columnas.join(';'), ...lista.map((f) => columnas.map((c) => celda(f[c])).join(';'))].join('\r\n')}`;
}

export const pedidosParaExportar = (d1: D1Database, desde: string, hasta: string) =>
  filas(
    d1
      .prepare(
        `SELECT 'SUK-' || printf('%04d', id) AS numero, creado_en, estado, nombre, email, telefono, dni, metodo_entrega,
                calle, altura, piso_depto, localidad, provincia, codigo_postal, sucursal_correo, numero_seguimiento, metodo_pago,
                subtotal_centavos / 100.0 AS subtotal, descuento_centavos / 100.0 AS descuento,
                envio_centavos / 100.0 AS envio, total_centavos / 100.0 AS total, cuit, factura_numero
           FROM pedido WHERE creado_en >= ? AND creado_en < ? ORDER BY id`,
      )
      .bind(desde, hasta),
  );

// ───────────── Reporte de ventas ─────────────
// Una venta es un pedido pagado (VENDIDO). Lo vendido = prendas menos descuentos, sin el envío; los descuentos y el envío
// cobrado se muestran aparte. Las fechas son días de Argentina (UTC-3), "desde" y "hasta" incluidos.
const EN_PERIODO = "date(p.creado_en, '-3 hours') BETWEEN ?1 AND ?2";
const VENDIDO_P = VENDIDO.replace('estado', 'p.estado');

export async function reporteDeVentas(d1: D1Database, desde: string, hasta: string) {
  const consulta = (sql: string) => d1.prepare(sql).bind(desde, hasta);
  const [totales, porDia, porMes, productos, pagos, zonas, marcas] = await d1.batch([
    consulta(
      `SELECT count(*) AS pedidos,
              coalesce(sum(p.subtotal_centavos - p.descuento_centavos), 0) AS ventas_centavos,
              coalesce(sum(p.subtotal_centavos), 0) AS prendas_centavos,
              coalesce(sum(p.descuento_centavos), 0) AS descuentos_centavos,
              coalesce(sum(p.envio_centavos), 0) AS envios_centavos,
              coalesce((SELECT sum(pi.cantidad) FROM pedido_item pi JOIN pedido p ON p.id = pi.pedido_id WHERE ${VENDIDO_P} AND ${EN_PERIODO}), 0) AS unidades
         FROM pedido p WHERE ${VENDIDO_P} AND ${EN_PERIODO}`,
    ),
    consulta(
      `SELECT date(p.creado_en, '-3 hours') AS dia, count(*) AS pedidos, sum(p.subtotal_centavos - p.descuento_centavos) AS ventas_centavos
         FROM pedido p WHERE ${VENDIDO_P} AND ${EN_PERIODO} GROUP BY dia ORDER BY dia`,
    ),
    consulta(
      `SELECT strftime('%Y-%m', p.creado_en, '-3 hours') AS mes, count(*) AS pedidos, sum(p.subtotal_centavos - p.descuento_centavos) AS ventas_centavos
         FROM pedido p WHERE ${VENDIDO_P} AND ${EN_PERIODO} GROUP BY mes ORDER BY mes`,
    ),
    consulta(
      `SELECT pi.nombre_producto AS producto, sum(pi.cantidad) AS unidades, sum(pi.cantidad * pi.precio_unitario_centavos) AS prendas_centavos
         FROM pedido_item pi JOIN pedido p ON p.id = pi.pedido_id
        WHERE ${VENDIDO_P} AND ${EN_PERIODO}
        GROUP BY pi.nombre_producto ORDER BY unidades DESC, prendas_centavos DESC LIMIT 20`,
    ),
    consulta(
      `SELECT p.metodo_pago AS clave, count(*) AS pedidos, sum(p.subtotal_centavos - p.descuento_centavos) AS ventas_centavos
         FROM pedido p WHERE ${VENDIDO_P} AND ${EN_PERIODO} GROUP BY clave ORDER BY ventas_centavos DESC`,
    ),
    consulta(
      `SELECT CASE WHEN p.metodo_entrega = 'retiro' THEN 'Retiro en el local' ELSE coalesce(z.nombre, 'Sin zona') END AS clave,
              count(*) AS pedidos, sum(p.subtotal_centavos - p.descuento_centavos) AS ventas_centavos
         FROM pedido p LEFT JOIN zona_envio z ON z.id = p.zona_envio_id
        WHERE ${VENDIDO_P} AND ${EN_PERIODO} GROUP BY clave ORDER BY ventas_centavos DESC`,
    ),
    // Por marca: el monto de las prendas (antes de descuentos, que son por pedido y no por prenda).
    consulta(
      `SELECT coalesce(m.nombre, 'Sin marca') AS clave, sum(pi.cantidad) AS unidades, sum(pi.cantidad * pi.precio_unitario_centavos) AS prendas_centavos
         FROM pedido_item pi JOIN pedido p ON p.id = pi.pedido_id
         LEFT JOIN variante v ON v.id = pi.variante_id LEFT JOIN producto pr ON pr.id = v.producto_id LEFT JOIN marca m ON m.id = pr.marca_id
        WHERE ${VENDIDO_P} AND ${EN_PERIODO} GROUP BY clave ORDER BY prendas_centavos DESC`,
    ),
  ]);
  const t = totales.results[0] as Record<string, number>;
  return {
    desde,
    hasta,
    totales: { ...t, ticket_promedio_centavos: t.pedidos ? Math.round(t.ventas_centavos / t.pedidos) : 0 },
    porDia: porDia.results,
    porMes: porMes.results,
    productos: productos.results,
    pagos: pagos.results,
    zonas: zonas.results,
    marcas: marcas.results,
  };
}
