// Actualización de los precios de las zonas de envío con la calculadora pública de Shipy
// (https://shipy.ar/herramientas/comparar-andreani-correo). Solo se consulta cuando alguien toca «Consultar precios» en el
// panel, nunca en cada compra. Son datos de un tercero (tarifa pública de Andreani y Correo), no una tarifa oficial.
//
// ponytail: el formato de la respuesta (campos `quote.andreaniDomicilioPublico`, etc.) se leyó de la propia página el
// 2026-10-15; si Shipy lo cambia, la consulta falla con un aviso claro y los precios actuales quedan como están.
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../config';
import { escalonEnvio, zonaEnvio } from '../db/schema';
import { ErrorApp } from '../utils/errores';

const URL_SHIPY = 'https://shipy.ar/herramientas/comparar-andreani-correo';
const RUTA_DATOS = 'routes/_platform.herramientas.comparar-andreani-correo';
const VIGENCIA_MS = 24 * 3600_000;

// Códigos postales reales de cada zona (nunca inexistentes: la calculadora les pone el precio más alto). El precio de
// la zona es el más alto entre sus muestras. Pocas muestras por zona: el plan gratuito limita los pedidos externos por consulta.
export const ZONAS_REFERENCIA: { nombre: string; muestras: number[] }[] = [
  { nombre: 'CABA', muestras: [1100, 1425] },
  { nombre: 'Gran Buenos Aires y resto de Buenos Aires', muestras: [1900, 6500, 7600] },
  { nombre: 'Centro, Santa Fe y Entre Ríos', muestras: [2000, 3000, 5000] },
  { nombre: 'Cuyo', muestras: [5300, 5700] },
  { nombre: 'Litoral norte (NEA)', muestras: [3300, 3700] },
  { nombre: 'Noroeste (NOA)', muestras: [4000, 4800] },
  { nombre: 'Neuquén, Río Negro y La Pampa', muestras: [6200, 8300, 8500] },
  { nombre: 'Patagonia sur', muestras: [9000, 9410] },
];

export type Parametros = { origen: number; pesoGramos: number; margen: number; redondeo: number; incluirAndreani?: boolean };
export type PrecioNuevo = { zona: string; transporte: 'andreani' | 'correo_argentino'; modalidad: 'domicilio' | 'sucursal'; centavos: number };

type Cotizacion = Record<'andreaniDomicilioPublico' | 'andreaniSucursalPublico' | 'correoDomicilioPublico' | 'correoSucursalPublico', number>;

