import { and, eq, gte, lte } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../config';
import { rangoCp, zonaEnvio } from '../db/schema';
import { ErrorApp, guardando, noEncontrado } from '../utils/errores';
import { digitosCp } from '../utils/texto';
import type { EdicionZona, NuevaZona, NuevoRango } from '../validations/tienda.validation';

export async function listarZonas(db: Db) {
  const [zonas, rangos] = await db.batch([
    db.select().from(zonaEnvio).orderBy(zonaEnvio.nombre, zonaEnvio.transporte, zonaEnvio.modalidad),
    db.select().from(rangoCp).orderBy(rangoCp.cpDesde),
  ]);
  return zonas.map((z) => ({ ...z, rangos: rangos.filter((r) => r.zonaEnvioId === z.id) }));
}

export function crearZona(db: Db, d: z.infer<typeof NuevaZona>) {
  return guardando('una zona de envío', async () => {
    const [fila] = await db.insert(zonaEnvio).values(d).returning();
    return fila;
  });
}

export function editarZona(db: Db, id: number, d: z.infer<typeof EdicionZona>) {
  return guardando('una zona de envío', async () => {
    const [fila] = await db.update(zonaEnvio).set(d).where(eq(zonaEnvio.id, id)).returning();
    if (!fila) throw noEncontrado('la zona de envío');
    return fila;
  });
}

// Dos zonas del mismo correo y modalidad no pueden cubrir el mismo código postal:
// si no, la clienta vería dos precios para la misma opción. La base no lo puede impedir, se valida acá.
export async function agregarRango(db: Db, zonaId: number, d: z.infer<typeof NuevoRango>) {
  const [zona] = await db.select().from(zonaEnvio).where(eq(zonaEnvio.id, zonaId));
  if (!zona) throw noEncontrado('la zona de envío');
  const [choque] = await db
    .select({ zona: zonaEnvio.nombre, desde: rangoCp.cpDesde, hasta: rangoCp.cpHasta })
    .from(rangoCp)
    .innerJoin(zonaEnvio, eq(zonaEnvio.id, rangoCp.zonaEnvioId))
    .where(
      and(
        eq(zonaEnvio.transporte, zona.transporte),
        eq(zonaEnvio.modalidad, zona.modalidad),
        lte(rangoCp.cpDesde, d.cpHasta),
        gte(rangoCp.cpHasta, d.cpDesde),
      ),
    );
  if (choque) {
    throw new ErrorApp(409, `Se superpone con el rango ${choque.desde}-${choque.hasta} de la zona "${choque.zona}".`);
  }
  const [fila] = await db.insert(rangoCp).values({ zonaEnvioId: zonaId, ...d }).returning();
  return fila;
}

export async function eliminarRango(db: Db, id: number) {
  const [fila] = await db.delete(rangoCp).where(eq(rangoCp.id, id)).returning();
  if (!fila) throw noEncontrado('el rango');
}

// Opciones de envío para un código postal: una por correo y modalidad que lo cubra.
export function opcionesDeEnvio(db: Db, codigoPostal: string) {
  const cp = digitosCp(codigoPostal);
  if (cp === null) throw new ErrorApp(400, 'Código postal inválido.');
  return db
    .select({
      zonaEnvioId: zonaEnvio.id,
      nombre: zonaEnvio.nombre,
      transporte: zonaEnvio.transporte,
      modalidad: zonaEnvio.modalidad,
      precioCentavos: zonaEnvio.precioCentavos,
      gratisDesdeCentavos: zonaEnvio.gratisDesdeCentavos,
    })
    .from(zonaEnvio)
    .innerJoin(rangoCp, eq(rangoCp.zonaEnvioId, zonaEnvio.id))
    .where(and(eq(zonaEnvio.activa, 1), lte(rangoCp.cpDesde, cp), gte(rangoCp.cpHasta, cp)))
    .orderBy(zonaEnvio.precioCentavos);
}
