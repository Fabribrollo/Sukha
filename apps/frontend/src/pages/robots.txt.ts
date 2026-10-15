import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = ({ url }) =>
	new Response(
		['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api', 'Disallow: /checkout', 'Disallow: /carrito', 'Disallow: /pedido', '', `Sitemap: ${url.origin}/sitemap.xml`, ''].join('\n'),
		{ headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } },
	);
