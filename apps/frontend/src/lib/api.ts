import { env } from 'cloudflare:workers';

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

// Marca de las llamadas que hacen las páginas desde el servidor: el backend no las cuenta en el límite por IP de la visita
// (una página hace varias llamadas). El proxy de /api/* la borra de lo que manda el navegador, y el backend no tiene URL
// pública, así que solo la puede poner este código.
export const CABECERA_INTERNA = 'x-sukha-interno';

// Llama al backend desde una página, reenviando la sesión y la IP de quien visita.
// Sin `metodo`: GET si no hay cuerpo, POST si lo hay.
// Un GET que falla por un corte momentáneo (error 5xx o de red) se reintenta una vez; un 4xx o una escritura, nunca.
export async function api(request: Request, ruta: string, cuerpo?: unknown, metodo?: Metodo) {
  const headers = new Headers({ 'content-type': 'application/json', [CABECERA_INTERNA]: '1' });
  for (const h of ['cookie', 'cf-connecting-ip']) {
    const valor = request.headers.get(h);
    if (valor) headers.set(h, valor);
  }
  const method = metodo ?? (cuerpo === undefined ? 'GET' : 'POST');
  const pedir = () => env.API.fetch(new URL(ruta, request.url), { method, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  if (method !== 'GET') return pedir();
  const r = await pedir().catch(() => null);
  if (r && r.status < 500) return r;
  await new Promise((listo) => setTimeout(listo, 250));
  return pedir();
}

// GET que devuelve el JSON ya leído. Si el backend contesta un error (429, 500…) falla, para que nadie use
// `{ error }` como si fueran datos; la página termina en la de error amable (pages/500.astro).
export async function leer<T = any>(request: Request, ruta: string): Promise<T> {
  const r = await api(request, ruta);
  if (!r.ok) throw new Error(`${ruta}: ${r.status}`);
  return r.json() as Promise<T>;
}

// Lectura pública (igual para todas las visitas) guardada `segundos` en la caché de Cloudflare del centro de datos que
// atiende a la visita: cuando la memoria del isolate está fría, que con poco tráfico es casi siempre, la página no cruza
// hasta el backend (unos 150 ms desde Argentina). Mismo patrón que las fotos. Devuelve también cuándo se pidió al backend,
// para que la memoria no estire la vigencia. En workers.dev (staging) la Cache API no guarda nada: ahí siempre va al backend.
export async function leerDelBorde<T>(request: Request, ruta: string, segundos: number): Promise<{ datos: T; pedidoEn: number }> {
  // Una dirección propia, que el navegador nunca pide: no se mezcla con las respuestas de /api.
  const clave = new Request(new URL(`/_cache${ruta}`, request.url));
  const cache = typeof caches === 'undefined' ? null : caches.default;
  const guardada = await cache?.match(clave).catch(() => undefined);
  if (guardada) return { datos: (await guardada.json()) as T, pedidoEn: Number(guardada.headers.get('x-pedido-en')) || Date.now() };
  const datos = await leer<T>(request, ruta);
  const pedidoEn = Date.now();
  const respuesta = new Response(JSON.stringify(datos), {
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${segundos}`, 'x-pedido-en': String(pedidoEn) },
  });
  await cache?.put(clave, respuesta).catch(() => {});
  return { datos, pedidoEn };
}

// Borra de la caché del borde (del centro de datos que atiende esta petición) las lecturas guardadas por leerDelBorde.
// Se usa cuando el panel guarda algo que esas lecturas muestran, para que la tienda lo vea en la próxima carga.
export async function purgarDelBorde(request: Request, rutas: string[]) {
  const cache = typeof caches === 'undefined' ? null : caches.default;
  await Promise.all(rutas.map((ruta) => cache?.delete(new Request(new URL(`/_cache${ruta}`, request.url))).catch(() => {})));
}
