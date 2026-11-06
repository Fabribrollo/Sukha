import { and, asc, desc, eq, exists, gt, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { FichaDeProducto, Filtros, Listado, TarjetaDeProducto } from '../compartido';
import { type Db, PRODUCTOS_POR_PAGINA } from '../config';
import { categoria, coleccion, color, imagen, producto, talle, variante } from '../db/schema';
import { noEncontrado } from '../utils/errores';
import { comboSql, ofertaVigenteSql, precioVigenteSql } from './promociones.service';

// Catálogo público: solo productos publicados y variantes activas.
// Una categoría se ve si está activa y, siendo subcategoría, también su categoría principal.
const padre = alias(categoria, 'padre');
const categoriaVisible = and(eq(categoria.activa, 1), or(isNull(padre.id), eq(padre.activa, 1)));
// Un producto está a la vista si está publicado y su categoría se ve. Toda consulta pública lo usa, con
// `innerJoin(categoria)` y `leftJoin(padre)`: así ocultar una categoría saca sus productos de todos lados.
const productoVisible = and(eq(producto.estado, 'publicado'), categoriaVisible);
// Lo mismo para consultas en SQL crudo (carrito y pedido): un producto de una categoría oculta no se puede comprar. `p` = alias de `producto`.
export const productoVisibleSql = (p = 'p') =>
  `${p}.estado = 'publicado' AND EXISTS (SELECT 1 FROM categoria c0 LEFT JOIN categoria c1 ON c1.id = c0.padre_id WHERE c0.id = ${p}.categoria_id AND c0.activa = 1 AND (c1.id IS NULL OR c1.activa = 1))`;

// Búsqueda por nombre: "%", "_" y "\" se buscan como texto, no como comodines ("50%" no trae "500").
export const nombreContiene = (q: string) => sql`${producto.nombre} LIKE ${`%${q.replace(/[\\%_]/g, '\\$&')}%`} ESCAPE '\\'`;

// Precio que paga la clienta: el de oferta o liquidación si hay (en SQL crudo; el alias del producto es su nombre de tabla).
const precioFinal = sql<number>`${sql.raw(precioVigenteSql('producto'))}`;
const ofertaVigente = sql<number | null>`${sql.raw(ofertaVigenteSql('producto'))}`;

const tarjeta = {
  id: producto.id,
  nombre: producto.nombre,
  slug: producto.slug,
  precioCentavos: producto.precioCentavos,
  precioOfertaCentavos: ofertaVigente,
  // Para las etiquetas «Nuevo» y «Últimas unidades».
  creadoEn: producto.creadoEn,
  unidades: sql<number>`coalesce((SELECT sum(stock) FROM variante WHERE producto_id = ${producto.id} AND activa = 1), 0)`,
  // 2x1 o 3x2 vigente.
  combo: sql<'2x1' | '3x2' | null>`${sql.raw(comboSql('tipo', 'producto'))}`,
  // Los colores de las variantes activas (códigos hex separados por coma), para los puntitos de la tarjeta.
  colores: sql<string | null>`(SELECT group_concat(hex) FROM (SELECT DISTINCT c.hex AS hex FROM variante v JOIN color c ON c.id = v.color_id WHERE v.producto_id = ${producto.id} AND v.activa = 1 AND c.hex IS NOT NULL ORDER BY c.id))`,
  // Con alias: dentro de un lote de D1, dos columnas con el mismo nombre (producto.slug y categoria.slug) se pisan.
  categoria: sql<string>`${categoria.slug}`.as('categoria_slug'),
  foto: sql<string | null>`(SELECT clave FROM imagen WHERE producto_id = ${producto.id} ORDER BY orden, id LIMIT 1)`,
  // Sin stock se sigue mostrando, como "Agotado".
  disponible: sql<number>`EXISTS (SELECT 1 FROM variante WHERE producto_id = ${producto.id} AND activa = 1 AND stock > 0)`,
};

type FilaCategoria = { id: number; nombre: string; slug: string; padreId: number | null; claveImagen?: string | null; seoTitulo?: string | null; seoDescripcion?: string | null };
const seoDe = (c: FilaCategoria) => ({ titulo: c.seoTitulo ?? null, descripcion: c.seoDescripcion ?? null });

// Categorías principales con sus subcategorías. Si la principal está oculta, ni ella ni sus hijas llegan acá.
const arbolDeCategorias = (activas: FilaCategoria[]) =>
  activas
    .filter((c) => !c.padreId)
    .map((c) => ({
      nombre: c.nombre,
      slug: c.slug,
      imagen: c.claveImagen ?? null,
      seo: seoDe(c),
      hijas: activas.filter((h) => h.padreId === c.id).map((h) => ({ nombre: h.nombre, slug: h.slug, imagen: h.claveImagen ?? null, seo: seoDe(h) })),
    }));

// Lo que fija la página (categoría, colección, ofertas, búsqueda): los filtros de talle, color y precio se calculan
// solo con los productos de ese alcance, para no ofrecer opciones que darían cero resultados.
export type Alcance = Pick<FiltroCatalogo, 'categoria' | 'coleccion' | 'q' | 'oferta' | 'destacado'>;

export async function listarFiltros(db: Db, alcance: Alcance = {}): Promise<Filtros> {
  const enAlcance = db
    .select({ id: producto.id })
    .from(producto)
    .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
    .leftJoin(padre, eq(padre.id, categoria.padreId))
    .where(condicionesBase(alcance));
  // Solo se ofrecen talles y colores con stock en algún producto del alcance: un filtro que da cero resultados no sirve.
  const conStock = (columna: 'talleId' | 'colorId', tabla: typeof talle | typeof color) =>
    exists(
      db
        .select({ uno: sql`1` })
        .from(variante)
        .where(and(eq(variante[columna], tabla.id), eq(variante.activa, 1), gt(variante.stock, 0), inArray(variante.productoId, enAlcance))),
    );
  const [categorias, colecciones, talles, colores, [precios]] = await db.batch([
    db
      .select({ id: categoria.id, nombre: categoria.nombre, slug: categoria.slug, padreId: categoria.padreId, claveImagen: categoria.claveImagen, seoTitulo: categoria.seoTitulo, seoDescripcion: categoria.seoDescripcion })
      .from(categoria)
      .where(eq(categoria.activa, 1))
      .orderBy(categoria.orden, categoria.nombre),
    db
      .select({
        nombre: coleccion.nombre,
        slug: coleccion.slug,
        seoTitulo: coleccion.seoTitulo,
        seoDescripcion: coleccion.seoDescripcion,
        // Foto de la colección para el menú: la primera foto de su primer producto publicado.
        imagen: sql<string | null>`(SELECT i.clave FROM producto_coleccion pc JOIN producto p ON p.id = pc.producto_id AND p.estado = 'publicado' JOIN imagen i ON i.producto_id = p.id WHERE pc.coleccion_id = coleccion.id ORDER BY i.orden, i.id LIMIT 1)`,
      })
      .from(coleccion)
      .where(eq(coleccion.activa, 1)),
    db.select().from(talle).where(conStock('talleId', talle)).orderBy(talle.orden),
    db.select().from(color).where(conStock('colorId', color)).orderBy(color.orden, color.nombre),
    db
      .select({ min: sql<number | null>`min(${precioFinal})`, max: sql<number | null>`max(${precioFinal})` })
      .from(producto)
      .where(and(eq(producto.estado, 'publicado'), inArray(producto.id, enAlcance))),
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

// Condiciones que fija la página y la clienta no puede cambiar con los filtros: publicado, categoría visible y alcance.
function condicionesBase(f: Alcance) {
  return and(
    productoVisible,
    // Pedir una categoría principal incluye los productos de sus subcategorías.
    f.categoria ? or(eq(categoria.slug, f.categoria), eq(padre.slug, f.categoria)) : undefined,
    f.coleccion
      ? sql`EXISTS (SELECT 1 FROM producto_coleccion pc JOIN coleccion co ON co.id = pc.coleccion_id
          WHERE pc.producto_id = ${producto.id} AND co.activa = 1 AND co.slug = ${f.coleccion})`
      : undefined,
    f.q ? nombreContiene(f.q) : undefined,
    f.oferta ? sql`${ofertaVigente} IS NOT NULL` : undefined,
    f.destacado ? eq(producto.destacado, 1) : undefined,
  );
}

export async function listarProductos(db: Db, f: FiltroCatalogo): Promise<Listado> {
  // Talle y color filtran por variantes que tengan stock de esa opción.
  const conVariante =
    f.talleIds?.length || f.colorIds?.length
      ? sql`EXISTS (SELECT 1 FROM variante v WHERE v.producto_id = ${producto.id} AND v.activa = 1 AND v.stock > 0
          ${f.talleIds?.length ? sql`AND v.talle_id IN (${sql.join(f.talleIds.map((i) => sql`${i}`), sql`, `)})` : sql``}
          ${f.colorIds?.length ? sql`AND v.color_id IN (${sql.join(f.colorIds.map((i) => sql`${i}`), sql`, `)})` : sql``})`
      : undefined;
  const filtros = and(
    condicionesBase(f),
    conVariante,
    f.min ? gte(precioFinal, f.min) : undefined,
    f.max ? lte(precioFinal, f.max) : undefined,
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

export async function obtenerProducto(db: Db, slug: string): Promise<FichaDeProducto> {
  const [fila] = await db
    .select({
      id: producto.id,
      nombre: producto.nombre,
      slug: producto.slug,
      descripcion: producto.descripcion,
      // Los nombres de los materiales elegidos, separados por coma.
      material: sql<string | null>`(SELECT group_concat(nombre, ', ') FROM (SELECT m.nombre FROM producto_material pm JOIN material m ON m.id = pm.material_id WHERE pm.producto_id = ${producto.id} ORDER BY m.nombre))`,
      cuidados: producto.cuidados,
      seoTitulo: producto.seoTitulo,
      seoDescripcion: producto.seoDescripcion,
      seoImagen: producto.seoImagen,
      precioCentavos: producto.precioCentavos,
      precioOfertaCentavos: ofertaVigente,
      combo: sql<'2x1' | '3x2' | null>`${sql.raw(comboSql('tipo', 'producto'))}`,
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
    .where(and(eq(producto.slug, slug), productoVisible));
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
      .orderBy(color.orden, color.nombre, talle.orden),
    db
      .select({ clave: imagen.clave, colorId: imagen.colorId, textoAlternativo: imagen.textoAlternativo })
      .from(imagen)
      .where(eq(imagen.productoId, fila.id))
      .orderBy(imagen.orden, imagen.id),
    // La categoría es la del producto, que ya pasó `productoVisible`: alcanza con que estén publicados.
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
    categoriaPadre: padreSlug ? { nombre: padreNombre ?? padreSlug, slug: padreSlug } : null,
    guiaTalles: guiaVigente ? JSON.parse(guiaVigente) : null,
    variantes,
    imagenes,
    relacionados,
  };
}

// Tarjetas de los productos elegidos a mano, en el orden pedido. Solo los publicados y con categoría visible.
export async function productosPorIds(db: Db, ids: number[]): Promise<TarjetaDeProducto[]> {
  if (!ids.length) return [];
  const filas = await db
    .select(tarjeta)
    .from(producto)
    .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
    .leftJoin(padre, eq(padre.id, categoria.padreId))
    .where(and(productoVisible, inArray(producto.id, ids)));
  const porId = new Map(filas.map((f) => [f.id, f]));
  return ids.flatMap((id) => (porId.has(id) ? [porId.get(id)!] : []));
}

// Todo lo público que tiene que estar en el sitemap.
export async function datosSitemap(db: Db) {
  const [productos, categorias, colecciones] = await db.batch([
    db
      .select({ slug: producto.slug, actualizadoEn: producto.actualizadoEn })
      .from(producto)
      .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
      .leftJoin(padre, eq(padre.id, categoria.padreId))
      .where(productoVisible)
      .orderBy(desc(producto.id)),
    db
      .select({ slug: categoria.slug })
      .from(categoria)
      .leftJoin(padre, eq(padre.id, categoria.padreId))
      .where(categoriaVisible),
    db.select({ slug: coleccion.slug }).from(coleccion).where(eq(coleccion.activa, 1)),
  ]);
  return { productos, categorias: categorias.map((x) => x.slug), colecciones: colecciones.map((x) => x.slug) };
}
