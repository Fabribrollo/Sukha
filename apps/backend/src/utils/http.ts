import type { Context } from 'hono';
import type { z } from 'zod';
import type { AppEnv } from '../config';
import { ErrorApp } from './errores';

// Lee y valida el cuerpo JSON; si no cumple, responde 400 con el primer problema.
export async function cuerpo<T extends z.ZodType>(c: Context<AppEnv>, esquema: T): Promise<z.infer<T>> {
  const datos = esquema.safeParse(await c.req.json().catch(() => null));
  if (datos.success) return datos.data;
  const problema = datos.error.issues[0];
  throw new ErrorApp(400, `${problema.path.join('.') || 'cuerpo'}: ${problema.message}`);
}

export function idDe(c: Context<AppEnv>, nombre = 'id') {
  const id = Number(c.req.param(nombre));
  if (!Number.isInteger(id) || id <= 0) throw new ErrorApp(400, 'Identificador inválido.');
  return id;
}

export const ahora = () => new Date().toISOString();
// Lo mismo, dentro de SQL (mismo formato que las columnas *_en).
export const AHORA_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
