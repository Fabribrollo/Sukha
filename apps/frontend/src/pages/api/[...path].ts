import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { CABECERA_INTERNA } from '../../lib/api';
import { invalidarTienda } from '../../lib/tienda';

export const prerender = false;

// Lo que el panel guarda y la tienda muestra desde la caché (menú de la cabecera, categorías, colecciones; los productos, porque publicar o despublicar uno muestra u oculta su categoría en el menú).
const CAMBIA_EL_MENU = /^\/api\/admin\/(cabecera|categorias|colecciones|productos)(\/|$)/;

// Todo /api/* lo atiende apps/backend. La marca de llamada interna se borra: desde el navegador nadie se saltea el límite por IP.
// Si el panel guardó algo que muestra el menú, se borra la caché de la tienda para que se vea en la próxima carga.
export const ALL: APIRoute = async ({ request }) => {
  const r = new Request(request);
  r.headers.delete(CABECERA_INTERNA);
  const respuesta = await env.API.fetch(r);
  if (respuesta.ok && request.method !== 'GET' && request.method !== 'HEAD' && CAMBIA_EL_MENU.test(new URL(request.url).pathname)) {
    await invalidarTienda(request).catch(() => {});
  }
  return respuesta;
};
