import type { Context } from 'hono';
import { type AppEnv, conectar } from '../config';
import { contarProductos } from '../services/salud.service';

export async function salud(c: Context<AppEnv>) {
  return c.json({ ok: true, productos: await contarProductos(conectar(c.env)) });
}
