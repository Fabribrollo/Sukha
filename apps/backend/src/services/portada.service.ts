import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../config';
import { banner } from '../db/schema';
import { guardando, noEncontrado } from '../utils/errores';
import { archivoWebp } from '../utils/imagen';
import type { DatosBanner, EdicionBanner } from '../validations/catalogo.validation';

// Banners del carrusel de la portada. Cada uno tiene una imagen para escritorio y, opcional, otra para celular.

export const listarBanners = (db: Db) => db.select().from(banner).orderBy(banner.orden, banner.id);

export async function crearBanner(kv: KVNamespace, db: Db, form: FormData, d: z.infer<typeof DatosBanner>) {
  const escritorio = (await archivoWebp(form, 'escritorio', true))!;
  const movil = await archivoWebp(form, 'movil', false);
  const base = `banners/${crypto.randomUUID()}`;
  const clave = `${base}/escritorio.webp`;
  const claveMovil = movil ? `${base}/movil.webp` : null;
  const opciones = { metadata: { tipo: 'image/webp' } };
  await Promise.all([kv.put(clave, escritorio.stream(), opciones), movil && kv.put(claveMovil!, movil.stream(), opciones)]);
  const [fila] = await db.insert(banner).values({ clave, claveMovil, ...d }).returning();
  return fila;
}

export function editarBanner(db: Db, id: number, d: z.infer<typeof EdicionBanner>) {
  return guardando('un banner', async () => {
    const [fila] = await db.update(banner).set(d).where(eq(banner.id, id)).returning();
    if (!fila) throw noEncontrado('el banner');
    return fila;
  });
}

export async function eliminarBanner(kv: KVNamespace, db: Db, id: number) {
  const [fila] = await db.delete(banner).where(eq(banner.id, id)).returning();
  if (!fila) throw noEncontrado('el banner');
  await Promise.all([kv.delete(fila.clave), fila.claveMovil && kv.delete(fila.claveMovil)]);
}

// Los que se muestran hoy: activos y dentro de su período, si tienen.
export function bannersVigentes(d1: D1Database) {
  return d1
    .prepare(
      `SELECT clave, clave_movil AS claveMovil, texto_alternativo AS textoAlternativo, enlace
         FROM banner
        WHERE activo = 1
          AND (desde IS NULL OR desde <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
          AND (hasta IS NULL OR hasta > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ORDER BY orden, id`,
    )
    .all()
    .then((r) => r.results);
}
