import { desc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../config';
import { categoria, coleccion, promocion } from '../db/schema';
import { AHORA_SQL } from '../utils/http';
import { guardando, noEncontrado } from '../utils/errores';
import type { EdicionPromocion, NuevaPromocion } from '../validations/tienda.validation';

// Promociones por categoría o colección. La liquidación baja el precio que paga la clienta (se calcula al leer, así
// empieza y termina sola en las fechas); el 2x1 y el 3x2 los descuenta `calcularTotales` al armar el pedido.
// Los fragmentos SQL se usan en toda consulta que lee el precio de un producto (`p` = el alias de `producto`).

const vigente = `pr.activa = 1 AND (pr.desde IS NULL OR pr.desde <= ${AHORA_SQL}) AND (pr.hasta IS NULL OR pr.hasta > ${AHORA_SQL})`;
// Una promoción de una categoría principal alcanza también a sus subcategorías.
const alcance = (p: string) =>
  `(pr.categoria_id IN (${p}.categoria_id, (SELECT padre_id FROM categoria WHERE id = ${p}.categoria_id))
    OR EXISTS (SELECT 1 FROM producto_coleccion pc WHERE pc.producto_id = ${p}.id AND pc.coleccion_id = pr.coleccion_id))`;

// Lo que paga la clienta: el menor entre el precio de oferta y el precio con la mayor liquidación vigente.
export const precioVigenteSql = (p = 'p') =>
  `min(coalesce(${p}.precio_oferta_centavos, ${p}.precio_centavos),
       ${p}.precio_centavos - ${p}.precio_centavos * coalesce((SELECT max(pr.porcentaje) FROM promocion pr WHERE pr.tipo = 'liquidacion' AND ${vigente} AND ${alcance(p)}), 0) / 100)`;
// El precio de oferta que se muestra (tachando el precio de lista), o NULL si no hay rebaja.
export const ofertaVigenteSql = (p = 'p') => `CASE WHEN ${precioVigenteSql(p)} < ${p}.precio_centavos THEN ${precioVigenteSql(p)} END`;
// La promoción 2x1 o 3x2 vigente del producto (la más nueva): `id` o `tipo`.
export const comboSql = (campo: 'id' | 'tipo' | 'nombre', p = 'p') =>
  `(SELECT pr.${campo} FROM promocion pr WHERE pr.tipo IN ('2x1', '3x2') AND ${vigente} AND ${alcance(p)} ORDER BY pr.id DESC LIMIT 1)`;

export async function listarPromociones(db: Db) {
  return db
    .select({
      id: promocion.id,
      nombre: promocion.nombre,
      tipo: promocion.tipo,
      porcentaje: promocion.porcentaje,
      categoriaId: promocion.categoriaId,
      coleccionId: promocion.coleccionId,
      desde: promocion.desde,
      hasta: promocion.hasta,
      activa: promocion.activa,
      categoria: categoria.nombre,
      coleccion: coleccion.nombre,
    })
    .from(promocion)
    .leftJoin(categoria, eq(categoria.id, promocion.categoriaId))
    .leftJoin(coleccion, eq(coleccion.id, promocion.coleccionId))
    .orderBy(desc(promocion.activa), desc(promocion.id));
}

export function crearPromocion(db: Db, d: z.infer<typeof NuevaPromocion>) {
  return guardando('una promoción', async () => {
    const [fila] = await db
      .insert(promocion)
      .values({ ...d, porcentaje: d.tipo === 'liquidacion' ? d.porcentaje : null })
      .returning();
    return fila;
  });
}

export function editarPromocion(db: Db, id: number, d: z.infer<typeof EdicionPromocion>) {
  return guardando('una promoción', async () => {
    const [fila] = await db.update(promocion).set(d).where(eq(promocion.id, id)).returning();
    if (!fila) throw noEncontrado('la promoción');
    return fila;
  });
}
