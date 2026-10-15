import { defineMiddleware } from 'astro:middleware';
import { api } from './lib/api';

export const onRequest = defineMiddleware(async (context, next) => {
  const ruta = context.url.pathname;
  // Las respuestas de /api ya traen sus cabeceras de seguridad desde el backend.
  if (ruta.startsWith('/api/')) return next();

  // Todas las páginas del panel, salvo el login, exigen sesión: se le pregunta al backend quién es.
  const esPanel = ruta === '/admin' || ruta.startsWith('/admin/');
  if (esPanel && ruta !== '/admin/login') {
    const r = await api(context.request, '/api/admin/yo');
    if (!r.ok) return context.redirect('/admin/login');
    context.locals.admin = (await r.json()) as App.Locals['admin'];
  }

  const respuesta = await next();
  const h = respuesta.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('X-Frame-Options', 'DENY'); // nadie puede meter la tienda en un iframe (clickjacking)
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin'); // el link de seguimiento no viaja a otros sitios
  h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (esPanel) {
    h.set('Cache-Control', 'no-store');
    // El panel solo carga recursos propios. En desarrollo Astro inyecta scripts suyos, así que rige solo publicado.
    if (import.meta.env.PROD) {
      h.set(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'",
      );
    }
  }
  return respuesta;
});
