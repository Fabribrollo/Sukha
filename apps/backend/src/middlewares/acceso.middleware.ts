import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { type AppEnv, COOKIE_SESION, conectar } from '../config';
import { sesionVigente } from '../services/auth.service';

export const requiereSesion = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, COOKIE_SESION);
  const sesion = token ? await sesionVigente(conectar(c.env), token) : null;
  if (!sesion) return c.json({ error: 'No autorizado.' }, 401);
  c.set('adminId', sesion.adminId);
  await next();
});

// Máximo 5 intentos por minuto por IP (binding LIMITE_LOGIN en wrangler.jsonc).
export const limiteLogin = createMiddleware<AppEnv>(async (c, next) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  if (!(await c.env.LIMITE_LOGIN.limit({ key: ip })).success) {
    return c.json({ error: 'Demasiados intentos. Probá de nuevo en un minuto.' }, 429);
  }
  await next();
});

// Máximo 10 pedidos o validaciones por minuto por IP (binding LIMITE_CHECKOUT).
export const limiteCheckout = createMiddleware<AppEnv>(async (c, next) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  if (!(await c.env.LIMITE_CHECKOUT.limit({ key: ip })).success) {
    return c.json({ error: 'Demasiados intentos. Probá de nuevo en un minuto.' }, 429);
  }
  await next();
});

// Máximo 120 pedidos por minuto por IP a la API pública (binding LIMITE_PUBLICO).
// Frena a quien quiera adivinar cupones o gastar la cuota gratuita de la base; no afecta una navegación normal.
// Las llamadas que hacen las páginas desde el servidor del frontend (marca x-sukha-interno) no cuentan: si no, cada página
// gastaría dos o tres del cupo de la visita. Nadie más puede poner la marca: el backend no tiene URL pública y el proxy
// de /api/* del frontend la borra de lo que manda el navegador.
export const limitePublico = createMiddleware<AppEnv>(async (c, next) => {
  if (c.req.header('x-sukha-interno')) return next();
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  if (!(await c.env.LIMITE_PUBLICO.limit({ key: ip })).success) {
    return c.json({ error: 'Demasiados pedidos seguidos. Probá de nuevo en un minuto.' }, 429);
  }
  await next();
});

// Defensa contra CSRF en el panel, además de SameSite en la cookie: un pedido que modifica algo
// y trae cabecera Origin tiene que venir de la propia tienda. (Las páginas del panel llaman
// desde el servidor, sin Origin, después de que el frontend ya verificó el origen del formulario.)
export const mismoOrigen = createMiddleware<AppEnv>(async (c, next) => {
  const origen = c.req.header('origin');
  const lectura = c.req.method === 'GET' || c.req.method === 'HEAD';
  if (!lectura && origen && origen !== new URL(c.req.url).origin) {
    return c.json({ error: 'Origen no permitido.' }, 403);
  }
  await next();
});

// Máximo 10 pedidos nuevos por minuto por IP (binding LIMITE_PEDIDOS). Alcanza para varias clientas detrás de una misma
// IP de celular (CGNAT); a un robot lo frena además el tope de pedidos sin pagar por IP y por email.
export const limitePedidos = createMiddleware<AppEnv>(async (c, next) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  if (!(await c.env.LIMITE_PEDIDOS.limit({ key: ip })).success) {
    return c.json({ error: 'Demasiados pedidos seguidos. Probá de nuevo en un minuto.' }, 429);
  }
  await next();
});
