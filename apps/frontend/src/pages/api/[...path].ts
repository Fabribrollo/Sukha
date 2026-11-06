import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { CABECERA_INTERNA } from '../../lib/api';

export const prerender = false;

// Todo /api/* lo atiende apps/backend. La marca de llamada interna se borra: desde el navegador nadie se saltea el límite por IP.
export const ALL: APIRoute = ({ request }) => {
  const r = new Request(request);
  r.headers.delete(CABECERA_INTERNA);
  return env.API.fetch(r);
};
