// Portada por secciones: qué se publica, el borrador, y la resolución a datos listos para la tienda.
import { and, eq, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Db } from '../config';
import { categoria } from '../db/schema';
import { archivoWebp } from '../utils/imagen';
import { type Portada, PORTADA_POR_DEFECTO, type Seccion } from '../validations/portada.validation';
import { listarProductos, productosPorIds } from './catalogo.service';
import { guardarConfiguracion, leerConfiguracion } from './configuracion.service';
import { bannersVigentes } from './portada.service';

export async function leerPortadas(d1: D1Database) {
  const c = await leerConfiguracion(d1);
  return { publicada: c.portada_secciones ?? PORTADA_POR_DEFECTO, esPorDefecto: c.portada_secciones === null, borrador: c.portada_borrador };
}

export const guardarBorrador = (d1: D1Database, portada: Portada) => guardarConfiguracion(d1, 'portada_borrador', portada);
export const descartarBorrador = (d1: D1Database) => guardarConfiguracion(d1, 'portada_borrador', null);

export async function publicarBorrador(d1: D1Database) {
  const { borrador } = await leerPortadas(d1);
  if (!borrador) return null;
  await guardarConfiguracion(d1, 'portada_secciones', borrador);
  await guardarConfiguracion(d1, 'portada_borrador', null);
  return borrador;
}

// Foto de una sección (campaña, colección, local): WebP en KV con clave nueva por foto. No se borra la anterior: ocupa poco.
// "foto" es la grande (1920 px); "mediano" (1080 px) es la que ve el celular. Las fotos subidas antes no la tienen.
export async function subirImagenPortada(kv: KVNamespace, form: FormData) {
  const [grande, mediano] = await Promise.all([archivoWebp(form, 'foto', true), archivoWebp(form, 'mediano', false)]);
  const clave = `portada/${crypto.randomUUID()}`;
  const guardar = (tamano: string, archivo: File) => kv.put(`${clave}/${tamano}.webp`, archivo.stream(), { metadata: { tipo: 'image/webp' } });
  await Promise.all([guardar('grande', grande!), mediano && guardar('mediano', mediano)]);
  return { clave };
}

type Categoria = { nombre: string; slug: string; imagen: string | null };

// Categorías visibles (activas y, si son subcategorías, con la principal activa), en el orden del panel.
async function categoriasVisibles(db: Db) {
  const padre = alias(categoria, 'padre');
  const filas = await db
    .select({ nombre: categoria.nombre, slug: categoria.slug, imagen: categoria.claveImagen, esPrincipal: isNull(categoria.padreId) })
    .from(categoria)
    .leftJoin(padre, eq(padre.id, categoria.padreId))
    .where(and(eq(categoria.activa, 1), or(isNull(padre.id), eq(padre.activa, 1))))
    .orderBy(categoria.orden, categoria.nombre);
  return filas as (Categoria & { esPrincipal: boolean })[];
}

const hrefDeFuente = (f: Extract<Seccion, { tipo: 'productos' }>['fuente']) =>
  f.tipo === 'destacados' ? '/productos?destacado=1' : f.tipo === 'nuevos' ? '/productos' : f.tipo === 'ofertas' ? '/ofertas' : f.tipo === 'coleccion' ? `/coleccion/${f.slug}` : f.tipo === 'categoria' ? `/categoria/${f.slug}` : null;

// Secciones visibles y con algo para mostrar, ya con sus productos, categorías y banners. Las vacías no se devuelven.
export async function resolverPortada(env: Env, db: Db, portada: Portada) {
  const visibles = portada.secciones.filter((s) => s.visible);
  const [banners, categorias] = await Promise.all([
    visibles.some((s) => s.tipo === 'carrusel') ? bannersVigentes(env.DB) : [],
    visibles.some((s) => s.tipo === 'categorias') ? categoriasVisibles(db) : [],
  ]);

  const resueltas = await Promise.all(
    visibles.map(async (s) => {
      switch (s.tipo) {
        case 'carrusel':
          return banners.length ? { ...s, banners } : null;
        case 'categorias': {
          const items: Categoria[] = (s.categorias.length ? s.categorias.map((slug) => categorias.find((c) => c.slug === slug)) : categorias.filter((c) => c.esPrincipal))
            .filter((c): c is Categoria & { esPrincipal: boolean } => Boolean(c))
            .map(({ nombre, slug, imagen }) => ({ nombre: s.titulos[slug] || nombre, slug, imagen }));
          return items.length ? { ...s, items } : null;
        }
        case 'productos': {
          const f = s.fuente;
          const productos =
            f.tipo === 'seleccion'
              ? await productosPorIds(db, f.ids.slice(0, s.cantidad))
              : (await listarProductos(db, { limite: s.cantidad, destacado: f.tipo === 'destacados' || undefined, oferta: f.tipo === 'ofertas' || undefined, coleccion: f.tipo === 'coleccion' ? f.slug : undefined, categoria: f.tipo === 'categoria' ? f.slug : undefined })).productos;
          return productos.length ? { ...s, productos, href: s.verTodos ? hrefDeFuente(f) : null } : null;
        }
        case 'banda': {
          if (!s.categoria) return null;
          const productos = (await listarProductos(db, { limite: s.cantidad, categoria: s.categoria })).productos;
          return { ...s, productos, href: `/categoria/${s.categoria}` };
        }
        case 'hero':
          return s.looks.some((l) => l.imagen) ? { ...s, looks: s.looks.filter((l) => l.imagen) } : null;
        case 'campana':
        case 'coleccion':
        case 'local':
          return s.imagen || s.titulo ? s : null;
        default:
          return s;
      }
    }),
  );
  return resueltas.filter((x): x is NonNullable<typeof x> => x !== null);
}
