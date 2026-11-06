import { desc, eq } from 'drizzle-orm';
import type { Db } from '../config';
import { redireccion } from '../db/schema';
import { ErrorApp, noEncontrado } from '../utils/errores';

// Redirecciones de la tienda: la tienda las consulta solo cuando una dirección da 404, así no frenan las páginas normales.
// Nunca se encadenan: si A → B y después B → C, A pasa a apuntar a C.

export const listarRedirecciones = (db: Db) => db.select().from(redireccion).orderBy(desc(redireccion.id));

export async function buscarRedireccion(db: Db, ruta: string) {
  const [fila] = await db.select({ hacia: redireccion.hacia, tipo: redireccion.tipo }).from(redireccion).where(eq(redireccion.desde, ruta));
  return fila ?? null;
}

// Al cambiar el slug de un producto, categoría o colección: la dirección vieja manda a la nueva.
export function redirigirSlug(db: Db, viejo: string, nuevo: string) {
  if (viejo === nuevo) return;
  return db.batch([
    // La dirección nueva vuelve a existir: si alguna redirección salía de ahí, ya no corresponde.
    db.delete(redireccion).where(eq(redireccion.desde, nuevo)),
    db.update(redireccion).set({ hacia: nuevo }).where(eq(redireccion.hacia, viejo)),
    db
      .insert(redireccion)
      .values({ desde: viejo, hacia: nuevo, tipo: 301, automatica: 1 })
      .onConflictDoUpdate({ target: redireccion.desde, set: { hacia: nuevo, tipo: 301, automatica: 1 } }),
  ]);
}

export async function crearRedireccion(db: Db, d: { desde: string; hacia: string; tipo: 301 | 302 }) {
  if (d.desde === d.hacia) throw new ErrorApp(400, 'La dirección de origen y la de destino son la misma.');
  // Se sigue el destino por si ya redirige a otro lado: se apunta directo al final, y si vuelve al origen es un bucle.
  let final = d.hacia;
  for (let saltos = 0; saltos < 10; saltos++) {
    const siguiente = await buscarRedireccion(db, final);
    if (!siguiente) break;
    final = siguiente.hacia;
    if (final === d.desde) throw new ErrorApp(400, 'Esa redirección haría un bucle: el destino ya vuelve a la dirección de origen.');
  }
  const [existe] = await db.select({ id: redireccion.id }).from(redireccion).where(eq(redireccion.desde, d.desde));
  if (existe) throw new ErrorApp(409, 'Ya hay una redirección desde esa dirección. Borrala primero si querés cambiarla.');
  const [, [fila]] = await db.batch([
    db.update(redireccion).set({ hacia: final }).where(eq(redireccion.hacia, d.desde)),
    db.insert(redireccion).values({ desde: d.desde, hacia: final, tipo: d.tipo }).returning(),
  ]);
  return fila;
}

export async function eliminarRedireccion(db: Db, id: number) {
  const [fila] = await db.delete(redireccion).where(eq(redireccion.id, id)).returning({ id: redireccion.id });
  if (!fila) throw noEncontrado('la redirección');
  return { ok: true };
}
