import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../config';
import { escalonEnvio, rangoCp, zonaEnvio } from '../db/schema';
import { ErrorApp, guardando, noEncontrado } from '../utils/errores';
import { digitosCp } from '../utils/texto';
import type { EdicionZona, NuevaZona, NuevoRango } from '../validations/tienda.validation';

// Tramos de peso: el precio base de la zona vale hasta 1 kg; los demás están en `escalon_envio`. Más de 10 kg no se envía.
export const ESCALONES_GRAMOS = [1000, 3000, 5000, 10000] as const;
export const PESO_MAXIMO_ENVIO_GRAMOS = 10000;
export const excedePesoDeEnvio = (gramos: number | null | undefined) => (gramos ?? 0) > PESO_MAXIMO_ENVIO_GRAMOS;

export async function listarZonas(db: Db) {
  const [zonas, rangos, escalones] = await db.batch([
    db.select().from(zonaEnvio).orderBy(zonaEnvio.nombre, zonaEnvio.transporte, zonaEnvio.modalidad),
    db.select().from(rangoCp).orderBy(rangoCp.cpDesde),
    db.select().from(escalonEnvio).orderBy(escalonEnvio.hastaGramos),
  ]);
  return zonas.map((z) => ({
    ...z,
    rangos: rangos.filter((r) => r.zonaEnvioId === z.id),
    escalones: escalones.filter((x) => x.zonaEnvioId === z.id).map(({ hastaGramos, precioCentavos }) => ({ hastaGramos, precioCentavos })),
  }));
}

const guardarEscalones = (db: Db, zonaId: number, escalones: { hastaGramos: number; precioCentavos: number }[]) =>
  escalones.length
    ? db.batch(
        escalones.map((x) =>
          db
            .insert(escalonEnvio)
            .values({ zonaEnvioId: zonaId, ...x })
            .onConflictDoUpdate({ target: [escalonEnvio.zonaEnvioId, escalonEnvio.hastaGramos], set: { precioCentavos: sql`excluded.precio_centavos` } }),
        ) as [any, ...any[]],
      )
    : undefined;

export function crearZona(db: Db, d: z.infer<typeof NuevaZona>) {
  return guardando('una zona de envío', async () => {
    const { escalones = [], ...datos } = d;
    const [fila] = await db.insert(zonaEnvio).values(datos).returning();
    await guardarEscalones(db, fila.id, escalones);
    return fila;
  });
}

export function editarZona(db: Db, id: number, d: z.infer<typeof EdicionZona>) {
  return guardando('una zona de envío', async () => {
    const { escalones = [], ...datos } = d;
    const [fila] = Object.keys(datos).length
      ? await db.update(zonaEnvio).set(datos).where(eq(zonaEnvio.id, id)).returning()
      : await db.select().from(zonaEnvio).where(eq(zonaEnvio.id, id));
    if (!fila) throw noEncontrado('la zona de envío');
    await guardarEscalones(db, id, escalones);
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

// Opciones de envío para un código postal: una por correo y modalidad que lo cubra. Con `pesoGramos`, el precio es el del
// tramo de peso que corresponde (el más barato que alcanza; si la zona no tiene ese tramo cargado, el más alto que tenga).
// El control de más de 10 kg lo hace quien llama (`excedePesoDeEnvio`).
export async function opcionesDeEnvio(db: Db, codigoPostal: string, pesoGramos?: number | null) {
  const filas = await opcionesBase(db, codigoPostal);
  if (!pesoGramos || pesoGramos <= ESCALONES_GRAMOS[0] || filas.length === 0) return filas;
  const escalones = await db.select().from(escalonEnvio).where(inArray(escalonEnvio.zonaEnvioId, filas.map((f) => f.zonaEnvioId)));
  return filas
    .map((f) => {
      const propios = escalones.filter((x) => x.zonaEnvioId === f.zonaEnvioId).sort((a, b) => a.hastaGramos - b.hastaGramos);
      const tramo = propios.find((x) => x.hastaGramos >= pesoGramos) ?? propios[propios.length - 1];
      return tramo ? { ...f, precioCentavos: Math.max(f.precioCentavos, tramo.precioCentavos) } : f;
    })
    .sort((a, b) => a.precioCentavos - b.precioCentavos);
}

function opcionesBase(db: Db, codigoPostal: string) {
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
