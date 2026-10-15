import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { type AppEnv, COOKIE_SESION, conectar } from '../config';
import { cerrarSesion, iniciarSesion } from '../services/auth.service';
import { Credenciales } from '../validations/auth.validation';

export async function login(c: Context<AppEnv>) {
  const datos = Credenciales.safeParse(await c.req.json().catch(() => null));
  const sesion = datos.success && (await iniciarSesion(conectar(c.env), datos.data.email, datos.data.contrasena));
  if (!sesion) return c.json({ error: 'Email o contraseña incorrectos.' }, 401);

  setCookie(c, COOKIE_SESION, sesion.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    expires: sesion.vence,
  });
  return c.json({ ok: true });
}

export async function logout(c: Context<AppEnv>) {
  await cerrarSesion(conectar(c.env), getCookie(c, COOKIE_SESION)!);
  deleteCookie(c, COOKIE_SESION, { path: '/', secure: true }); // el prefijo __Host- exige Secure también al borrar
  return c.json({ ok: true });
}

// Quién está usando el panel. El frontend lo consulta en cada página para verificar la sesión.
export async function yo(c: Context<AppEnv>) {
  const admin = await c.env.DB.prepare('SELECT nombre, email FROM admin WHERE id = ?').bind(c.var.adminId).first();
  return c.json(admin);
}
