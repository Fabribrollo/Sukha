// Carritos abandonados (manual, como Tiendanube): el checkout avisa el email y el carrito; el panel los lista para escribir
// a mano por Gmail o WhatsApp con un link de recuperación. No se manda ningún email automático.
import { ErrorApp } from '../utils/errores';
import { AHORA_SQL } from '../utils/http';
import { productoVisibleSql } from './catalogo.service';
import { precioVigenteSql } from './promociones.service';

type Item = { varianteId: number; cantidad: number };
// Aparece en el panel recién a los 60 minutos (si no compró antes) y se borra a los 30 días.
const ESPERA_MINUTOS = 60;
const DIAS_QUE_SE_GUARDA = 30;

const codigoNuevo = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);

// Precio actual de lo que tiene el carrito (solo productos publicados y variantes activas).
async function totalDe(d1: D1Database, items: Item[]) {
  if (!items.length) return 0;
  const { results } = await d1
    .prepare(
      `SELECT v.id, ${precioVigenteSql('p')} AS precio FROM variante v JOIN producto p ON p.id = v.producto_id
        WHERE v.activa = 1 AND ${productoVisibleSql('p')} AND v.id IN (${items.map(() => '?').join(',')})`,
    )
    .bind(...items.map((i) => i.varianteId))
    .all<{ id: number; precio: number }>();
  return items.reduce((s, i) => s + (results.find((r) => r.id === i.varianteId)?.precio ?? 0) * i.cantidad, 0);
}

// Lo llama el checkout al seguir de un paso. Si la clienta ya tenía un carrito guardado, se actualiza y vuelve a
// «sin contactar» solo si había quedado recuperada (empezó una compra nueva).
export async function guardarCarrito(d1: D1Database, d: { email: string; nombre?: string | null; telefono?: string | null; items: Item[] }) {
  const total = await totalDe(d1, d.items);
  await d1
    .prepare(
      `INSERT INTO carrito_abandonado (codigo, email, nombre, telefono, items, total_centavos) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(email) DO UPDATE SET
         nombre = coalesce(excluded.nombre, nombre), telefono = coalesce(excluded.telefono, telefono),
         items = excluded.items, total_centavos = excluded.total_centavos, actualizado_en = ${AHORA_SQL},
         estado = CASE WHEN estado = 'recuperada' THEN 'sin_contactar' ELSE estado END,
         creado_en = CASE WHEN estado = 'recuperada' THEN ${AHORA_SQL} ELSE creado_en END`,
    )
    .bind(codigoNuevo(), d.email, d.nombre ?? null, d.telefono ?? null, JSON.stringify(d.items), total)
    .run();
}

// Para el link de recuperación: las prendas que siguen a la venta, con lo que muestra el carrito y la cantidad
// recortada al stock de hoy (nunca el email ni los datos de la clienta).
export async function itemsDeCarrito(d1: D1Database, codigo: string) {
  const fila = await d1.prepare('SELECT items FROM carrito_abandonado WHERE codigo = ?').bind(codigo).first<{ items: string }>();
  if (!fila) throw new ErrorApp(404, 'Ese link ya no está disponible.');
  const items = JSON.parse(fila.items) as Item[];
  if (!items.length) return { lineas: [] };
  const { results } = await d1
    .prepare(
      `SELECT v.id AS varianteId, v.stock, p.nombre, p.slug, t.nombre AS talle, c.nombre AS color,
              ${precioVigenteSql('p')} AS precioCentavos,
              (SELECT clave FROM imagen WHERE producto_id = p.id AND (color_id IS NULL OR color_id = v.color_id) ORDER BY color_id IS NULL, orden, id LIMIT 1) AS foto
         FROM variante v JOIN producto p ON p.id = v.producto_id LEFT JOIN talle t ON t.id = v.talle_id LEFT JOIN color c ON c.id = v.color_id
        WHERE v.activa = 1 AND ${productoVisibleSql('p')} AND v.stock > 0 AND v.id IN (${items.map(() => '?').join(',')})`,
    )
    .bind(...items.map((i) => i.varianteId))
    .all<{ varianteId: number; stock: number; nombre: string; slug: string; talle: string | null; color: string | null; precioCentavos: number; foto: string | null }>();
  const lineas = items.flatMap((i) => {
    const v = results.find((r) => r.varianteId === i.varianteId);
    if (!v) return [];
    const { stock, ...linea } = v;
    return [{ ...linea, cantidad: Math.min(i.cantidad, stock) }];
  });
  return { lineas, faltan: items.length - lineas.length };
}

