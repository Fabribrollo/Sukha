import type { Context } from 'hono';
import { type AppEnv, conectar } from '../config';
import { contarProductos } from '../services/salud.service';

export async function salud(c: Context<AppEnv>) {
  return c.json({ ok: true, productos: await contarProductos(conectar(c.env)) });
}

// Las claves no se reutilizan (una foto nueva = clave nueva), así que la respuesta se cachea para siempre
// y la mayoría de las visitas no gasta lecturas de KV.
// ponytail: una foto borrada puede seguir saliendo del caché un tiempo para quien tenga la dirección exacta;
// si hiciera falta sacarla ya, se purga el caché desde el panel de Cloudflare.
export async function imagen(c: Context<AppEnv>) {
  const cache = caches.default;
  // La clave de caché ignora lo que venga después de "?": agregar parámetros no fuerza lecturas nuevas de KV.
  const url = new URL(c.req.url);
  const claveCache = new Request(url.origin + url.pathname);
  const cacheada = await cache.match(claveCache);
  // Copia: las respuestas que salen del caché no dejan modificar sus cabeceras, y las de seguridad se agregan después.
  if (cacheada) return new Response(cacheada.body, cacheada);

  const foto = await c.env.IMAGENES.getWithMetadata<{ tipo?: string }>(c.req.param('clave')!, 'stream');
  if (!foto.value) return c.notFound();

  const respuesta = new Response(foto.value, {
    headers: {
      'Content-Type': foto.metadata?.tipo ?? 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
  c.executionCtx.waitUntil(cache.put(claveCache, respuesta.clone()));
  return respuesta;
}
