import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';

// adminId lo completa el middleware de sesión en las rutas del panel.
export type AppEnv = { Bindings: Env; Variables: { adminId: number } };

export const DIAS_SESION = 7;
// El prefijo __Host- hace que el navegador solo la acepte con Secure, Path=/ y sin Domain:
// ningún subdominio puede pisarla ni leerla.
export const COOKIE_SESION = '__Host-sesion';

// Tope del cuerpo de un pedido a la API: JSON chico en la tienda; en el panel, una foto son 3 archivos más la original, de hasta 2 MB cada uno.
export const MAX_BYTES_JSON = 64 * 1024;
export const MAX_BYTES_SUBIDA = 9 * 1024 * 1024;

export const PRODUCTOS_POR_PAGINA = 24;
export const TAMANOS_FOTO = ['chico', 'mediano', 'grande'] as const;
export const MAX_BYTES_FOTO = 2 * 1024 * 1024;

// Cola de emails: reintentos con espera creciente; después se marca como fallido.
export const MAX_INTENTOS_EMAIL = 6;
// Tope de Resend gratis: 100 emails por día. Los de marketing (tipo que empieza con "marketing_": recordatorios,
// newsletter, "volvió el talle") salen después de los de pedidos y solo mientras queden RESERVA_EMAILS_PEDIDOS del día:
// un aviso de marketing nunca puede dejar sin email a una compra.
export const TOPE_EMAILS_DIA = 100;
export const RESERVA_EMAILS_PEDIDOS = 30;
// Un email que sigue en la cola pasado este plazo se avisa a la dueña (la cola está trabada o sin cupo).
export const HORAS_EMAIL_ATRASADO = 2;
// Avisos de fallas del sistema a la dueña: como mucho uno por tipo cada tantas horas (ver alertas.service).
export const HORAS_ENTRE_ALERTAS = 3;
// Tandas de la tarea programada: el plan gratis permite 50 consultas a D1 por ejecución. Vencer una reserva usa 3 y
// mandar un email otras 3: con 6 pedidos y 8 emails, más el resto de los pasos, quedan unas 48.
export const EMAILS_POR_TANDA = 8;
export const PEDIDOS_POR_TANDA = 6;
// Un pago de Mercado Pago que sigue pendiente pasado este plazo ya no retiene el stock: el pedido se cancela.
export const HORAS_PAGO_PENDIENTE = 72;

export const conectar = (env: Env) => drizzle(env.DB, { schema });
export type Db = ReturnType<typeof conectar>;
