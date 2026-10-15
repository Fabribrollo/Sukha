import { desc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../config';
import { cupon } from '../db/schema';
import { guardando, noEncontrado } from '../utils/errores';
import type { EdicionCupon, NuevoCupon } from '../validations/tienda.validation';
import type { CuponAplicable } from './totales';

export const listarCupones = (db: Db) => db.select().from(cupon).orderBy(desc(cupon.creadoEn));

export function crearCupon(db: Db, d: z.infer<typeof NuevoCupon>) {
  return guardando('un cupón', async () => {
    const [fila] = await db
      .insert(cupon)
      .values({ ...d, valor: d.tipo === 'envio_gratis' ? 0 : d.valor })
      .returning();
    return fila;
  });
}

export function editarCupon(db: Db, id: number, d: z.infer<typeof EdicionCupon>) {
  return guardando('un cupón', async () => {
    const [fila] = await db.update(cupon).set(d).where(eq(cupon.id, id)).returning();
    if (!fila) throw noEncontrado('el cupón');
    return fila;
  });
}

// Busca un cupón por código y revisa vigencia y usos. El monto mínimo lo revisa el cálculo de totales.
export async function cuponVigente(db: Db, codigo: string): Promise<{ cupon: CuponAplicable } | { motivo: string }> {
  const [c] = await db.select().from(cupon).where(eq(cupon.codigo, codigo));
  if (!c || !c.activo) return { motivo: 'El cupón no existe.' };
  if (c.venceEn && c.venceEn < new Date().toISOString()) return { motivo: 'El cupón está vencido.' };
  if (c.usosMaximos !== null && c.usos >= c.usosMaximos) return { motivo: 'El cupón ya no tiene usos disponibles.' };
  return {
    cupon: { id: c.id, codigo: c.codigo, tipo: c.tipo as CuponAplicable['tipo'], valor: c.valor, minimoCentavos: c.minimoCentavos },
  };
}
