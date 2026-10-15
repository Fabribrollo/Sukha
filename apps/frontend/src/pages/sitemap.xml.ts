import type { APIRoute } from 'astro';
import { leer } from '../lib/api';

export const prerender = false;

const fijas = ['/', '/productos', '/ofertas', '/quienes-somos', '/preguntas-frecuentes', '/cambios-y-devoluciones', '/contacto'];
// Los slugs y las fechas vienen de nuestra base, pero igual se escapan para que un carácter raro no rompa el XML.
const xml = (t: string) => t.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

export const GET: APIRoute = async ({ request, url }) => {
	const { productos, categorias, colecciones } = await leer<{ productos: { slug: string; actualizadoEn: string }[]; categorias: string[]; colecciones: string[] }>(request, '/api/catalogo/sitemap');
	const entradas = [
		...fijas.map((ruta) => ({ ruta })),
		...categorias.map((slug) => ({ ruta: `/categoria/${encodeURIComponent(slug)}` })),
		...colecciones.map((slug) => ({ ruta: `/coleccion/${encodeURIComponent(slug)}` })),
		...productos.map((p) => ({ ruta: `/producto/${encodeURIComponent(p.slug)}`, fecha: p.actualizadoEn.slice(0, 10) })),
	];
	const cuerpo = entradas.map((e) => `<url><loc>${xml(url.origin + e.ruta)}</loc>${'fecha' in e ? `<lastmod>${e.fecha}</lastmod>` : ''}</url>`).join('');
	return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${cuerpo}</urlset>`, {
		headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
	});
};
