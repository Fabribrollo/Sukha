import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

// Las fotos se sirven desde acá y no desde el backend: este worker corre cerca de quien mira, y el backend lejos,
// junto a la base. Las claves no se reutilizan (una foto nueva = clave nueva), así que se cachean para siempre.
export const GET: APIRoute = async ({ params, request }) => {
  const url = new URL(request.url);
  // La clave de caché ignora lo que venga después de "?": agregar parámetros no fuerza lecturas nuevas de KV.
  const claveCache = new Request(url.origin + url.pathname);
  const cache = caches.default;
  const cacheada = await cache.match(claveCache);
  if (cacheada) return new Response(cacheada.body, cacheada);

  // La foto original sin recortar es solo del panel (GET /api/admin/imagenes/:id/original): no se sirve acá.
  if (params.clave!.endsWith('/original.webp')) return new Response('No encontrada', { status: 404 });
  let foto = await env.IMAGENES.getWithMetadata<{ tipo?: string }>(params.clave!, 'stream');
  // Las fotos de la portada subidas antes del 29/10/2026 no tienen tamaño mediano: va la grande.
  if (!foto.value && /^portada\/[a-z0-9-]+\/mediano\.webp$/.test(params.clave!)) foto = await env.IMAGENES.getWithMetadata<{ tipo?: string }>(params.clave!.replace(/mediano\.webp$/, 'grande.webp'), 'stream');
  if (!foto.value) return new Response('No encontrada', { status: 404 });
  const respuesta = new Response(foto.value, {
    headers: { 'Content-Type': foto.metadata?.tipo ?? 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
  });
  await cache.put(claveCache, respuesta.clone());
  return respuesta;
};
