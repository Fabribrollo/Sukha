import { and, desc, eq, getTableColumns, inArray, isNull, like, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { type Db, TAMANOS_FOTO } from '../config';
import { categoria, coleccion, color, imagen, marca, material, producto, productoColeccion, productoMaterial, talle, variante } from '../db/schema';
import { ErrorApp, guardando, noEncontrado, violaCheck } from '../utils/errores';
import { ahora } from '../utils/http';
import { aSlug } from '../utils/texto';
import { redirigirSlug } from './redirecciones.service';
import type {
  EdicionCategoria,
  EdicionColeccion,
  EdicionProducto,
  EdicionVariante,
  MovimientoStock,
  NuevaCategoria,
  NuevaColeccion,
  NuevaVariante,
  NuevoLote,
  NuevoProducto,
} from '../validations/catalogo.validation';

// ───────────── Categorías y colecciones ─────────────

const guia = (g: unknown) => (g === undefined ? undefined : g === null ? null : JSON.stringify(g));

// Con la cantidad de productos de cada una, para el panel.
export const listarCategorias = (db: Db) =>
  db
    .select({ ...getTableColumns(categoria), productos: sql<number>`(SELECT count(*) FROM producto p WHERE p.categoria_id = categoria.id)` })
    .from(categoria)
    .orderBy(categoria.orden, categoria.nombre);

// Una categoría puede colgar de una principal, nunca de otra subcategoría ni de sí misma,
// y una que ya tiene subcategorías no puede pasar a ser subcategoría.
async function validarPadre(db: Db, idPropio: number | null, padreId: number | null | undefined) {
  if (!padreId) return;
  if (padreId === idPropio) throw new ErrorApp(400, 'Una categoría no puede ser su propia categoría principal.');
  const [padre] = await db.select({ padreId: categoria.padreId }).from(categoria).where(eq(categoria.id, padreId));
  if (!padre) throw noEncontrado('la categoría principal');
  if (padre.padreId) throw new ErrorApp(400, 'Solo se permite un nivel de subcategorías: elegí una categoría principal.');
  if (idPropio) {
    const [hija] = await db.select({ id: categoria.id }).from(categoria).where(eq(categoria.padreId, idPropio)).limit(1);
    if (hija) throw new ErrorApp(400, 'Esta categoría tiene subcategorías, así que no puede pasar a ser una subcategoría.');
  }
}

export async function crearCategoria(db: Db, d: z.infer<typeof NuevaCategoria>) {
  await validarPadre(db, null, d.padreId);
  // Sin orden explícito, va al final de su grupo.
  const orden =
    d.orden ??
    ((
      await db
        .select({ max: sql<number>`coalesce(max(${categoria.orden}), 0)` })
        .from(categoria)
        .where(d.padreId ? eq(categoria.padreId, d.padreId) : isNull(categoria.padreId))
    )[0].max + 1);
  return guardando('una categoría', async () => {
    const [fila] = await db
      .insert(categoria)
      .values({ ...d, orden, slug: d.slug ?? aSlug(d.nombre), guiaTalles: guia(d.guiaTalles) })
      .returning();
    return fila;
  });
}

// Guarda el orden de un grupo de hermanas: la primera de la lista queda primera.
export async function ordenarCategorias(db: Db, ids: number[]) {
  const filas = await db.select({ id: categoria.id, padreId: categoria.padreId }).from(categoria).where(inArray(categoria.id, ids));
  if (filas.length !== new Set(ids).size) throw noEncontrado('alguna de las categorías');
  if (new Set(filas.map((f) => f.padreId)).size > 1) throw new ErrorApp(400, 'Solo se pueden ordenar categorías del mismo nivel.');
  await db.batch(ids.map((id, i) => db.update(categoria).set({ orden: i + 1 }).where(eq(categoria.id, id))) as [any, ...any[]]);
  return { ok: true };
}

export async function editarCategoria(db: Db, id: number, d: z.infer<typeof EdicionCategoria>) {
  await validarPadre(db, id, d.padreId);
  return guardando('una categoría', async () => {
    const [antes] = await db.select({ slug: categoria.slug }).from(categoria).where(eq(categoria.id, id));
    const [fila] = await db
      .update(categoria)
      .set({ ...d, guiaTalles: guia(d.guiaTalles) })
      .where(eq(categoria.id, id))
      .returning();
    if (!fila) throw noEncontrado('la categoría');
    // Si cambió la dirección, la vieja manda a la nueva.
    if (antes && antes.slug !== fila.slug) await redirigirSlug(db, `/categoria/${antes.slug}`, `/categoria/${fila.slug}`);
    return fila;
  });
}

// Cada colección trae los ids de sus productos, para armar el panel sin pedir una lista por colección.
export async function listarColecciones(db: Db) {
  const [colecciones, vinculos] = await db.batch([
    db.select().from(coleccion).orderBy(coleccion.nombre),
    db.select().from(productoColeccion),
  ]);
  return colecciones.map((c) => ({ ...c, productoIds: vinculos.filter((v) => v.coleccionId === c.id).map((v) => v.productoId) }));
}

export async function agregarProductosAColeccion(db: Db, coleccionId: number, productoIds: number[]) {
  const ids = [...new Set(productoIds)];
  const [[c], existentes] = await db.batch([
    db.select({ id: coleccion.id }).from(coleccion).where(eq(coleccion.id, coleccionId)),
    db.select({ id: producto.id }).from(producto).where(inArray(producto.id, ids)),
  ]);
  if (!c) throw noEncontrado('la colección');
  if (existentes.length !== ids.length) throw noEncontrado('alguno de los productos');
  // D1 acepta pocos parámetros por consulta: se inserta de a tandas, todas en un solo lote.
  const tandas: number[][] = [];
  for (let i = 0; i < ids.length; i += 40) tandas.push(ids.slice(i, i + 40));
  await db.batch(tandas.map((t) => db.insert(productoColeccion).values(t.map((productoId) => ({ coleccionId, productoId }))).onConflictDoNothing()) as [any, ...any[]]);
  return { ok: true, agregados: ids.length };
}

export async function quitarProductoDeColeccion(db: Db, coleccionId: number, productoId: number) {
  await db.delete(productoColeccion).where(and(eq(productoColeccion.coleccionId, coleccionId), eq(productoColeccion.productoId, productoId)));
  return { ok: true };
}

// Una categoría se borra solo si quedó vacía: con productos o subcategorías adentro, primero hay que pasarlos a otra (los pedidos viejos los referencian).
export async function verificarBorrarCategoria(db: Db, id: number) {
  const [fila] = await db.select({ id: categoria.id }).from(categoria).where(eq(categoria.id, id));
  if (!fila) throw noEncontrado('la categoría');
  const [{ productos }] = await db.select({ productos: sql<number>`count(*)` }).from(producto).where(eq(producto.categoriaId, id));
  const [{ hijas }] = await db.select({ hijas: sql<number>`count(*)` }).from(categoria).where(eq(categoria.padreId, id));
  if (productos > 0) throw new ErrorApp(409, `Tiene ${productos} ${productos === 1 ? 'producto' : 'productos'}: pasalos a otra categoría antes de borrarla.`);
  if (hijas > 0) throw new ErrorApp(409, `Tiene ${hijas} ${hijas === 1 ? 'subcategoría' : 'subcategorías'}: borralas o movelas antes de borrarla.`);
}
export async function eliminarCategoria(db: Db, id: number) {
  await verificarBorrarCategoria(db, id);
  await db.delete(categoria).where(eq(categoria.id, id));
  return { ok: true };
}

// Borrar una colección solo la deshace: sus prendas siguen en la tienda (y se van con ella las promociones que apuntaban a esa colección).
export async function eliminarColeccion(db: Db, id: number) {
  const [fila] = await db.delete(coleccion).where(eq(coleccion.id, id)).returning({ id: coleccion.id });
  if (!fila) throw noEncontrado('la colección');
  return { ok: true };
}

export function crearColeccion(db: Db, d: z.infer<typeof NuevaColeccion>) {
  return guardando('una colección', async () => {
    const [fila] = await db.insert(coleccion).values({ ...d, slug: d.slug ?? aSlug(d.nombre) }).returning();
    return fila;
  });
}

export function editarColeccion(db: Db, id: number, d: z.infer<typeof EdicionColeccion>) {
  return guardando('una colección', async () => {
    const [antes] = await db.select({ slug: coleccion.slug }).from(coleccion).where(eq(coleccion.id, id));
    const [fila] = await db.update(coleccion).set(d).where(eq(coleccion.id, id)).returning();
    if (!fila) throw noEncontrado('la colección');
    if (antes && antes.slug !== fila.slug) await redirigirSlug(db, `/coleccion/${antes.slug}`, `/coleccion/${fila.slug}`);
    return fila;
  });
}

// ───────────── Productos ─────────────

export function listarProductos(db: Db, filtro: { estado?: string; q?: string; marcaId?: number }) {
  return db
    .select({
      id: producto.id,
      nombre: producto.nombre,
      slug: producto.slug,
      estado: producto.estado,
      precioCentavos: producto.precioCentavos,
      precioOfertaCentavos: producto.precioOfertaCentavos,
      categoria: categoria.nombre,
      marca: marca.nombre,
      marcaId: producto.marcaId,
      stock: sql<number>`(SELECT coalesce(sum(stock), 0) FROM variante WHERE producto_id = ${producto.id} AND activa = 1)`,
      foto: sql<string | null>`(SELECT clave FROM imagen WHERE producto_id = ${producto.id} ORDER BY orden, id LIMIT 1)`,
    })
    .from(producto)
    .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
    .leftJoin(marca, eq(marca.id, producto.marcaId))
    .where(
      and(
        filtro.estado ? eq(producto.estado, filtro.estado) : undefined,
        filtro.marcaId ? eq(producto.marcaId, filtro.marcaId) : undefined,
        filtro.q ? like(producto.nombre, `%${filtro.q}%`) : undefined,
      ),
    )
    .orderBy(desc(producto.creadoEn));
}

export async function obtenerProducto(db: Db, id: number) {
  const [[fila], variantes, imagenes, colecciones, materiales] = await db.batch([
    db.select().from(producto).where(eq(producto.id, id)),
    db
      .select({
        id: variante.id,
        sku: variante.sku,
        stock: variante.stock,
        activa: variante.activa,
        talleId: variante.talleId,
        // Con alias: dentro de un lote de D1, dos columnas con el mismo nombre (talle.nombre y color.nombre) se pisan.
        talle: sql<string | null>`${talle.nombre}`.as('talle_nombre'),
        colorId: variante.colorId,
        color: sql<string | null>`${color.nombre}`.as('color_nombre'),
      })
      .from(variante)
      .leftJoin(talle, eq(talle.id, variante.talleId))
      .leftJoin(color, eq(color.id, variante.colorId))
      .where(eq(variante.productoId, id))
      .orderBy(color.orden, color.nombre, talle.orden),
    db.select().from(imagen).where(eq(imagen.productoId, id)).orderBy(imagen.orden, imagen.id),
    db.select({ id: productoColeccion.coleccionId }).from(productoColeccion).where(eq(productoColeccion.productoId, id)),
    db.select({ id: productoMaterial.materialId }).from(productoMaterial).where(eq(productoMaterial.productoId, id)),
  ]);
  if (!fila) throw noEncontrado('el producto');
  return { ...fila, variantes, imagenes, coleccionIds: colecciones.map((c) => c.id), materialIds: materiales.map((m) => m.id) };
}

// Reemplaza las colecciones del producto por las indicadas.
const sentenciasColecciones = (db: Db, productoId: number, ids: number[]) => [
  db.delete(productoColeccion).where(eq(productoColeccion.productoId, productoId)),
  ...ids.map((coleccionId) => db.insert(productoColeccion).values({ productoId, coleccionId })),
];

// Reemplaza los materiales del producto por los indicados.
const sentenciasMateriales = (db: Db, productoId: number, ids: number[]) => [
  db.delete(productoMaterial).where(eq(productoMaterial.productoId, productoId)),
  ...[...new Set(ids)].map((materialId) => db.insert(productoMaterial).values({ productoId, materialId })),
];

// Si el slug ya está tomado se le agrega un sufijo, así el alta no falla por el nombre repetido.
async function slugLibre(db: Db, base: string) {
  const [existe] = await db.select({ id: producto.id }).from(producto).where(eq(producto.slug, base));
  return existe ? `${base}-${Date.now().toString(36)}` : base;
}

export function crearProducto(db: Db, d: z.infer<typeof NuevoProducto>) {
  return guardando('un producto', async () => {
    const { coleccionIds = [], materialIds = [], ...campos } = d;
    const [fila] = await db
      .insert(producto)
      .values({ ...campos, slug: d.slug ?? (await slugLibre(db, aSlug(d.nombre))) })
      .returning();
    if (coleccionIds.length || materialIds.length) await db.batch([...sentenciasColecciones(db, fila.id, coleccionIds), ...sentenciasMateriales(db, fila.id, materialIds)] as [any, ...any[]]);
    return obtenerProducto(db, fila.id);
  });
}

// Un producto se puede guardar como borrador con lo mínimo, pero para publicarlo
// necesita al menos una variante activa con stock y una foto.
async function verificarPublicable(db: Db, id: number) {
  const [r] = await db
    .select({
      conStock: sql<number>`(SELECT count(*) FROM variante WHERE producto_id = ${id} AND activa = 1 AND stock > 0)`,
      fotos: sql<number>`(SELECT count(*) FROM imagen WHERE producto_id = ${id})`,
    })
    .from(producto)
    .where(eq(producto.id, id));
  if (!r) throw noEncontrado('el producto');
  if (!r.conStock) throw new ErrorApp(409, 'Para publicar hace falta al menos una variante activa con stock.');
  if (!r.fotos) throw new ErrorApp(409, 'Para publicar hace falta al menos una foto.');
}

export function editarProducto(db: Db, id: number, d: z.infer<typeof EdicionProducto>) {
  return guardando('un producto', async () => {
    if (d.estado === 'publicado') await verificarPublicable(db, id);
    // La foto para compartir tiene que ser una de las fotos de este producto.
    if (d.seoImagen) {
      const [propia] = await db.select({ id: imagen.id }).from(imagen).where(and(eq(imagen.productoId, id), eq(imagen.clave, d.seoImagen)));
      if (!propia) throw new ErrorApp(400, 'La foto para compartir tiene que ser una de las fotos del producto.');
    }
    const [antes] = await db.select({ slug: producto.slug }).from(producto).where(eq(producto.id, id));
    const { coleccionIds, materialIds, ...campos } = d;
    try {
      const [fila] = await db
        .update(producto)
        .set({ ...campos, actualizadoEn: ahora() })
        .where(eq(producto.id, id))
        .returning({ id: producto.id });
      if (!fila) throw noEncontrado('el producto');
    } catch (e) {
      // La base compara la oferta contra el precio guardado, aunque se edite uno solo de los dos.
      if (violaCheck(e, 'precio_oferta')) throw new ErrorApp(400, 'El precio de oferta tiene que ser menor al precio.');
      throw e;
    }
    if (coleccionIds) await db.batch(sentenciasColecciones(db, id, coleccionIds) as [any, ...any[]]);
    if (materialIds) await db.batch(sentenciasMateriales(db, id, materialIds) as [any, ...any[]]);
    if (antes && d.slug && antes.slug !== d.slug) await redirigirSlug(db, `/producto/${antes.slug}`, `/producto/${d.slug}`);
    return obtenerProducto(db, id);
  });
}

// Carga rápida: crea varios productos con sus variantes y su stock inicial en un solo lote de D1 (o se crean todos o ninguno).
// Nacen como borrador; las fotos se suben después, producto por producto. Como las variantes se escriben antes de conocer
// el id del producto, se enlazan por el slug (que es único).
export async function crearProductosEnLote(d1: D1Database, adminId: number, lote: z.infer<typeof NuevoLote>) {
  const usados = new Set(((await d1.prepare('SELECT slug FROM producto').all()).results as { slug: string }[]).map((f) => f.slug));
  const slugs = lote.productos.map((p) => {
    const base = aSlug(p.nombre) || 'producto';
    let slug = base;
    for (let n = 2; usados.has(slug); n++) slug = `${base}-${n}`;
    usados.add(slug);
    return slug;
  });

  const sentencias: D1PreparedStatement[] = [];
  lote.productos.forEach((p, i) => {
    const slug = slugs[i];
    sentencias.push(
      d1
        .prepare("INSERT INTO producto (categoria_id, nombre, slug, marca_id, precio_centavos, peso_gramos, estado) VALUES (?, ?, ?, ?, ?, ?, 'borrador')")
        .bind(p.categoriaId, p.nombre, slug, p.marcaId ?? null, p.precioCentavos, p.pesoGramos ?? null),
    );
    for (const materialId of new Set(p.materialIds ?? [])) {
      sentencias.push(d1.prepare('INSERT INTO producto_material (producto_id, material_id) SELECT id, ? FROM producto WHERE slug = ?').bind(materialId, slug));
    }
    for (const coleccionId of new Set(p.coleccionIds ?? [])) {
      sentencias.push(d1.prepare('INSERT INTO producto_coleccion (producto_id, coleccion_id) SELECT id, ? FROM producto WHERE slug = ?').bind(coleccionId, slug));
    }
    for (const v of p.variantes) {
      const sku = `${slug}-T${v.talleId ?? 0}-C${v.colorId ?? 0}`.toUpperCase();
      sentencias.push(
        d1.prepare('INSERT INTO variante (producto_id, talle_id, color_id, sku, stock) SELECT id, ?, ?, ?, ? FROM producto WHERE slug = ?').bind(v.talleId ?? null, v.colorId ?? null, sku, v.stock, slug),
      );
      if (v.stock > 0) {
        sentencias.push(
          d1
            .prepare("INSERT INTO movimiento_stock (variante_id, admin_id, tipo, cantidad, nota) SELECT v.id, ?, 'carga', ?, 'Stock inicial' FROM variante v JOIN producto p ON p.id = v.producto_id WHERE p.slug = ? AND v.sku = ?")
            .bind(adminId, v.stock, slug, sku),
        );
      }
    }
  });
  await guardando('los productos', () => d1.batch(sentencias));

  const filas = (await d1.prepare(`SELECT id, slug FROM producto WHERE slug IN (${slugs.map(() => '?').join(',')})`).bind(...slugs).all()).results as { id: number; slug: string }[];
  return { productos: slugs.map((slug) => ({ id: filas.find((f) => f.slug === slug)!.id, slug })) };
}

// Copia los datos y las variantes (sin stock ni fotos) a un borrador nuevo.
export async function duplicarProducto(db: Db, id: number) {
  const original = await obtenerProducto(db, id);
  const { id: _, variantes, imagenes, coleccionIds, materialIds, creadoEn, actualizadoEn, ...campos } = original;
  const [copia] = await db
    .insert(producto)
    .values({
      ...campos,
      nombre: `${original.nombre} (copia)`,
      slug: await slugLibre(db, `${original.slug}-copia`),
      estado: 'borrador',
    })
    .returning();
  const sentencias = [
    ...sentenciasColecciones(db, copia.id, coleccionIds),
    ...sentenciasMateriales(db, copia.id, materialIds),
    ...variantes.map((v) =>
      db.insert(variante).values({ productoId: copia.id, talleId: v.talleId, colorId: v.colorId, sku: `${v.sku}-C${copia.id}` }),
    ),
  ];
  await db.batch(sentencias as [any, ...any[]]);
  return obtenerProducto(db, copia.id);
}

// ───────────── Variantes y stock ─────────────

export async function crearVariante(d1: D1Database, db: Db, adminId: number, productoId: number, d: z.infer<typeof NuevaVariante>) {
  const talleId = d.talleId ?? null;
  const colorId = d.colorId ?? null;
  const sku = (d.sku ?? `P${productoId}-T${talleId ?? 0}-C${colorId ?? 0}`).toUpperCase();
  return guardando('una variante', async () => {
    // El stock inicial entra como una carga, así el libro de movimientos explica todo el stock.
    const sentencias = [
      d1
        .prepare('INSERT INTO variante (producto_id, talle_id, color_id, sku, stock) VALUES (?, ?, ?, ?, ?)')
        .bind(productoId, talleId, colorId, sku, d.stock),
    ];
    if (d.stock > 0) {
      sentencias.push(
        d1
          .prepare(
            "INSERT INTO movimiento_stock (variante_id, admin_id, tipo, cantidad, nota) SELECT id, ?, 'carga', ?, 'Stock inicial' FROM variante WHERE sku = ?",
          )
          .bind(adminId, d.stock, sku),
      );
    }
    await d1.batch(sentencias);
    return obtenerProducto(db, productoId);
  });
}

export function editarVariante(db: Db, id: number, d: z.infer<typeof EdicionVariante>) {
  return guardando('una variante', async () => {
    const [fila] = await db
      .update(variante)
      .set({ ...d, sku: d.sku?.toUpperCase(), actualizadoEn: ahora() })
      .where(eq(variante.id, id))
      .returning();
    if (!fila) throw noEncontrado('la variante');
    return fila;
  });
}

// Cambia el stock y deja el movimiento en el libro, en un solo lote: o se hacen los dos o ninguno.
export async function moverStock(d1: D1Database, adminId: number, varianteId: number, m: z.infer<typeof MovimientoStock>) {
  const delta = m.tipo === 'venta_local' ? -m.cantidad : m.cantidad;
  try {
    const [cambio] = await d1.batch([
      d1
        .prepare("UPDATE variante SET stock = stock + ?, actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
        .bind(delta, varianteId),
      d1
        .prepare(
          'INSERT INTO movimiento_stock (variante_id, admin_id, tipo, cantidad, nota) SELECT id, ?, ?, ?, ? FROM variante WHERE id = ?',
        )
        .bind(adminId, m.tipo, delta, m.nota, varianteId),
    ]);
    if (!cambio.meta.changes) throw noEncontrado('la variante');
  } catch (e) {
    if (violaCheck(e, 'stock')) throw new ErrorApp(409, 'No hay stock suficiente para descontar esa cantidad.');
    throw e;
  }
  const fila = await d1.prepare('SELECT id, sku, stock FROM variante WHERE id = ?').bind(varianteId).first();
  return fila;
}

export function movimientosDeVariante(d1: D1Database, varianteId: number) {
  return d1
    .prepare('SELECT * FROM movimiento_stock WHERE variante_id = ? ORDER BY id DESC LIMIT 100')
    .bind(varianteId)
    .all()
    .then((r) => r.results);
}

// ───────────── Borrar ─────────────

// Borra un producto con sus variantes, movimientos de stock y fotos.
// Si ya tuvo ventas no se puede borrar (los pedidos lo referencian): en ese caso se oculta de la tienda.
export async function eliminarProducto(d1: D1Database, kv: KVNamespace, id: number): Promise<'borrado' | 'oculto'> {
  const [existe, ventas, fotos] = await d1.batch([
    d1.prepare('SELECT id FROM producto WHERE id = ?').bind(id),
    d1.prepare('SELECT count(*) AS n FROM pedido_item WHERE variante_id IN (SELECT id FROM variante WHERE producto_id = ?)').bind(id),
    d1.prepare('SELECT clave FROM imagen WHERE producto_id = ?').bind(id),
  ]);
  if (!existe.results.length) throw noEncontrado('el producto');

  if ((ventas.results[0] as { n: number }).n > 0) {
    await d1.prepare("UPDATE producto SET estado = 'oculto', destacado = 0, actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(id).run();
    return 'oculto';
  }

  await d1.batch([
    d1.prepare('DELETE FROM movimiento_stock WHERE variante_id IN (SELECT id FROM variante WHERE producto_id = ?)').bind(id),
    d1.prepare('DELETE FROM variante WHERE producto_id = ?').bind(id),
    d1.prepare('DELETE FROM imagen WHERE producto_id = ?').bind(id),
    d1.prepare('DELETE FROM producto WHERE id = ?').bind(id),
  ]);
  // Los archivos de las fotos se borran después: si esto fallara quedarían huérfanos, pero el producto ya no existe.
  const claves = (fotos.results as { clave: string }[]).flatMap((f) => TAMANOS_FOTO.map((t) => `${f.clave}/${t}.webp`));
  await Promise.all(claves.map((clave) => kv.delete(clave)));
  return 'borrado';
}

// Cuidados ya cargados en otros productos, para ofrecerlos en el panel sin tener que reescribirlos.
export async function sugerencias(d1: D1Database) {
  const [cuidados] = await d1.batch([
    d1.prepare("SELECT DISTINCT cuidados AS valor FROM producto WHERE cuidados IS NOT NULL AND cuidados <> '' ORDER BY cuidados LIMIT 200"),
  ]);
  const valores = (r: D1Result) => (r.results as { valor: string }[]).map((f) => f.valor);
  return { cuidados: valores(cuidados) };
}
