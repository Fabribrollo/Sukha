import { eq, sql } from 'drizzle-orm';
import type { Db } from '../config';
import { categoria, coleccion } from '../db/schema';
import { Cabecera } from '../validations/cabecera.validation';
import { guardarConfiguracion, leerConfiguracion } from './configuracion.service';

// Menú de la cabecera: lo que se guardó en el panel o, sin nada guardado, uno armado con las categorías y colecciones visibles.

// `soloConProductos`: lo que ve la tienda. Una categoría sin productos publicados (ella ni sus subcategorías) y una colección
// sin productos publicados no aparecen; apenas se publica uno, vuelven solas. El editor del panel las ve todas.
async function datos(db: Db, soloConProductos = false) {
  const todas = await db
    .select({
      id: categoria.id,
      nombre: categoria.nombre,
      slug: categoria.slug,
      padreId: categoria.padreId,
      imagen: categoria.claveImagen,
      publicados: sql<number>`(SELECT COUNT(*) FROM producto p WHERE p.categoria_id = categoria.id AND p.estado = 'publicado')`,
    })
    .from(categoria)
    .where(eq(categoria.activa, 1))
    .orderBy(categoria.orden, categoria.nombre);
  // Una principal cuenta también los productos de sus hijas.
  const deHijas = new Map<number, number>();
  for (const c of todas) if (c.padreId) deHijas.set(c.padreId, (deHijas.get(c.padreId) ?? 0) + Number(c.publicados));
  const cats = (soloConProductos ? todas.filter((c) => Number(c.publicados) + (deHijas.get(c.id) ?? 0) > 0) : todas).map(({ publicados: _, ...c }) => c);
  const colsTodas = await db
    .select({
      nombre: coleccion.nombre,
      slug: coleccion.slug,
      // La primera foto de su primer producto publicado.
      imagen: sql<string | null>`(SELECT i.clave FROM producto_coleccion pc JOIN producto p ON p.id = pc.producto_id AND p.estado = 'publicado' JOIN imagen i ON i.producto_id = p.id WHERE pc.coleccion_id = coleccion.id ORDER BY i.orden, i.id LIMIT 1)`,
      publicados: sql<number>`(SELECT COUNT(*) FROM producto_coleccion pc JOIN producto p ON p.id = pc.producto_id AND p.estado = 'publicado' WHERE pc.coleccion_id = coleccion.id)`,
    })
    .from(coleccion)
    .where(eq(coleccion.activa, 1));
  const cols = (soloConProductos ? colsTodas.filter((c) => Number(c.publicados) > 0) : colsTodas).map(({ publicados: _, ...c }) => c);
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
  return { config: config.cabecera, borrador: config.cabecera_borrador, defecto: cabeceraPorDefecto(d) };
}
export const guardarCabecera = (d1: D1Database, valor: unknown) => guardarConfiguracion(d1, 'cabecera', valor);
export const restaurarCabecera = (d1: D1Database) => guardarConfiguracion(d1, 'cabecera', null);

// Borrador: el editor del panel guarda acá mientras se arma el menú; «Publicar» lo pasa a `cabecera`, que es lo que ve la tienda.
export const guardarBorradorCabecera = (d1: D1Database, valor: unknown) => guardarConfiguracion(d1, 'cabecera_borrador', valor);
export const descartarBorradorCabecera = (d1: D1Database) => guardarConfiguracion(d1, 'cabecera_borrador', null);
export async function publicarBorradorCabecera(d1: D1Database) {
  const { cabecera_borrador: borrador } = await leerConfiguracion(d1);
  if (!borrador) return null;
  await guardarConfiguracion(d1, 'cabecera', borrador);
  await guardarConfiguracion(d1, 'cabecera_borrador', null);
  return borrador;
}

// Lo que usa la tienda: cada entrada ya con su nombre, su enlace y las fotos resueltas.
type Tarjeta = { titulo: string; href: string; imagen: string | null };
// `conBorrador`: la vista previa del panel (el borrador si hay; si no, lo publicado).
export async function cabeceraResuelta(db: Db, d1: D1Database, conBorrador = false) {
  const [config, d] = await Promise.all([leerConfiguracion(d1), datos(db, true)]);
  const cfg = (conBorrador ? config.cabecera_borrador : null) ?? config.cabecera ?? cabeceraPorDefecto(d);
  const porSlug = new Map(d.cats.map((c) => [c.slug, c]));
  const colPorSlug = new Map(d.cols.map((c) => [c.slug, c]));
  const destino = (ruta: string) => {
    const cat = ruta.match(/^\/categoria\/([^/?#]+)/)?.[1];
    if (cat) return porSlug.get(cat);
    const col = ruta.match(/^\/coleccion\/([^/?#]+)/)?.[1];
    return col ? colPorSlug.get(col) : undefined;
  };
  // Una tarjeta a mano que apunta a una categoría o colección sin productos publicados no se muestra.
  const vigente = (t: { enlace: string }) => destino(t.enlace) || !/^\/(categoria|coleccion)\//.test(t.enlace);
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
      const tarjetas = it.tarjetas.length ? it.tarjetas.filter(vigente).map(tarjeta) : automaticas;
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
  const tarjetasMovil = cfg.tarjetasMovil.length ? cfg.tarjetasMovil.filter(vigente).map(tarjeta) : conFoto.slice(0, 2);
  return { items, tarjetasMovil };
}
