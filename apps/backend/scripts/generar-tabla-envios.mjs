#!/usr/bin/env node
// Genera el CSV de zonas de envío consultando la calculadora pública de Shipy (por su dirección JSON)
// (https://shipy.ar/herramientas/comparar-andreani-correo).
//
// Uso:
//   node scripts/generar-tabla-envios.mjs --origen 8300 --pesos 500,1000,2000 --salida tabla.csv
//
// Opciones:
//   --origen      código postal de origen (por defecto 8300)
//   --pesos       pesos en gramos separados por coma (por defecto 1000)
//   --margen      margen en % sobre el precio público (por defecto 10)
//   --redondeo    redondear hacia arriba a múltiplos de este valor en pesos (por defecto 100)
//   --zonas       archivo de zonas (por defecto zonas-envio.json, al lado del script)
//   --salida      archivo CSV de salida (por defecto envios-zonas-<origen>.csv). Si se piden varios
//                 pesos se crea un archivo por peso, con el sufijo -<peso>g antes de .csv
//   --cache       archivo JSON donde guardar las respuestas, para retomar si se corta
//   --pausa       milisegundos entre consultas (por defecto 700)
//   --base-url    para pruebas: otra dirección en lugar de la de Shipy
//
// Para actualizar los precios sin CSV, está el botón «Actualizar precios» en /admin/envios (misma fuente).
//
// Importante: son datos de un tercero, no una tarifa oficial. Usar pocas consultas
// (una vez por mes) y confirmar algunos precios contra los sitios de Andreani y Correo.
// Sin dependencias: necesita Node 18 o superior.

import { readFile, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const aqui = path.dirname(fileURLToPath(import.meta.url));

export function leerArgumentos(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? 'true' : argv[++i];
  }
  return a;
}

// La calculadora devuelve los precios en JSON (campo "quote"); se usa la tarifa pública, sin el descuento de Shipy.
const RUTA_DATOS = 'routes/_platform.herramientas.comparar-andreani-correo';
export function extraerPrecios(json) {
  const q = json?.quote;
  const campos = { 'andreani|domicilio': 'andreaniDomicilioPublico', 'andreani|sucursal': 'andreaniSucursalPublico', 'correo_argentino|domicilio': 'correoDomicilioPublico', 'correo_argentino|sucursal': 'correoSucursalPublico' };
  const precios = {};
  for (const [clave, campo] of Object.entries(campos)) if (q && Number(q[campo]) > 0) precios[clave] = Number(q[campo]);
  return precios;
}

export function aplicarMargen(precio, margenPct, redondeo) {
  return Math.ceil((precio * (1 + margenPct / 100)) / redondeo) * redondeo;
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function consultar(baseUrl, origen, destino, pesoG, pausa) {
  const url = `${baseUrl}?cpOrigen=${origen}&cpDestino=${destino}&pesoKg=${pesoG / 1000}&_data=${encodeURIComponent(RUTA_DATOS)}`;
  let ultimoError;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'sukha-actualizador-tarifas/1.0' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const precios = extraerPrecios(await r.json());
      if (Object.keys(precios).length < 4) throw new Error('la calculadora no trajo los 4 precios (cambió el formato?)');
      await espera(pausa);
      return precios;
    } catch (e) {
      ultimoError = e;
      await espera(pausa * intento * 2);
    }
  }
  throw new Error(`CP ${destino}, ${pesoG} g: ${ultimoError.message}`);
}

async function main() {
  const a = leerArgumentos(process.argv.slice(2));
  const origen = Number(a.origen ?? 8300);
  const pesos = String(a.pesos ?? '1000').split(',').map((x) => Number(x.trim()));
  const margen = Number(a.margen ?? 10);
  const redondeo = Number(a.redondeo ?? 100);
  const pausa = Number(a.pausa ?? 700);
  const baseUrl = a['base-url'] ?? 'https://shipy.ar/herramientas/comparar-andreani-correo';
  const archivoZonas = a.zonas ?? path.join(aqui, 'zonas-envio.json');
  const salida = a.salida ?? `envios-zonas-${origen}.csv`;
  const archivoCache = a.cache ?? null;

  if (!Number.isInteger(origen) || origen < 1000 || origen > 9999) throw new Error('--origen debe ser un código postal de 4 dígitos');
  if (!pesos.length || pesos.some((p) => !Number.isFinite(p) || p <= 0 || p > 25000)) throw new Error('--pesos: gramos entre 1 y 25000, separados por coma');

  const { zonas } = JSON.parse(await readFile(archivoZonas, 'utf8'));
  let cache = {};
  if (archivoCache) {
    try { cache = JSON.parse(await readFile(archivoCache, 'utf8')); } catch { /* sin cache previo */ }
  }

  const total = zonas.reduce((s, z) => s + z.muestras.length, 0) * pesos.length;
  let hechas = 0;
  const archivos = [];
  for (const pesoG of pesos) {
    const filas = [];
    for (const zona of zonas) {
      const maximos = {};
      for (const cp of zona.muestras) {
        const clave = `${origen}|${cp}|${pesoG}`;
        if (!cache[clave]) {
          cache[clave] = await consultar(baseUrl, origen, cp, pesoG, pausa);
          if (archivoCache) await writeFile(archivoCache, JSON.stringify(cache, null, 1));
        }
        for (const [k, v] of Object.entries(cache[clave])) maximos[k] = Math.max(maximos[k] ?? 0, v);
        hechas++;
        process.stderr.write(`\r${hechas}/${total} consultas`);
      }
      const rangos = zona.rangos.map(([d, h]) => `${d}-${h}`).join(', ');
      for (const transporte of ['andreani', 'correo_argentino']) {
        for (const modalidad of ['domicilio', 'sucursal']) {
          const publico = maximos[`${transporte}|${modalidad}`];
          filas.push([zona.nombre, transporte, modalidad, aplicarMargen(publico, margen, redondeo), rangos]);
        }
      }
    }
    // Mismo formato que envios-zonas.csv
    const destino = pesos.length > 1 ? salida.replace(/(\.csv)?$/, `-${pesoG}g.csv`) : salida;
    await writeFile(destino, csv([['zona', 'transporte', 'modalidad', 'precio_pesos', 'rangos_cp'], ...filas]), 'utf8');
    archivos.push(destino);
  }
  process.stderr.write('\n');
  console.log(`Listo: ${archivos.join(', ')} (origen ${origen}, margen ${margen}%, redondeo ${redondeo})`);
}

function csv(filas) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return filas.map((f) => f.map(esc).join(',')).join('\r\n') + '\r\n';
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
}
