// Cotización automática con MiCorreo (Correo Argentino). Si no está configurado, o la API falla o tarda, devuelve null y
// la tienda usa el precio de la tabla `zona_envio`. Nunca lanza errores hacia el pedido.
//
// ponytail: los nombres de los campos de /token y /rates salen de la documentación (apiMiCorreo.pdf) leída en la
// investigación, no de una prueba real. Al tener las credenciales de pruebas, verificar con una cotización real.
import type { Bulto } from './bultos';

type Config = { cp_origen: string };
// Los secretos se cargan con `wrangler secret put`; MICORREO_URL elige pruebas o producción.
type EnvMiCorreo = Env & { MICORREO_URL?: string; MICORREO_USUARIO?: string; MICORREO_CLAVE?: string; MICORREO_CUSTOMER_ID?: string };

const ESPERA_MS = 4000;
const CLAVE_TOKEN = 'micorreo:token';

export const micorreoActivo = (env: Env, config: Config) => {
  const e = env as EnvMiCorreo;
  return Boolean(e.MICORREO_URL && e.MICORREO_USUARIO && e.MICORREO_CLAVE && e.MICORREO_CUSTOMER_ID && config.cp_origen);
};

// ───────────── Token en caché (D1): dura un par de horas, no se pide uno por cotización ─────────────
async function tokenGuardado(d1: D1Database) {
  const fila = await d1
    .prepare('SELECT valor FROM cache_externa WHERE clave = ? AND vence_en > ?')
    .bind(CLAVE_TOKEN, new Date().toISOString())
    .first<{ valor: string }>();
  return fila?.valor ?? null;
}

async function pedirToken(env: EnvMiCorreo, d1: D1Database, fetchFn: typeof fetch) {
  const r = await fetchFn(`${env.MICORREO_URL}/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${env.MICORREO_USUARIO}:${env.MICORREO_CLAVE}`)}` },
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  if (!r.ok) return null;
  const j = (await r.json().catch(() => null)) as { token?: string; expire?: string } | null;
  if (!j?.token) return null;
  // Se guarda con un margen de 5 minutos antes del vencimiento que informa la API (o 60 minutos si no lo informa).
  const vence = j.expire && !Number.isNaN(Date.parse(j.expire)) ? Date.parse(j.expire) - 5 * 60_000 : Date.now() + 60 * 60_000;
  await d1
    .prepare('INSERT INTO cache_externa (clave, valor, vence_en) VALUES (?, ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, vence_en = excluded.vence_en')
    .bind(CLAVE_TOKEN, j.token, new Date(vence).toISOString())
    .run();
  return j.token;
}

const borrarToken = (d1: D1Database) => d1.prepare('DELETE FROM cache_externa WHERE clave = ?').bind(CLAVE_TOKEN).run();

// ───────────── Cotización ─────────────
export type PreciosMiCorreo = { domicilio: number | null; sucursal: number | null };

// Del cuerpo de /rates, el precio más barato de cada modalidad ("D" domicilio, "S" sucursal), en centavos, redondeado hacia arriba a pesos.
export function leerTarifas(cuerpo: unknown): PreciosMiCorreo {
  const lista = Array.isArray(cuerpo) ? cuerpo : Array.isArray((cuerpo as any)?.rates) ? (cuerpo as any).rates : [];
  const mejor: PreciosMiCorreo = { domicilio: null, sucursal: null };
  for (const t of lista as any[]) {
    const tipo = t?.deliveredType ?? t?.delivered_type;
    const precio = Number(t?.price);
    if (!Number.isFinite(precio) || precio <= 0) continue;
    const centavos = Math.ceil(precio) * 100;
    const clave = tipo === 'D' ? 'domicilio' : tipo === 'S' ? 'sucursal' : null;
    if (clave && (mejor[clave] === null || centavos < mejor[clave]!)) mejor[clave] = centavos;
  }
  return mejor;
}

export async function cotizarMiCorreo(
  env: Env,
  d1: D1Database,
  config: Config,
  entrada: { cpDestino: string; bulto: Bulto; pesoGramos: number },
  fetchFn: typeof fetch = fetch,
): Promise<PreciosMiCorreo | null> {
  if (!micorreoActivo(env, config)) return null;
  const e = env as EnvMiCorreo;
  try {
    const consultar = async (token: string) =>
      fetchFn(`${e.MICORREO_URL}/rates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          customerId: e.MICORREO_CUSTOMER_ID,
          postalCodeOrigin: config.cp_origen,
          postalCodeDestination: entrada.cpDestino,
          dimensions: { weight: Math.min(25000, Math.max(1, entrada.pesoGramos)), height: entrada.bulto.altoCm, width: entrada.bulto.anchoCm, length: entrada.bulto.largoCm },
        }),
        signal: AbortSignal.timeout(ESPERA_MS),
      });

    let token = (await tokenGuardado(d1)) ?? (await pedirToken(e, d1, fetchFn));
    if (!token) return null;
    let r = await consultar(token);
    // Token vencido antes de lo esperado: se pide uno nuevo y se reintenta una vez.
    if (r.status === 401) {
      await borrarToken(d1);
      token = await pedirToken(e, d1, fetchFn);
      if (!token) return null;
      r = await consultar(token);
    }
    // Demasiadas consultas: no se insiste, se usa el precio de la tabla.
    if (!r.ok) return null;
    const precios = leerTarifas(await r.json().catch(() => null));
    return precios.domicilio === null && precios.sucursal === null ? null : precios;
  } catch {
    return null;
  }
}
