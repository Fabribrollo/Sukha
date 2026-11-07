import { and, eq, inArray, max } from 'drizzle-orm';
import type { z } from 'zod';
import { type Db, TAMANOS_FOTO } from '../config';
import { imagen } from '../db/schema';
import { guardando, noEncontrado } from '../utils/errores';
import { archivoWebp } from '../utils/imagen';
import type { EdicionImagen } from '../validations/catalogo.validation';

// Cada foto son tres archivos WebP en KV (el panel los comprime antes de subirlos):
//   {clave}/chico.webp, {clave}/mediano.webp, {clave}/grande.webp
const claveKv = (clave: string, tamano: string) => `${clave}/${tamano}.webp`;

// Encuadre del recorte sobre la original, como JSON {x, y, ancho, alto} entre 0 y 1; cualquier otra cosa se ignora.
function encuadreDe(form: FormData): string | null {
  const crudo = form.get('encuadre');
  if (typeof crudo !== 'string' || !crudo) return null;
  try {
    const e = JSON.parse(crudo) as Record<string, unknown>;
    const ok = ['x', 'y', 'ancho', 'alto'].every((k) => typeof e[k] === 'number' && (e[k] as number) >= 0 && (e[k] as number) <= 1);
    return ok && (e.ancho as number) > 0 && (e.alto as number) > 0 ? JSON.stringify({ x: e.x, y: e.y, ancho: e.ancho, alto: e.alto }) : null;
  } catch {
    return null;
  }
}

export async function subirImagen(
  kv: KVNamespace,
  db: Db,
  productoId: number,
  form: FormData,
  datos: { colorId: number | null; textoAlternativo: string | null },
) {
  const archivos = await Promise.all(
    TAMANOS_FOTO.map(async (tamano) => ({ tamano, archivo: (await archivoWebp(form, tamano, true))! })),
  );

  // Opcional: la foto original sin recortar (WebP, hasta 2 MB), que solo se lee desde el panel y nunca se sirve a la tienda.
  const original = await archivoWebp(form, 'original', false);
  const encuadre = original ? encuadreDe(form) : null;

  const clave = `productos/${productoId}/${crypto.randomUUID()}`;
  const claveOriginal = original ? claveKv(clave, 'original') : null;
  await Promise.all([
    ...archivos.map(({ tamano, archivo }) => kv.put(claveKv(clave, tamano), archivo.stream(), { metadata: { tipo: 'image/webp' } })),
    ...(original ? [kv.put(claveOriginal!, original.stream(), { metadata: { tipo: 'image/webp' } })] : []),
  ]);

  try {
    return await guardando('una foto', async () => {
      const [ultima] = await db.select({ orden: max(imagen.orden) }).from(imagen).where(eq(imagen.productoId, productoId));
      const [fila] = await db
        .insert(imagen)
        .values({ productoId, clave, orden: (ultima.orden ?? 0) + 1, original: claveOriginal, encuadre, ...datos })
        .returning();
      return fila;
    });
  } catch (e) {
    // Si no se pudo registrar (por ejemplo, el producto no existe), no dejar archivos huérfanos.
    await borrarArchivos(kv, clave, claveOriginal);
    throw e;
  }
}

// Reencuadre: la foto conserva su lugar, su color y su texto, pero con archivos nuevos y una clave nueva (las fotos se sirven
// con caché inmutable por clave, así que reescribir la misma no se vería).
export async function reemplazarImagen(kv: KVNamespace, db: Db, id: number, form: FormData) {
  const [vieja] = await db.select().from(imagen).where(eq(imagen.id, id));
  if (!vieja) throw noEncontrado('la foto');
  const archivos = await Promise.all(TAMANOS_FOTO.map(async (tamano) => ({ tamano, archivo: (await archivoWebp(form, tamano, true))! })));
  const clave = `productos/${vieja.productoId}/${crypto.randomUUID()}`;
  await Promise.all(archivos.map(({ tamano, archivo }) => kv.put(claveKv(clave, tamano), archivo.stream(), { metadata: { tipo: 'image/webp' } })));
  try {
    const [fila] = await guardando('una foto', () => db.update(imagen).set({ clave, ...(encuadreDe(form) ? { encuadre: encuadreDe(form) } : {}) }).where(eq(imagen.id, id)).returning());
    await borrarArchivos(kv, vieja.clave);
    return fila;
  } catch (e) {
    await borrarArchivos(kv, clave);
    throw e;
  }
}

const borrarArchivos = (kv: KVNamespace, clave: string, original?: string | null) =>
  Promise.all([...TAMANOS_FOTO.map((tamano) => kv.delete(claveKv(clave, tamano))), ...(original ? [kv.delete(original)] : [])]);

// La foto original sin recortar, para volver a reencuadrar desde ella (solo el panel la lee). Sin original: null.
export async function leerOriginal(kv: KVNamespace, db: Db, id: number) {
  const [fila] = await db.select({ original: imagen.original }).from(imagen).where(eq(imagen.id, id));
  if (!fila) throw noEncontrado('la foto');
  return fila.original ? kv.get(fila.original, 'stream') : null;
}

// Guarda el orden de las fotos de un producto: la primera de la lista es la principal.
export async function ordenarImagenes(db: Db, productoId: number, ids: number[]) {
  const propias = await db.select({ id: imagen.id }).from(imagen).where(and(eq(imagen.productoId, productoId), inArray(imagen.id, ids)));
  if (propias.length !== new Set(ids).size) throw noEncontrado('alguna de las fotos');
  await db.batch(ids.map((id, i) => db.update(imagen).set({ orden: i + 1 }).where(eq(imagen.id, id))) as [any, ...any[]]);
  return { ok: true };
}

export function editarImagen(db: Db, id: number, d: z.infer<typeof EdicionImagen>) {
  return guardando('una foto', async () => {
    const [fila] = await db.update(imagen).set(d).where(eq(imagen.id, id)).returning();
    if (!fila) throw noEncontrado('la foto');
    return fila;
  });
}

export async function eliminarImagen(kv: KVNamespace, db: Db, id: number) {
  const [fila] = await db.delete(imagen).where(eq(imagen.id, id)).returning();
  if (!fila) throw noEncontrado('la foto');
  await borrarArchivos(kv, fila.clave, fila.original);
}
