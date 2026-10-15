import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import { type AppEnv, MAX_BYTES_SUBIDA } from './config';
import { routes } from './routes';
import { ErrorApp } from './utils/errores';

// Los mensajes de validación salen en español.
z.config(z.locales.es());

export const app = new Hono<AppEnv>().basePath('/api');

const noGuardar = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
});

// nosniff, sin iframes, sin referrer hacia afuera, HSTS. La API solo devuelve JSON e imágenes.
app.use('*', secureHeaders({ xFrameOptions: 'DENY', referrerPolicy: 'strict-origin-when-cross-origin' }));
app.use('*', bodyLimit({ maxSize: MAX_BYTES_SUBIDA, onError: (c) => c.json({ error: 'El pedido es demasiado grande.' }, 413) }));
// Nada del panel ni de un pedido (datos personales) se guarda en cachés intermedios o del navegador.
app.use('/admin/*', noGuardar);
app.use('/pedidos/*', noGuardar);

app.route('/', routes);

app.notFound((c) => c.json({ error: 'No existe.' }, 404));

// Los errores esperados se devuelven con su mensaje; cualquier otro queda en el registro y responde genérico.
app.onError((e, c) => {
  if (e instanceof ErrorApp) return c.json({ error: e.message }, e.status);
  // Errores que levanta el propio framework (por ejemplo, un cuerpo más grande que el tope).
  if (e instanceof HTTPException) return c.json({ error: e.status === 413 ? 'El pedido es demasiado grande.' : 'Pedido inválido.' }, e.status);
  console.error(e);
  return c.json({ error: 'Ocurrió un error inesperado.' }, 500);
});
