import type { Context } from 'hono';
import { type AppEnv, conectar } from '../config';
import { crearColor, crearMarca, crearMaterial, crearTalle, editarColor, editarTalle, listarOpciones, ordenarOpciones } from '../services/opciones.service';
import { esDuplicado } from '../utils/errores';
import { cuerpo, idDe } from '../utils/http';
import { NuevaMarca, NuevoColor, NuevoMaterial, NuevoTalle, OrdenOpciones } from '../validations/opciones.validation';

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

export async function agregarMarca(c: Context<AppEnv>) {
  const datos = NuevaMarca.safeParse(await c.req.json().catch(() => null));
  if (!datos.success) return c.json({ error: 'La marca necesita un nombre de hasta 60 caracteres.' }, 400);
  try {
    return c.json(await crearMarca(conectar(c.env), datos.data.nombre), 201);
  } catch (e) {
    if (esDuplicado(e)) return c.json({ error: 'Esa marca ya existe.' }, 409);
    throw e;
  }
}

export async function agregarMaterial(c: Context<AppEnv>) {
  const datos = NuevoMaterial.safeParse(await c.req.json().catch(() => null));
  if (!datos.success) return c.json({ error: 'El material necesita un nombre de hasta 60 caracteres.' }, 400);
  try {
    return c.json(await crearMaterial(conectar(c.env), datos.data.nombre), 201);
  } catch (e) {
    if (esDuplicado(e)) return c.json({ error: 'Ese material ya existe.' }, 409);
    throw e;
  }
}

// Edición y orden de talles y colores. Un cambio de nombre se ve en todos los productos que lo usan.
export async function cambiarTalle(c: Context<AppEnv>) {
  const datos = await cuerpo(c, NuevoTalle);
  try {
    return c.json(await editarTalle(conectar(c.env), idDe(c), datos.nombre));
  } catch (e) {
    if (esDuplicado(e)) return c.json({ error: 'Ese talle ya existe.' }, 409);
    throw e;
  }
}

export async function cambiarColor(c: Context<AppEnv>) {
  const datos = await cuerpo(c, NuevoColor);
  try {
    return c.json(await editarColor(conectar(c.env), idDe(c), datos));
  } catch (e) {
    if (esDuplicado(e)) return c.json({ error: 'Ese color ya existe.' }, 409);
    throw e;
  }
}

export const ordenarTalles = async (c: Context<AppEnv>) => c.json(await ordenarOpciones(conectar(c.env), 'talle', (await cuerpo(c, OrdenOpciones)).ids));
export const ordenarColores = async (c: Context<AppEnv>) => c.json(await ordenarOpciones(conectar(c.env), 'color', (await cuerpo(c, OrdenOpciones)).ids));