async function cotizar(fetchFn: typeof fetch, origen: number, destino: number, pesoGramos: number): Promise<Cotizacion> {
  const url = `${URL_SHIPY}?cpOrigen=${origen}&cpDestino=${destino}&pesoKg=${pesoGramos / 1000}&_data=${encodeURIComponent(RUTA_DATOS)}`;
  const r = await fetchFn(url, { headers: { 'user-agent': 'sukha-actualizador-tarifas/1.0' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new ErrorApp(502, `Shipy respondió ${r.status} al consultar el código postal ${destino}.`);
  const q = ((await r.json().catch(() => null)) as { quote?: Partial<Cotizacion> } | null)?.quote;
  const campos = ['andreaniDomicilioPublico', 'andreaniSucursalPublico', 'correoDomicilioPublico', 'correoSucursalPublico'] as const;
  if (!q || campos.some((c) => !(Number(q[c]) > 0))) throw new ErrorApp(502, 'Shipy no devolvió precios (puede haber cambiado su formato). No se tocó nada.');
  return Object.fromEntries(campos.map((c) => [c, Number(q[c])])) as Cotizacion;
}

// Precio en centavos con margen, redondeado hacia arriba a múltiplos de `redondeo` pesos.
export const conMargen = (pesos: number, margen: number, redondeo: number) => Math.ceil((pesos * (1 + margen / 100)) / redondeo) * redondeo * 100;

export async function consultarPrecios(fetchFn: typeof fetch, p: Parametros, pausaMs = 300): Promise<PrecioNuevo[]> {
  const filas: PrecioNuevo[] = [];
  for (const zona of ZONAS_REFERENCIA) {
    const maximos: Cotizacion = { andreaniDomicilioPublico: 0, andreaniSucursalPublico: 0, correoDomicilioPublico: 0, correoSucursalPublico: 0 };
    for (const cp of zona.muestras) {
      const c = await cotizar(fetchFn, p.origen, cp, p.pesoGramos);
      for (const k of Object.keys(maximos) as (keyof Cotizacion)[]) maximos[k] = Math.max(maximos[k], c[k]);
      if (pausaMs) await new Promise((r) => setTimeout(r, pausaMs));
    }
    filas.push(
      { zona: zona.nombre, transporte: 'andreani', modalidad: 'domicilio', centavos: conMargen(maximos.andreaniDomicilioPublico, p.margen, p.redondeo) },
      { zona: zona.nombre, transporte: 'andreani', modalidad: 'sucursal', centavos: conMargen(maximos.andreaniSucursalPublico, p.margen, p.redondeo) },
      { zona: zona.nombre, transporte: 'correo_argentino', modalidad: 'domicilio', centavos: conMargen(maximos.correoDomicilioPublico, p.margen, p.redondeo) },
      { zona: zona.nombre, transporte: 'correo_argentino', modalidad: 'sucursal', centavos: conMargen(maximos.correoSucursalPublico, p.margen, p.redondeo) },
    );
  }
  return filas;
}

// ───────────── Vista previa (con caché de 24 h) y aplicación ─────────────
// El precio de hasta 1 kg vive en la zona; el de 3, 5 y 10 kg, en `escalon_envio`.
const claveCache = (p: Parametros) => `tarifas:${p.origen}:${p.pesoGramos}:${p.margen}:${p.redondeo}`;
// Por defecto solo Correo: la tarifa pública de Andreani de Shipy es más baja que la oficial y pisaría esos precios.
const filtrar = (filas: PrecioNuevo[], p: Parametros) => filas.filter((n) => p.incluirAndreani || n.transporte !== 'andreani');

async function leerNuevos(env: Env, p: Parametros) {
  const guardado = await env.DB.prepare('SELECT valor FROM cache_externa WHERE clave = ? AND vence_en > ?')
    .bind(claveCache(p), new Date().toISOString())
    .first<{ valor: string }>();
  return guardado ? (JSON.parse(guardado.valor) as PrecioNuevo[]) : null;
}

export async function vistaPrevia(env: Env, db: Db, p: Parametros, fetchFn: typeof fetch = fetch) {
  let nuevos = await leerNuevos(env, p);
  const desdeCache = nuevos !== null;
  if (!nuevos) {
    nuevos = await consultarPrecios(fetchFn, p);
    await env.DB.prepare('INSERT INTO cache_externa (clave, valor, vence_en) VALUES (?, ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, vence_en = excluded.vence_en')
      .bind(claveCache(p), JSON.stringify(nuevos), new Date(Date.now() + VIGENCIA_MS).toISOString())
      .run();
  }
  const [zonas, escalones] = await Promise.all([
    db.select({ id: zonaEnvio.id, nombre: zonaEnvio.nombre, transporte: zonaEnvio.transporte, modalidad: zonaEnvio.modalidad, precio: zonaEnvio.precioCentavos }).from(zonaEnvio),
    db.select().from(escalonEnvio).where(eq(escalonEnvio.hastaGramos, p.pesoGramos)),
  ]);
  const filas = filtrar(nuevos, p).map((n) => {
    const zona = zonas.find((a) => a.nombre === n.zona && a.transporte === n.transporte && a.modalidad === n.modalidad);
    const actual = !zona ? null : p.pesoGramos === 1000 ? zona.precio : (escalones.find((x) => x.zonaEnvioId === zona.id)?.precioCentavos ?? null);
    return { ...n, actualCentavos: actual };
  });
  return { filas, desdeCache };
}

// Aplica lo que se vio en la vista previa (no vuelve a consultar a Shipy). Solo actualiza zonas que ya existen.
export async function aplicarPrecios(env: Env, db: Db, p: Parametros) {
  const guardado = await leerNuevos(env, p);
  if (!guardado) throw new ErrorApp(409, 'La consulta venció. Volvé a consultar los precios y aplicalos.');
  const nuevos = filtrar(guardado, p);
  const zonas = await db.select({ id: zonaEnvio.id, nombre: zonaEnvio.nombre, transporte: zonaEnvio.transporte, modalidad: zonaEnvio.modalidad }).from(zonaEnvio);
  const pares = nuevos.flatMap((n) => {
    const zona = zonas.find((a) => a.nombre === n.zona && a.transporte === n.transporte && a.modalidad === n.modalidad);
    return zona ? [{ id: zona.id, centavos: n.centavos }] : [];
  });
  if (pares.length) {
    await db.batch(
      pares.map((x) =>
        p.pesoGramos === 1000
          ? db.update(zonaEnvio).set({ precioCentavos: x.centavos }).where(eq(zonaEnvio.id, x.id))
          : db
              .insert(escalonEnvio)
              .values({ zonaEnvioId: x.id, hastaGramos: p.pesoGramos, precioCentavos: x.centavos })
              .onConflictDoUpdate({ target: [escalonEnvio.zonaEnvioId, escalonEnvio.hastaGramos], set: { precioCentavos: sql`excluded.precio_centavos` } }),
      ) as [any, ...any[]],
    );
  }
  return { actualizadas: pares.length, sinZona: nuevos.length - pares.length };
}
