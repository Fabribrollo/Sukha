// Carga de los listados de productos (todos, categoría, colección, ofertas, búsqueda).
// Los filtros viven en la dirección: ?talle=3&talle=4&color=1&min=10000&max=50000&orden=precio_asc&pagina=2
// Los precios de la dirección van en pesos (legibles y funcionan sin JavaScript); a la API se mandan en centavos.
import { leer, leerDelBorde } from './api';
import type { Filtros, Listado } from './formato';

// Lo que fija la página y la clienta no puede cambiar con los filtros.
export type Base = { categoria?: string; coleccion?: string; oferta?: boolean; destacado?: boolean; q?: string };

export type Parametros = {
  talles: number[];
  colores: number[];
  min: number | null;
  max: number | null;
  orden: '' | 'precio_asc' | 'precio_desc';
  pagina: number;
};

// Acepta ids repetidos (?talle=3&talle=4) o separados por coma (?talle=3,4).
const ids = (url: URL, clave: string) =>
  [...new Set(url.searchParams.getAll(clave).flatMap((v) => v.split(',')).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 30);

const entero = (valor: string | null) => {
  const n = Number(valor);
  return valor && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

export function leerParametros(url: URL): Parametros {
  const orden = url.searchParams.get('orden');
  return {
    talles: ids(url, 'talle'),
    colores: ids(url, 'color'),
    min: entero(url.searchParams.get('min')),
    max: entero(url.searchParams.get('max')),
    orden: orden === 'precio_asc' || orden === 'precio_desc' ? orden : '',
    pagina: Math.max(1, entero(url.searchParams.get('pagina')) ?? 1),
  };
}

export const hayFiltros = (p: Parametros) => p.talles.length > 0 || p.colores.length > 0 || p.min !== null || p.max !== null;

export async function cargarListado(request: Request, url: URL, base: Base) {
  const p = leerParametros(url);
  const q = new URLSearchParams();
  if (base.categoria) q.set('categoria', base.categoria);
  if (base.coleccion) q.set('coleccion', base.coleccion);
  if (base.oferta) q.set('oferta', '1');
  if (base.destacado) q.set('destacado', '1');
  if (base.q) q.set('q', base.q);
  if (p.talles.length) q.set('talle', p.talles.join(','));
  if (p.colores.length) q.set('color', p.colores.join(','));
  if (p.min) q.set('min', String(p.min * 100));
  if (p.max) q.set('max', String(p.max * 100));
  if (p.orden) q.set('orden', p.orden);
  q.set('pagina', String(p.pagina));
  // Talles, colores y precios a ofrecer: solo los de los productos de esta página (no los de toda la tienda). No dependen
  // del stock ni de la visita, así que se guardan un minuto en la caché del borde, como los datos de la tienda.
  const alcance = new URLSearchParams([...q].filter(([clave]) => ['categoria', 'coleccion', 'oferta', 'destacado', 'q'].includes(clave)));
  const [datos, ofrecidos] = await Promise.all([
    leer<Listado>(request, `/api/catalogo/productos?${q}`),
    leerDelBorde<Filtros>(request, `/api/catalogo/filtros?${alcance}`, 60).then((r) => r.datos),
  ]);
  // Una página que no existe (por ejemplo, ?pagina=9 cuando hay 2) vuelve a la primera en lugar de mostrar "sin resultados".
  const fueraDeRango = p.pagina > 1 && datos.productos.length === 0 && datos.total > 0;
  return { datos, p, base, filtrado: hayFiltros(p), fueraDeRango, alcance: { talles: ofrecidos.talles, colores: ofrecidos.colores, precio: ofrecidos.precio } };
}

// Productos nuevos, para sugerir cuando no hay resultados o en la página 404. Son un extra: si fallan, no se muestran.
export const productosNuevos = (request: Request, cantidad = 4) =>
  leer<Listado>(request, `/api/catalogo/productos?limite=${cantidad}`).then(
    (r) => r.productos,
    () => [],
  );

// La dirección actual con algunos parámetros cambiados. Un valor `null` borra el parámetro; un arreglo lo repite.
// Al cambiar cualquier filtro se vuelve a la página 1.
export function conCambios(url: URL, cambios: Record<string, string | string[] | null>, conservarPagina = false) {
  const nueva = new URL(url.pathname, url.origin);
  const actuales = new URLSearchParams(url.search);
  for (const [clave, valor] of Object.entries(cambios)) actuales.delete(clave);
  if (!conservarPagina) actuales.delete('pagina');
  for (const [clave, valor] of actuales) nueva.searchParams.append(clave, valor);
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor === null) continue;
    for (const v of Array.isArray(valor) ? valor : [valor]) nueva.searchParams.append(clave, v);
  }
  return `${nueva.pathname}${nueva.search}`;
}