// Lista del panel: los de más de 60 minutos y menos de 30 días, con las prendas y si todavía hay stock.
export async function listarCarritos(d1: D1Database) {
  const { results } = await d1
    .prepare(
      `SELECT id, codigo, email, nombre, telefono, items, total_centavos, estado, actualizado_en, contactado_en FROM carrito_abandonado
        WHERE actualizado_en <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${ESPERA_MINUTOS} minutes') ORDER BY actualizado_en DESC LIMIT 300`,
    )
    .all<{ id: number; codigo: string; email: string; nombre: string | null; telefono: string | null; items: string; total_centavos: number; estado: string; actualizado_en: string; contactado_en: string | null }>();
  const ids = [...new Set(results.flatMap((c) => (JSON.parse(c.items) as Item[]).map((i) => i.varianteId)))];
  const variantes = ids.length
    ? (
        await d1
          .prepare(
            `SELECT v.id, v.stock, v.activa, p.estado, p.nombre, p.slug, t.nombre AS talle, c.nombre AS color,
                    (SELECT clave FROM imagen WHERE producto_id = p.id ORDER BY orden, id LIMIT 1) AS foto
               FROM variante v JOIN producto p ON p.id = v.producto_id LEFT JOIN talle t ON t.id = v.talle_id LEFT JOIN color c ON c.id = v.color_id
              WHERE v.id IN (${ids.map(() => '?').join(',')})`,
          )
          .bind(...ids)
          .all<{ id: number; stock: number; activa: number; estado: string; nombre: string; slug: string; talle: string | null; color: string | null; foto: string | null }>()
      ).results
    : [];
  return results.map(({ items, ...c }) => {
    const prendas = (JSON.parse(items) as Item[]).map((i) => {
      const v = variantes.find((x) => x.id === i.varianteId);
      return { cantidad: i.cantidad, nombre: v?.nombre ?? 'Producto que ya no está', talle: v?.talle ?? null, color: v?.color ?? null, foto: v?.foto ?? null, disponible: !!v && v.activa === 1 && v.estado === 'publicado' && v.stock >= i.cantidad };
    });
    return { ...c, prendas, conStock: prendas.length > 0 && prendas.every((p) => p.disponible) };
  });
}

export async function marcarCarrito(d1: D1Database, id: number, estado: 'sin_contactar' | 'contactada') {
  const r = await d1
    .prepare(`UPDATE carrito_abandonado SET estado = ?, contactado_en = CASE WHEN ? = 'contactada' THEN ${AHORA_SQL} ELSE NULL END WHERE id = ? AND estado <> 'recuperada'`)
    .bind(estado, estado, id)
    .run();
  if (!r.meta.changes) throw new ErrorApp(404, 'Ese carrito no existe o ya se recuperó.');
  return { ok: true };
}

// Lo corre la tarea programada.
export const borrarCarritosViejos = (d1: D1Database) =>
  d1.prepare(`DELETE FROM carrito_abandonado WHERE actualizado_en < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${DIAS_QUE_SE_GUARDA} days')`).run();

// Sentencia para el lote que crea un pedido: el carrito de ese email pasa a recuperado.
export const sentenciaRecuperado = (d1: D1Database, email: string) =>
  d1.prepare(`UPDATE carrito_abandonado SET estado = 'recuperada', actualizado_en = ${AHORA_SQL} WHERE email = ? AND estado <> 'recuperada'`).bind(email);
