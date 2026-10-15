import { and, eq, gt } from 'drizzle-orm';
import { DIAS_SESION, type Db } from '../config';
import { admin, sesion } from '../db/schema';
import { nuevoToken, sha256Hex, verificarContrasena } from '../utils/crypto';

// Hash con formato válido de una contraseña que nadie conoce.
const HASH_SENUELO = ['pbkdf2', '100000', '00'.repeat(16), '00'.repeat(32)].join('$');

// Devuelve el token de la sesión nueva, o null si las credenciales no son válidas.
export async function iniciarSesion(db: Db, email: string, contrasena: string) {
  const [usuario] = await db.select().from(admin).where(and(eq(admin.email, email), eq(admin.activo, 1)));
  // Si el email no existe igual se calcula un hash, para que el tiempo de respuesta no delate qué emails son de admins.
  const valida = await verificarContrasena(contrasena, usuario?.hashContrasena ?? HASH_SENUELO);
  if (!usuario || !valida) return null;

  const token = nuevoToken();
  const ahora = new Date();
  const vence = new Date(ahora.getTime() + DIAS_SESION * 86_400_000);
  await db.batch([
    db.insert(sesion).values({ tokenHash: await sha256Hex(token), adminId: usuario.id, venceEn: vence.toISOString() }),
    db.update(admin).set({ ultimoAccesoEn: ahora.toISOString() }).where(eq(admin.id, usuario.id)),
  ]);
  return { token, vence };
}

export async function sesionVigente(db: Db, token: string) {
  const [fila] = await db
    .select()
    .from(sesion)
    .where(and(eq(sesion.tokenHash, await sha256Hex(token)), gt(sesion.venceEn, new Date().toISOString())));
  return fila ?? null;
}

export async function cerrarSesion(db: Db, token: string) {
  await db.delete(sesion).where(eq(sesion.tokenHash, await sha256Hex(token)));
}
