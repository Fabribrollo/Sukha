import { defineMiddleware } from 'astro:middleware';
import { api } from './lib/api';

// Quién está en el panel. Se recuerda 30 segundos por sesión para no esperar a la base en cada pantalla (cada pedido de
// datos del panel igual vuelve a controlar la sesión en el backend, así que esto solo acelera el marco de la página).
const sesiones = new Map<string, { vence: number; admin: App.Locals['admin'] }>();
async function quienEs(request: Request) {
  const cookie = request.headers.get('cookie') ?? '';
  const guardada = sesiones.get(cookie);
  if (guardada && guardada.vence > Date.now()) return guardada.admin;
  const r = await api(request, '/api/admin/yo');
  if (!r.ok) return (sesiones.delete(cookie), null);
  const admin = (await r.json()) as App.Locals['admin'];
  if (sesiones.size > 100) sesiones.clear();
  sesiones.set(cookie, { vence: Date.now() + 30_000, admin });
  return admin;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const ruta = context.url.pathname;
  // Las respuestas de /api ya traen sus cabeceras de seguridad desde el backend.
  if (ruta.startsWith('/api/')) return next();

  // Todas las páginas del panel, salvo el login, exigen sesión: se le pregunta al backend quién es.
  const esPanel = ruta === '/admin' || ruta.startsWith('/admin/');
  if (esPanel && ruta !== '/admin/login') {
    const admin = await quienEs(context.request);
    if (!admin) return context.redirect('/admin/login');
    context.locals.admin = admin;
  }

  const respuesta = await next();
  // Una dirección de la tienda que no existe: si hay una redirección cargada (o creada al cambiar un slug), se manda ahí.
  if (respuesta.status === 404 && !esPanel && context.request.method === 'GET') {
    const r = await api(context.request, `/api/redireccion?${new URLSearchParams({ ruta })}`);
    if (r.ok) {
      const { hacia, tipo } = (await r.json()) as { hacia: string; tipo: 301 | 302 };
      return new Response(null, { status: tipo, headers: { location: `${hacia}${context.url.search}` } });
    }
  }
  const h = respuesta.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  // Nadie puede meter la tienda en un iframe (clickjacking); la única excepción es la vista previa de la portada, dentro del panel.
  const vistaPreviaDelPanel = ruta === '/' && context.url.searchParams.has('vista-previa');
  h.set('X-Frame-Options', vistaPreviaDelPanel ? 'SAMEORIGIN' : 'DENY');
  // La política de contenido de la tienda la arma Astro (astro.config.mjs, security.csp) con la huella de cada script.
  if (vistaPreviaDelPanel) {
    const csp = h.get('Content-Security-Policy');
    h.set('Content-Security-Policy', csp ? csp.replace("frame-ancestors 'none'", "frame-ancestors 'self'") : "frame-ancestors 'self'");
  }
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin'); // el link de seguimiento no viaja a otros sitios
  h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (esPanel) {
    h.set('Cache-Control', 'no-store');
    // El panel solo carga recursos propios y reemplaza la política de la tienda por esta, más estricta. En desarrollo Astro
    // inyecta scripts suyos, así que rige solo publicado.
    if (import.meta.env.PROD) {
      h.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'inline-speculation-rules'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'",
      );
    }
  }
  // La página de error amable (pages/500.astro, la única con Retry-After) sale como 503, corte momentáneo: Astro le pone 500.
  if (respuesta.status === 500 && h.has('retry-after')) return new Response(respuesta.body, { status: 503, headers: h });
  return respuesta;
});
