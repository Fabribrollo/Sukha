import { eq, sql } from 'drizzle-orm';
import type { Db } from '../config';
import { categoria, coleccion } from '../db/schema';
import { Cabecera } from '../validations/cabecera.validation';
import { guardarConfiguracion, leerConfiguracion } from './configuracion.service';

// Menú de la cabecera: lo que se guardó en el panel o, sin nada guardado, uno armado con las categorías y colecciones visibles.

async function datos(db: Db) {
  const cats = await db
    .select({ id: categoria.id, nombre: categoria.nombre, slug: categoria.slug, padreId: categoria.padreId, imagen: categoria.claveImagen })
    .from(categoria)
    .where(eq(categoria.activa, 1))
    .orderBy(categoria.orden, categoria.nombre);
  const cols = await db
    .select({
      nombre: coleccion.nombre,
      slug: coleccion.slug,
      // La primera foto de su primer producto publicado.
      imagen: sql<string | null>`(SELECT i.clave FROM producto_coleccion pc JOIN producto p ON p.id = pc.producto_id AND p.estado = 'publicado' JOIN imagen i ON i.producto_id = p.id WHERE pc.coleccion_id = coleccion.id ORDER BY i.orden, i.id LIMIT 1)`,
    })
    .from(coleccion)
    .where(eq(coleccion.activa, 1));
  // Las subcategorías de una principal oculta no cuentan.
  const principales = cats.filter((c) => !c.padreId);
  const idsVisibles = new Set(principales.map((c) => c.id));
  return { cats: cats.filter((c) => !c.padreId || idsVisibles.has(c.padreId)), cols };
}
type Datos = Awaited<ReturnType<typeof datos>>;

export function cabeceraPorDefecto({ cats, cols }: Datos): Cabecera {
  const principales = cats.filter((c) => !c.padreId);
  return Cabecera.parse({
    items: [
      { id: 'nuevo0001', tipo: 'enlace', texto: 'Lo nuevo', enlace: '/productos' },
      ...principales.map((c) => ({ id: `cat${c.id}`.padEnd(5, 'x'), tipo: 'categoria', slug: c.slug })),
      ...(cols.length ? [{ id: 'colec0001', tipo: 'colecciones' }] : []),
      { id: 'ofertas01', tipo: 'enlace', texto: 'Ofertas', enlace: '/ofertas' },
    ],
  });
}

// Para el editor del panel: lo guardado (o null) y el menú por defecto con el que arrancar.
export async function verCabecera(db: Db, d1: D1Database) {
  const [config, d] = await Promise.all([leerConfiguracion(d1), datos(db)]);
  return { config: config.cabecera, defecto: cabeceraPorDefecto(d) };
}
export const guardarCabecera = (d1: D1Database, valor: unknown) => guardarConfiguracion(d1, 'cabecera', valor);
export const restaurarCabecera = (d1: D1Database) => guardarConfiguracion(d1, 'cabecera', null);

// Lo que usa la tienda: cada entrada ya con su nombre, su enlace y las fotos resueltas.
type Tarjeta = { titulo: string; href: string; imagen: string | null };
export async function cabeceraResuelta(db: Db, d1: D1Database) {
  const [config, d] = await Promise.all([leerConfiguracion(d1), datos(db)]);
  const cfg = config.cabecera ?? cabeceraPorDefecto(d);
  const porSlug = new Map(d.cats.map((c) => [c.slug, c]));
  const colPorSlug = new Map(d.cols.map((c) => [c.slug, c]));
  const destino = (ruta: string) => {
    const cat = ruta.match(/^\/categoria\/([^/?#]+)/)?.[1];
    if (cat) return porSlug.get(cat);
    const col = ruta.match(/^\/coleccion\/([^/?#]+)/)?.[1];
    return col ? colPorSlug.get(col) : undefined;
  };
  const tarjeta = (t: { enlace: string; titulo: string; imagen: string }): Tarjeta => {
    const d = destino(t.enlace);
    return { titulo: t.titulo || d?.nombre || '', href: t.enlace || '#', imagen: t.imagen || d?.imagen || null };
  };
  const items: Record<string, unknown>[] = [];
  const conFoto: Tarjeta[] = [];
  let hayColecciones = false;
  for (const it of cfg.items) {
    if (!it.visible) continue;
    const comun = { id: it.id, dispositivo: it.dispositivo };
    if (it.tipo === 'enlace') {
      items.push({ ...comun, tipo: 'enlace', texto: it.texto, href: it.enlace || '#' });
    } else if (it.tipo === 'categoria') {
      const cat = porSlug.get(it.slug);
      if (!cat || cat.padreId) continue;
      const todas = d.cats.filter((h) => h.padreId === cat.id);
      const hijas = it.subcategorias.length ? it.subcategorias.map((s) => todas.find((h) => h.slug === s)).filter((h): h is (typeof todas)[number] => Boolean(h)) : todas;
      const texto = it.texto || cat.nombre;
      const href = `/categoria/${cat.slug}`;
      if (!hijas.length) {
        items.push({ ...comun, tipo: 'enlace', texto, href });
        continue;
      }
      const automaticas = hijas.filter((h) => h.imagen).slice(0, 2).map((h) => ({ titulo: h.nombre, href: `/categoria/${h.slug}`, imagen: h.imagen }));
      const tarjetas = it.tarjetas.length ? it.tarjetas.map(tarjeta) : automaticas;
      conFoto.push(...tarjetas.filter((t) => t.imagen));
      items.push({ ...comun, tipo: 'panel', texto, href, hijas: hijas.map((h) => ({ nombre: h.nombre, href: `/categoria/${h.slug}` })), tarjetas });
    } else if (!hayColecciones) {
      hayColecciones = true;
      const lista = it.colecciones.length ? it.colecciones.map((s) => colPorSlug.get(s)).filter((c): c is (typeof d.cols)[number] => Boolean(c)) : d.cols;
      if (!lista.length) continue;
      items.push({
        ...comun,
        tipo: 'colecciones',
        texto: it.texto,
        href: '/colecciones',
        tarjetas: lista.slice(0, 8).map((c) => ({ titulo: c.nombre, href: `/coleccion/${c.slug}`, imagen: it.imagenes[c.slug] || c.imagen || null })),
      });
    }
  }
  const tarjetasMovil = cfg.tarjetasMovil.length ? cfg.tarjetasMovil.map(tarjeta) : conFoto.slice(0, 2);
  return { items, tarjetasMovil };
}
