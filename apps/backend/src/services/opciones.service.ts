import { max } from 'drizzle-orm';
import type { Db } from '../config';
import { color, talle } from '../db/schema';

export async function listarOpciones(db: Db) {
  const [talles, colores] = await db.batch([
    db.select().from(talle).orderBy(talle.orden),
    db.select().from(color).orderBy(color.nombre),
  ]);
  return { talles, colores };
}

// El talle nuevo va al final de la lista.
export async function crearTalle(db: Db, nombre: string) {
  const [ultimo] = await db.select({ orden: max(talle.orden) }).from(talle);
  const [fila] = await db.insert(talle).values({ nombre, orden: (ultimo.orden ?? 0) + 1 }).returning();
  return fila;
}

export async function crearColor(db: Db, datos: { nombre: string; hex?: string }) {
  const [fila] = await db.insert(color).values(datos).returning();
  return fila;
}
