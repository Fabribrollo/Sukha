import { eq } from 'drizzle-orm';
import type { Db } from '../config';
import { categoria } from '../db/schema';
import { noEncontrado } from '../utils/errores';
import { archivoWebp } from '../utils/imagen';

// Foto opcional de cada categoría: un WebP en KV ({clave}/mediano.webp) que el panel achica antes de subir.
// Al cambiarla se usa una clave nueva (las imágenes se cachean para siempre por dirección) y se borra la anterior.
const archivo = (clave: string) => `${clave}/mediano.webp`;

export async function subirImagenDeCategoria(kv: KVNamespace, db: Db, id: number, form: FormData) {
  const [fila] = await db.select({ clave: categoria.claveImagen }).from(categoria).where(eq(categoria.id, id));
  if (!fila) throw noEncontrado('la categoría');
  const webp = (await archivoWebp(form, 'mediano', true))!;
  const clave = `categorias/${crypto.randomUUID()}`;
  await kv.put(archivo(clave), webp.stream(), { metadata: { tipo: 'image/webp' } });
  await db.update(categoria).set({ claveImagen: clave }).where(eq(categoria.id, id));
  if (fila.clave) await kv.delete(archivo(fila.clave));
  return { clave };
}

export async function quitarImagenDeCategoria(kv: KVNamespace, db: Db, id: number) {
  const [fila] = await db.select({ clave: categoria.claveImagen }).from(categoria).where(eq(categoria.id, id));
  if (!fila) throw noEncontrado('la categoría');
  await db.update(categoria).set({ claveImagen: null }).where(eq(categoria.id, id));
  if (fila.clave) await kv.delete(archivo(fila.clave));
  return { ok: true };
}
