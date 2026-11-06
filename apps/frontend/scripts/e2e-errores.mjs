// La tienda ante un backend que falla: levanta la tienda ya compilada (`npm run build`) con un backend falso que contesta
// 429, 500 o datos mínimos, y comprueba que las páginas muestran datos o la página de error amable, nunca un 500 crudo.
// También que una lectura se reintenta una sola vez ante un 5xx (y nunca ante un 4xx ni una escritura), y que la marca de
// llamada interna no se puede mandar desde el navegador.
//
//   npm run build && node scripts/e2e-errores.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUERTO = 8790;
const base = `http://127.0.0.1:${PUERTO}`;

// Backend falso. /api/__control?modo=… cambia el modo y borra el registro de llamadas; sin modo, lo devuelve.
const backendFalso = `
let modo = 'ok';
let llamadas = [];
const vistas = new Set();
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json' } });
const tienda = { descuentoTransferenciaPorcentaje: 10, cuotasSinInteres: null, reservaMercadoPagoMinutos: 30, reservaTransferenciaHoras: 24,
  emailContacto: 'hola@sukha.test', datosLegales: '', retiro: null, logo: null, favicon: null, titulo: 'Sukhä', barraAnuncios: '',
  whatsapp: '', instagram: '', ultimasUnidadesUmbral: 3, maxUnidadesPorPedido: 10, contenido: {} };
const filtros = { categorias: [{ nombre: 'Vestidos', slug: 'vestidos', hijas: [] }], colecciones: [], talles: [], colores: [], precio: { min: 0, max: 0 } };
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/__control') {
      if (url.searchParams.has('modo')) (modo = url.searchParams.get('modo')), (llamadas = []), vistas.clear();
      return json({ modo, llamadas });
    }
    llamadas.push({ ruta: url.pathname, metodo: request.method, interna: request.headers.has('x-sukha-interno') });
    if (modo === '500' || modo === '429') return json({ error: 'Falla simulada.' }, Number(modo));
    if (modo === '500-una-vez' && !vistas.has(url.href)) return vistas.add(url.href), json({ error: 'Falla simulada.' }, 500);
    if (url.pathname === '/api/tienda') return json(tienda);
    if (url.pathname === '/api/catalogo/filtros') return json(filtros);
    if (url.pathname === '/api/portada') return json({ secciones: [], borrador: false });
    return json({ error: 'No encontrado.' }, 404);
  },
};`;

const carpeta = mkdtempSync(join(tmpdir(), 'sukha-e2e-errores-'));
writeFileSync(join(carpeta, 'backend.mjs'), backendFalso);
writeFileSync(join(carpeta, 'wrangler.json'), JSON.stringify({ name: 'sukha-backend', main: 'backend.mjs', compatibility_date: '2026-10-01' }));

const bin = fileURLToPath(new URL('../../../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const args = ['dev', '-c', 'dist/server/wrangler.json', '-c', join(carpeta, 'wrangler.json'), '--port', String(PUERTO), '--ip', '127.0.0.1', '--inspector-port', '0', '--persist-to', join(carpeta, 'estado')];
const wrangler = spawn(process.execPath, [bin, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
let salida = '';
wrangler.stdout.on('data', (d) => (salida += d));
wrangler.stderr.on('data', (d) => (salida += d));
const terminar = async (codigo) => {
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(wrangler.pid), '/t', '/f']);
  else wrangler.kill();
  await new Promise((r) => setTimeout(r, 1500));
  rmSync(carpeta, { recursive: true, force: true });
  process.exit(codigo);
};

let ok = 0;
const fallos = [];
const caso = (nombre, cond, detalle = '') => {
  if (cond) ok++;
  else fallos.push(`${nombre}${detalle ? ` → ${detalle}` : ''}`);
};
// El servidor local a veces corta una conexión (ECONNRESET): se reintenta la conexión, no la respuesta.
const pedir = async (ruta, opciones = {}, intentos = 4) => {
  try {
    const r = await fetch(base + ruta, { redirect: 'manual', ...opciones });
    return { status: r.status, texto: await r.text(), retry: r.headers.get('retry-after') };
  } catch (e) {
    if (intentos <= 1) throw e;
    await new Promise((r) => setTimeout(r, 1000));
    return pedir(ruta, opciones, intentos - 1);
  }
};
const modo = async (m) => (await pedir(`/api/__control?modo=${m}`)).status;
const llamadas = async () => JSON.parse((await pedir('/api/__control')).texto).llamadas;
const amable = (r) => r.status === 503 && r.texto.includes('problema momentáneo') && r.retry === '60';

// Espera a que la tienda conteste (hasta 60 s).
for (let i = 0; ; i++) {
  try {
    if ((await modo('ok')) === 200) break;
  } catch {
    /* todavía arrancando */
  }
  if (i > 60) {
    console.log(`✗ La tienda no arrancó.\n${salida}`);
    await terminar(1);
  }
  await new Promise((r) => setTimeout(r, 1000));
}

const PAGINAS = ['/', '/categoria/vestidos', '/producto/remera', '/pedido/abc123'];

// 1. Backend con 500 (y sin nada en memoria): página amable, y cada lectura se intentó exactamente dos veces.
await modo('500');
for (const ruta of PAGINAS) {
  const r = await pedir(ruta);
  caso(`500 → ${ruta} amable`, amable(r), `${r.status}`);
}
await modo('500');
await pedir('/pedido/abc123');
caso('500 → un reintento, no más', (await llamadas()).length === 2, JSON.stringify(await llamadas()));

// 2. Backend con 429: página amable y sin reintento (un 4xx no se reintenta).
await modo('429');
for (const ruta of PAGINAS) {
  const r = await pedir(ruta);
  caso(`429 → ${ruta} amable`, amable(r), `${r.status}`);
}
await modo('429');
await pedir('/pedido/abc123');
caso('429 → sin reintento', (await llamadas()).length === 1, JSON.stringify(await llamadas()));

// 3. Una escritura no se reintenta (la baja del newsletter postea desde el servidor).
await modo('500');
const baja = await pedir('/novedades/baja/tok', { method: 'POST', headers: { origin: base, 'content-type': 'application/x-www-form-urlencoded' }, body: '' });
caso('POST → no es un 500', baja.status !== 500, String(baja.status));
caso('POST → sin reintento', (await llamadas()).filter((l) => l.metodo === 'POST').length === 1, JSON.stringify(await llamadas()));

// 4. Un 500 pasajero (falla la primera vez) no se nota: la portada sale con datos.
await modo('500-una-vez');
const portada = await pedir('/');
caso('500 pasajero → portada 200', portada.status === 200, String(portada.status));
caso('las páginas marcan sus llamadas como internas', (await llamadas()).every((l) => l.interna), JSON.stringify(await llamadas()));

// 5. Con los datos ya en memoria, un backend caído no tira la portada.
await modo('500');
const conMemoria = await pedir('/');
caso('500 con datos en memoria → portada 200', conMemoria.status === 200, String(conMemoria.status));

// 6. Desde el navegador no se puede mandar la marca de llamada interna: el proxy la borra.
await modo('ok');
await pedir('/api/tienda', { headers: { 'x-sukha-interno': '1' } });
const [delNavegador] = await llamadas();
caso('el proxy borra x-sukha-interno', delNavegador?.interna === false, JSON.stringify(delNavegador));

console.log(fallos.length ? `✗ ${fallos.length} fallaron, ${ok} bien:\n  ${fallos.join('\n  ')}` : `✓ ${ok} comprobaciones bien`);
await terminar(fallos.length ? 1 : 0);
