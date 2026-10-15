import { count } from 'drizzle-orm';
import type { Db } from '../config';
import { producto } from '../db/schema';

export async function contarProductos(db: Db) {
  const [fila] = await db.select({ productos: count() }).from(producto);
  return fila.productos;
}
