// Tipos y utilidades de la tienda pública que se pueden usar tanto en el servidor como en el navegador
// (no importar acá nada que dependa de cloudflare:workers). Los datos vienen de la API (ver docs/API.md).

export type Tienda = {
  descuentoTransferenciaPorcentaje: number;
  cuotasSinInteres: { cantidad: number } | null;
  reservaMercadoPagoMinutos: number;
  reservaTransferenciaHoras: number;
  emailContacto: string;
  datosLegales: string;
  retiro: { direccion: string; horario: string } | null;
  barraAnuncios: string;
  whatsapp: string;
  instagram: string;
  ultimasUnidadesUmbral: number;
  maxUnidadesPorPedido: number;
  contenido: Record<string, any>;
};

export type Categoria = Filtros['categorias'][number];

// Busca una categoría por slug, sea principal o subcategoría; de una subcategoría también devuelve su principal.
export function buscarCategoria(categorias: Filtros['categorias'], slug: string) {
  for (const c of categorias) {
    if (c.slug === slug) return { categoria: c, padre: null, hijas: c.hijas };
    const hija = c.hijas.find((h) => h.slug === slug);
    if (hija) return { categoria: hija, padre: c, hijas: c.hijas };
  }
  return null;
}

export type Filtros = {
  // Categorías principales con sus subcategorías (solo las visibles).
  categorias: { nombre: string; slug: string; hijas: { nombre: string; slug: string }[] }[];
  colecciones: { nombre: string; slug: string }[];
  talles: { id: number; nombre: string; orden: number }[];
  colores: { id: number; nombre: string; hex: string | null }[];
  precio: { min: number; max: number };
};

export type TarjetaDeProducto = {
  id: number;
  nombre: string;
  slug: string;
  precioCentavos: number;
  precioOfertaCentavos: number | null;
  categoria: string;
  foto: string | null;
  disponible: number;
};

export type VarianteDeProducto = { id: number; talle: string | null; color: string | null; colorId: number | null; hex: string | null; stock: number };
export type FotoDeProducto = { clave: string; colorId: number | null; textoAlternativo: string | null };
export type FichaDeProducto = {
  id: number;
  nombre: string;
  slug: string;
  descripcion: string | null;
  material: string | null;
  cuidados: string | null;
  precioCentavos: number;
  precioOfertaCentavos: number | null;
  categoria: string;
  categoriaSlug: string;
  // Categoría principal, si la del producto es una subcategoría.
  categoriaPadre: { nombre: string; slug: string } | null;
  // Texto (o, en datos viejos, un objeto) con las medidas de la categoría.
  guiaTalles: unknown;
  variantes: VarianteDeProducto[];
  imagenes: FotoDeProducto[];
  relacionados: TarjetaDeProducto[];
};

export type Listado = { productos: TarjetaDeProducto[]; total: number; pagina: number; porPagina: number };

// ───────────── Montos ─────────────
// Los montos de la API están en centavos. Sin decimales cuando el monto es redondo: "$ 18.500".
export function pesos(centavos: number) {
  const entero = centavos % 100 === 0;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: entero ? 0 : 2,
    maximumFractionDigits: entero ? 0 : 2,
  }).format(centavos / 100);
}

// El precio que se cobra: el de oferta si hay.
export const precioFinal = (p: { precioCentavos: number; precioOfertaCentavos: number | null }) => p.precioOfertaCentavos ?? p.precioCentavos;

// "-20%" para la insignia de oferta; null si no hay oferta.
export function porcentajeDescuento(p: { precioCentavos: number; precioOfertaCentavos: number | null }) {
  if (p.precioOfertaCentavos === null || p.precioOfertaCentavos >= p.precioCentavos) return null;
  return Math.round((1 - p.precioOfertaCentavos / p.precioCentavos) * 100);
}

// Precio con el descuento por transferencia, o null si no hay descuento.
export function conTransferencia(centavos: number, porcentaje: number) {
  return porcentaje > 0 ? Math.round(centavos * (1 - porcentaje / 100)) : null;
}

// Precio de cada cuota, o null si no hay cuotas.
export function cuota(centavos: number, cuotas: { cantidad: number } | null) {
  return cuotas ? { cantidad: cuotas.cantidad, monto: Math.round(centavos / cuotas.cantidad) } : null;
}

// ───────────── Fotos ─────────────
export type TamanoFoto = 'chico' | 'mediano' | 'grande';
export const urlFoto = (clave: string, tamano: TamanoFoto = 'mediano') => `/api/imagenes/${clave}/${tamano}.webp`;
// Para <img srcset>: la misma foto en sus tres anchos (400, 900 y 1600 px).
export const srcsetFoto = (clave: string) => `${urlFoto(clave, 'chico')} 400w, ${urlFoto(clave, 'mediano')} 900w, ${urlFoto(clave, 'grande')} 1600w`;
// Las imágenes de banner no tienen tamaños: la clave ya es la dirección completa.
export const urlBanner = (clave: string) => `/api/imagenes/${clave}`;

// ───────────── Texto ─────────────
// Divide un texto cargado en el panel en párrafos (por líneas en blanco). Se muestran como texto, nunca como HTML.
export const parrafos = (texto: unknown) =>
  typeof texto === 'string' ? texto.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean) : [];

export const enlaceWhatsapp = (numero: string, mensaje?: string) =>
  `https://wa.me/${numero.replace(/\D/g, '')}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`;

// URL absoluta de la página actual, sin parámetros de seguimiento, para el <link rel="canonical"> y Open Graph.
export const canonica = (url: URL, conservar: string[] = []) => {
  const limpia = new URL(url.pathname, url.origin);
  for (const clave of conservar) if (url.searchParams.has(clave)) limpia.searchParams.set(clave, url.searchParams.get(clave)!);
  return limpia.toString();
};

// JSON para <script type="application/ld+json">: se escapa "<" para que un texto cargado en el panel no pueda cerrar el script.
export const jsonLd = (datos: unknown) => JSON.stringify(datos).replace(/</g, '\\u003c');
