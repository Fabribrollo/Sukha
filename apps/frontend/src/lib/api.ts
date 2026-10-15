import { env } from 'cloudflare:workers';

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

// Llama al backend desde una página, reenviando la sesión y la IP de quien visita.
// Sin `metodo`: GET si no hay cuerpo, POST si lo hay.
export function api(request: Request, ruta: string, cuerpo?: unknown, metodo?: Metodo) {
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const h of ['cookie', 'cf-connecting-ip']) {
    const valor = request.headers.get(h);
    if (valor) headers.set(h, valor);
  }
  return env.API.fetch(new URL(ruta, request.url), {
    method: metodo ?? (cuerpo === undefined ? 'GET' : 'POST'),
    headers,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

// GET que devuelve el JSON ya leído.
export const leer = <T = any>(request: Request, ruta: string) => api(request, ruta).then((r) => r.json() as Promise<T>);
