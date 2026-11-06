// Tipos y utilidades de la tienda pública que se pueden usar tanto en el servidor como en el navegador
// (no importar acá nada que dependa de cloudflare:workers). Los datos vienen de la API (ver docs/API.md).

import type { Filtros } from '../../../backend/src/compartido';

// Los tipos de las respuestas del catálogo salen del backend (apps/backend/src/compartido.ts): si cambia la API, la
// tienda deja de compilar en lugar de fallar en producción. Son solo tipos: no agregan nada a lo que baja el navegador.
export type { FichaDeProducto, Filtros, FotoDeProducto, Listado, Seo, TarjetaDeProducto, VarianteDeProducto } from '../../../backend/src/compartido';
import type { TarjetaDeProducto } from '../../../backend/src/compartido';

export type Tienda = {
  // Desde cuánto alguna zona envía gratis, para el aviso «Te faltan $X» del carrito (null = ninguna).
  envioGratisDesdeCentavos: number | null;
  descuentoTransferenciaPorcentaje: number;
  cuotasSinInteres: { cantidad: number } | null;
  reservaMercadoPagoMinutos: number;
  reservaTransferenciaHoras: number;
  emailContacto: string;
  datosLegales: string;
  // Datos del comercio para el pie y los textos legales (vacío = falta cargarlo en Configuración).
  comercio: { razonSocial: string; cuit: string; condicionFiscal: string; domicilio: string; horarioAtencion: string; responsableAtencion: string; dataFiscalUrl: string; };
  retiro: { direccion: string; horario: string } | null;
  // Dirección del logo subido desde el panel, o null para usar el nombre en texto.
  logo: string | null;
  // Favicon subido desde el panel (null = el de siempre) y nombre de la tienda para los títulos de página.
  favicon: string | null;
  titulo: string;
  barraAnuncios: string;
  // Código de Cloudflare Web Analytics (vacío = sin estadísticas).
  analyticsToken: string;
  // Modo vacaciones: la tienda no toma pedidos; el mensaje es opcional.
  vacaciones: { mensaje: string } | null;
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

// Etiquetas de la foto de una tarjeta: «−30%» (oferta) o, si no hay, «Últimas unidades» o «Nuevo»; y el 2x1 o 3x2 vigente.
// Un producto agotado no lleva etiquetas. «Nuevo» dura DIAS_NUEVO días desde que se cargó.
const DIAS_NUEVO = 14;
export function etiquetasDe(p: TarjetaDeProducto, ultimasUnidadesUmbral: number) {
  if (!p.disponible) return [];
  const descuento = porcentajeDescuento(p);
  const etiquetas: string[] = [];
  if (descuento !== null) etiquetas.push(`−${descuento} %`);
  else if (p.unidades > 0 && p.unidades <= ultimasUnidadesUmbral) etiquetas.push('Últimas unidades');
  else if (Date.now() - new Date(p.creadoEn).getTime() < DIAS_NUEVO * 86_400_000) etiquetas.push('Nuevo');
  if (p.combo) etiquetas.push(p.combo);
  return etiquetas;
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

// Más de 10 kg no se ofrece envío desde la tienda: se consulta por WhatsApp (el retiro en persona sigue disponible).
export const MENSAJE_PESO_EXCEDIDO = 'Hola! Mi pedido pesa más de 10 kg, ¿me cotizan el envío?';

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
