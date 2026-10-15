import { and, asc, desc, eq, gte, isNull, like, lte, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { type Db, PRODUCTOS_POR_PAGINA } from '../config';
import { categoria, coleccion, color, imagen, producto, talle, variante } from '../db/schema';
import { noEncontrado } from '../utils/errores';

// Catálogo público: solo productos publicados y variantes activas.
// Una categoría se ve si está activa y, siendo subcategoría, también su categoría principal.
const padre = alias(categoria, 'padre');
const categoriaVisible = and(eq(categoria.activa, 1), or(isNull(padre.id), eq(padre.activa, 1)));

// Precio que paga la clienta: el de oferta si hay.
const precioFinal = sql<number>`coalesce(${producto.precioOfertaCentavos}, ${producto.precioCentavos})`;

const tarjeta = {
  id: producto.id,
  nombre: producto.nombre,
  slug: producto.slug,
  precioCentavos: producto.precioCentavos,
  precioOfertaCentavos: producto.precioOfertaCentavos,
  // Con alias: dentro de un lote de D1, dos columnas con el mismo nombre (producto.slug y categoria.slug) se pisan.
  categoria: sql<string>`${categoria.slug}`.as('categoria_slug'),
  foto: sql<string | null>`(SELECT clave FROM imagen WHERE producto_id = ${producto.id} ORDER BY orden, id LIMIT 1)`,
  // Sin stock se sigue mostrando, como "Agotado".
  disponible: sql<number>`EXISTS (SELECT 1 FROM variante WHERE producto_id = ${producto.id} AND activa = 1 AND stock > 0)`,
};

type FilaCategoria = { id: number; nombre: string; slug: string; padreId: number | null };

// Categorías principales con sus subcategorías. Si la principal está oculta, ni ella ni sus hijas llegan acá.
const arbolDeCategorias = (activas: FilaCategoria[]) =>
  activas
    .filter((c) => !c.padreId)
    .map((c) => ({
      nombre: c.nombre,
      slug: c.slug,
      hijas: activas.filter((h) => h.padreId === c.id).map((h) => ({ nombre: h.nombre, slug: h.slug })),
    }));

export async function listarFiltros(db: Db) {
  // Solo se ofrecen talles y colores con stock en algún producto publicado: un filtro que da cero resultados no sirve.
  const conStock = (columna: 'talle_id' | 'color_id', tabla: typeof talle | typeof color) =>
    sql`EXISTS (SELECT 1 FROM variante v JOIN producto p ON p.id = v.producto_id
      WHERE v.${sql.raw(columna)} = ${tabla.id} AND v.activa = 1 AND v.stock > 0 AND p.estado = 'publicado')`;
  const [categorias, colecciones, talles, colores, [precios]] = await db.batch([
    db
      .select({ id: categoria.id, nombre: categoria.nombre, slug: categoria.slug, padreId: categoria.padreId })
      .from(categoria)
      .where(eq(categoria.activa, 1))
      .orderBy(categoria.orden, categoria.nombre),
    db.select({ nombre: coleccion.nombre, slug: coleccion.slug }).from(coleccion).where(eq(coleccion.activa, 1)),
    db.select().from(talle).where(conStock('talle_id', talle)).orderBy(talle.orden),
    db.select().from(color).where(conStock('color_id', color)).orderBy(color.nombre),
    db
      .select({ min: sql<number | null>`min(${precioFinal})`, max: sql<number | null>`max(${precioFinal})` })
      .from(producto)
      .where(eq(producto.estado, 'publicado')),
  ]);
  return { categorias: arbolDeCategorias(categorias), colecciones, talles, colores, precio: { min: precios?.min ?? 0, max: precios?.max ?? 0 } };
}

export type FiltroCatalogo = {
  categoria?: string;
  coleccion?: string;
  talleIds?: number[];
  colorIds?: number[];
  min?: number;
  max?: number;
  q?: string;
  oferta?: boolean;
  destacado?: boolean;
  // Cantidad a devolver; por defecto, una página.
  limite?: number;
  orden?: string;
  pagina?: number;
};

export async function listarProductos(db: Db, f: FiltroCatalogo) {
  // Talle y color filtran por variantes que tengan stock de esa opción.
  const conVariante =
    f.talleIds?.length || f.colorIds?.length
      ? sql`EXISTS (SELECT 1 FROM variante v WHERE v.producto_id = ${producto.id} AND v.activa = 1 AND v.stock > 0
          ${f.talleIds?.length ? sql`AND v.talle_id IN (${sql.join(f.talleIds.map((i) => sql`${i}`), sql`, `)})` : sql``}
          ${f.colorIds?.length ? sql`AND v.color_id IN (${sql.join(f.colorIds.map((i) => sql`${i}`), sql`, `)})` : sql``})`
      : undefined;
  const filtros = and(
    eq(producto.estado, 'publicado'),
    categoriaVisible,
    // Pedir una categoría principal incluye los productos de sus subcategorías.
    f.categoria ? or(eq(categoria.slug, f.categoria), eq(padre.slug, f.categoria)) : undefined,
    f.coleccion
      ? sql`EXISTS (SELECT 1 FROM producto_coleccion pc JOIN coleccion co ON co.id = pc.coleccion_id
          WHERE pc.producto_id = ${producto.id} AND co.activa = 1 AND co.slug = ${f.coleccion})`
      : undefined,
    conVariante,
    f.min ? gte(precioFinal, f.min) : undefined,
    f.max ? lte(precioFinal, f.max) : undefined,
    f.q ? like(producto.nombre, `%${f.q}%`) : undefined,
    f.oferta ? sql`${producto.precioOfertaCentavos} IS NOT NULL` : undefined,
    f.destacado ? eq(producto.destacado, 1) : undefined,
  );
  const orden =
    f.orden === 'precio_asc' ? asc(precioFinal) : f.orden === 'precio_desc' ? desc(precioFinal) : desc(producto.creadoEn);
  const pagina = Math.max(1, f.pagina ?? 1);
  const limite = Math.min(PRODUCTOS_POR_PAGINA, Math.max(1, f.limite ?? PRODUCTOS_POR_PAGINA));

  const [productos, [{ total }]] = await db.batch([
    db
      .select(tarjeta)
      .from(producto)
      .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
      .leftJoin(padre, eq(padre.id, categoria.padreId))
      .where(filtros)
      .orderBy(orden, desc(producto.id))
      .limit(limite)
      .offset((pagina - 1) * limite),
    db
      .select({ total: sql<number>`count(*)` })
      .from(producto)
      .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
      .leftJoin(padre, eq(padre.id, categoria.padreId))
      .where(filtros),
  ]);
  return { productos, total, pagina, porPagina: limite };
}

export async function obtenerProducto(db: Db, slug: string) {
  const [fila] = await db
    .select({
      id: producto.id,
      nombre: producto.nombre,
      slug: producto.slug,
      descripcion: producto.descripcion,
      material: producto.material,
      cuidados: producto.cuidados,
      precioCentavos: producto.precioCentavos,
      precioOfertaCentavos: producto.precioOfertaCentavos,
      categoriaId: producto.categoriaId,
      categoria: categoria.nombre,
      categoriaSlug: categoria.slug,
      // Con alias: dentro de un lote de D1, columnas con el mismo nombre se pisan.
      padreNombre: sql<string | null>`${padre.nombre}`.as('padre_nombre'),
      padreSlug: sql<string | null>`${padre.slug}`.as('padre_slug'),
      guiaTalles: categoria.guiaTalles,
      guiaPadre: sql<string | null>`${padre.guiaTalles}`.as('padre_guia'),
    })
    .from(producto)
    .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
    .leftJoin(padre, eq(padre.id, categoria.padreId))
    .where(and(eq(producto.slug, slug), eq(producto.estado, 'publicado')));
  if (!fila) throw noEncontrado('el producto');

  const [variantes, imagenes, relacionados] = await db.batch([
    db
      .select({
        id: variante.id,
        talle: sql<string | null>`${talle.nombre}`.as('talle_nombre'),
        color: sql<string | null>`${color.nombre}`.as('color_nombre'),
        colorId: variante.colorId,
        hex: color.hex,
        stock: variante.stock,
      })
      .from(variante)
      .leftJoin(talle, eq(talle.id, variante.talleId))
      .leftJoin(color, eq(color.id, variante.colorId))
      .where(and(eq(variante.productoId, fila.id), eq(variante.activa, 1)))
      .orderBy(color.nombre, talle.orden),
    db
      .select({ clave: imagen.clave, colorId: imagen.colorId, textoAlternativo: imagen.textoAlternativo })
      .from(imagen)
      .where(eq(imagen.productoId, fila.id))
      .orderBy(imagen.orden, imagen.id),
    db
      .select(tarjeta)
      .from(producto)
      .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
      .where(and(eq(producto.estado, 'publicado'), eq(producto.categoriaId, fila.categoriaId), ne(producto.id, fila.id)))
      .orderBy(desc(producto.creadoEn))
      .limit(4),
  ]);
  const { categoriaId: _, guiaTalles, guiaPadre, padreNombre, padreSlug, ...datos } = fila;
  // Una subcategoría sin guía propia usa la de su categoría principal.
  const guiaVigente = guiaTalles ?? guiaPadre;
  return {
    ...datos,
    categoriaPadre: padreSlug ? { nombre: padreNombre, slug: padreSlug } : null,
    guiaTalles: guiaVigente ? JSON.parse(guiaVigente) : null,
    variantes,
    imagenes,
    relacionados,
  };
}

// Secciones de la portada en una sola llamada: destacados, nuevos ingresos y ofertas.
export async function seccionesPortada(db: Db) {
  const limite = 8;
  const [destacados, nuevos, ofertas] = await Promise.all([
    listarProductos(db, { destacado: true, limite }),
    listarProductos(db, { limite }),
    listarProductos(db, { oferta: true, limite }),
  ]);
  return { destacados: destacados.productos, nuevos: nuevos.productos, ofertas: ofertas.productos };
}

// Todo lo público que tiene que estar en el sitemap.
export async function datosSitemap(db: Db) {
  const [productos, categorias, colecciones] = await db.batch([
    db.select({ slug: producto.slug, actualizadoEn: producto.actualizadoEn }).from(producto).where(eq(producto.estado, 'publicado')).orderBy(desc(producto.id)),
    db
      .select({ slug: categoria.slug })
      .from(categoria)
      .leftJoin(padre, eq(padre.id, categoria.padreId))
      .where(categoriaVisible),
    db.select({ slug: coleccion.slug }).from(coleccion).where(eq(coleccion.activa, 1)),
  ]);
  return { productos, categorias: categorias.map((x) => x.slug), colecciones: colecciones.map((x) => x.slug) };
}
