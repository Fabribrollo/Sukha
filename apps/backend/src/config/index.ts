import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';

// adminId lo completa el middleware de sesión en las rutas del panel.
export type AppEnv = { Bindings: Env; Variables: { adminId: number } };

export const DIAS_SESION = 7;
// El prefijo __Host- hace que el navegador solo la acepte con Secure, Path=/ y sin Domain:
// ningún subdominio puede pisarla ni leerla.
export const COOKIE_SESION = '__Host-sesion';

// Tope del cuerpo de un pedido a la API: JSON chico en la tienda; en el panel, una foto son 3 archivos de hasta 2 MB.
export const MAX_BYTES_JSON = 64 * 1024;
export const MAX_BYTES_SUBIDA = 7 * 1024 * 1024;

export const PRODUCTOS_POR_PAGINA = 24;
export const TAMANOS_FOTO = ['chico', 'mediano', 'grande'] as const;
export const MAX_BYTES_FOTO = 2 * 1024 * 1024;

// Cola de emails: reintentos con espera creciente; después se marca como fallido.
export const MAX_INTENTOS_EMAIL = 6;
export const EMAILS_POR_TANDA = 10;
export const PEDIDOS_POR_TANDA = 20;

export const conectar = (env: Env) => drizzle(env.DB, { schema });
export type Db = ReturnType<typeof conectar>;
