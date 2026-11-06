import { eq, inArray, max } from 'drizzle-orm';
import type { Db } from '../config';
import { color, marca, material, talle } from '../db/schema';
import { noEncontrado } from '../utils/errores';

export async function listarOpciones(db: Db) {
  const [talles, colores, marcas, materiales] = await db.batch([
    db.select().from(talle).orderBy(talle.orden),
    db.select().from(color).orderBy(color.orden, color.nombre),
    db.select().from(marca).orderBy(marca.nombre),
    db.select().from(material).orderBy(material.nombre),
  ]);
  return { talles, colores, marcas, materiales };
}

// El talle nuevo va al final de la lista.
export async function crearTalle(db: Db, nombre: string) {
  const [ultimo] = await db.select({ orden: max(talle.orden) }).from(talle);
  const [fila] = await db.insert(talle).values({ nombre, orden: (ultimo.orden ?? 0) + 1 }).returning();
  return fila;
}

export async function crearColor(db: Db, datos: { nombre: string; hex?: string }) {
  const [ultimo] = await db.select({ orden: max(color.orden) }).from(color);
  const [fila] = await db.insert(color).values({ ...datos, orden: (ultimo.orden ?? 0) + 1 }).returning();
  return fila;
}

export async function editarTalle(db: Db, id: number, nombre: string) {
  const [fila] = await db.update(talle).set({ nombre }).where(eq(talle.id, id)).returning();
  if (!fila) throw noEncontrado('el talle');
  return fila;
}

export async function editarColor(db: Db, id: number, datos: { nombre: string; hex?: string }) {
  const [fila] = await db.update(color).set(datos).where(eq(color.id, id)).returning();
  if (!fila) throw noEncontrado('el color');
  return fila;
}

// Guarda el orden de todos los talles o colores: el primero de la lista queda primero.
export async function ordenarOpciones(db: Db, tabla: 'talle' | 'color', ids: number[]) {
  const t = tabla === 'talle' ? talle : color;
  const filas = await db.select({ id: t.id }).from(t).where(inArray(t.id, ids));
  if (filas.length !== new Set(ids).size) throw noEncontrado('alguno de los elementos');
  await db.batch(ids.map((id, i) => db.update(t).set({ orden: i + 1 }).where(eq(t.id, id))) as [any, ...any[]]);
  return { ok: true };
}

export async function crearMarca(db: Db, nombre: string) {
  const [fila] = await db.insert(marca).values({ nombre }).returning();
  return fila;
}

export async function crearMaterial(db: Db, nombre: string) {
  const [fila] = await db.insert(material).values({ nombre }).returning();
  return fila;
}
