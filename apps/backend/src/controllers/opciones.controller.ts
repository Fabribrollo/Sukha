import type { Context } from 'hono';
import { type AppEnv, conectar } from '../config';
import { crearColor, crearTalle, listarOpciones } from '../services/opciones.service';
import { esDuplicado } from '../utils/errores';
import { NuevoColor, NuevoTalle } from '../validations/opciones.validation';

export async function listar(c: Context<AppEnv>) {
  return c.json(await listarOpciones(conectar(c.env)));
}

export async function agregarTalle(c: Context<AppEnv>) {
  const datos = NuevoTalle.safeParse(await c.req.json().catch(() => null));
  if (!datos.success) return c.json({ error: 'El talle necesita un nombre de hasta 20 caracteres.' }, 400);
  try {
    return c.json(await crearTalle(conectar(c.env), datos.data.nombre), 201);
  } catch (e) {
    if (esDuplicado(e)) return c.json({ error: 'Ese talle ya existe.' }, 409);
    throw e;
  }
}

export async function agregarColor(c: Context<AppEnv>) {
  const datos = NuevoColor.safeParse(await c.req.json().catch(() => null));
  if (!datos.success) return c.json({ error: 'El color necesita un nombre de hasta 40 caracteres.' }, 400);
  try {
    return c.json(await crearColor(conectar(c.env), datos.data), 201);
  } catch (e) {
    if (esDuplicado(e)) return c.json({ error: 'Ese color ya existe.' }, 409);
    throw e;
  }
}
