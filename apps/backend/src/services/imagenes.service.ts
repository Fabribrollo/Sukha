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

  const clave = `productos/${productoId}/${crypto.randomUUID()}`;
  await Promise.all(
    archivos.map(({ tamano, archivo }) => kv.put(claveKv(clave, tamano), archivo.stream(), { metadata: { tipo: 'image/webp' } })),
  );

  try {
    return await guardando('una foto', async () => {
      const [ultima] = await db.select({ orden: max(imagen.orden) }).from(imagen).where(eq(imagen.productoId, productoId));
      const [fila] = await db
        .insert(imagen)
        .values({ productoId, clave, orden: (ultima.orden ?? 0) + 1, ...datos })
        .returning();
      return fila;
    });
  } catch (e) {
    // Si no se pudo registrar (por ejemplo, el producto no existe), no dejar archivos huérfanos.
    await borrarArchivos(kv, clave);
    throw e;
  }
}

const borrarArchivos = (kv: KVNamespace, clave: string) =>
  Promise.all(TAMANOS_FOTO.map((tamano) => kv.delete(claveKv(clave, tamano))));

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
  await borrarArchivos(kv, fila.clave);
}
