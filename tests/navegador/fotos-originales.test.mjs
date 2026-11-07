// Fotos originales: se guardan al subir (campo opcional «original» + «encuadre»), solo las lee el panel, el reencuadre parte de
// ellas sin tocarlas, y se borran con la foto. Las fotos subidas sin original siguen funcionando.
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { after, before, test } from 'node:test';
import { BASE, abrirNavegador, ingresarAlPanel, paginaNueva } from './comun.mjs';

// WebP de 1×1 píxel.
const WEBP = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=', 'base64');
const archivo = (nombre) => ({ name: `${nombre}.webp`, mimeType: 'image/webp', buffer: WEBP });
// PNG de color liso, válido para cualquier decodificador (el navegador lo convierte a WebP).
function pngValido(ancho, alto) {
  const crc = (buf) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const b of buf) x = t[(x ^ b) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const trozo = (tipo, datos) => { const l = Buffer.alloc(4); l.writeUInt32BE(datos.length); const t = Buffer.concat([Buffer.from(tipo), datos]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(t)); return Buffer.concat([l, t, c]); };
  const cab = Buffer.alloc(13); cab.writeUInt32BE(ancho, 0); cab.writeUInt32BE(alto, 4); cab[8] = 8; cab[9] = 2;
  const filas = Buffer.alloc((ancho * 3 + 1) * alto, 0x80);
  for (let y = 0; y < alto; y++) filas[y * (ancho * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo('IHDR', cab), trozo('IDAT', deflateSync(filas)), trozo('IEND', Buffer.alloc(0))]);
}
let navegador, pagina, producto;
const h = { origin: BASE };

before(async () => {
  navegador = await abrirNavegador();
  pagina = await paginaNueva(navegador);
  await ingresarAlPanel(pagina);
  const cats = await (await pagina.request.get(`${BASE}/api/admin/categorias`)).json();
  const r = await pagina.request.post(`${BASE}/api/admin/productos`, { data: { nombre: 'E2E originales', categoriaId: cats[0].id, precioCentavos: 10000 }, headers: h });
  producto = await r.json();
});
after(async () => {
  await pagina.request.delete(`${BASE}/api/admin/productos/${producto.id}`, { headers: h }).catch(() => {});
  await navegador?.close();
});
const fotos = async () => (await (await pagina.request.get(`${BASE}/api/admin/productos/${producto.id}`)).json()).imagenes;
const subir = (extra = {}) => pagina.request.post(`${BASE}/api/admin/productos/${producto.id}/imagenes`, { multipart: { chico: archivo('chico'), mediano: archivo('mediano'), grande: archivo('grande'), ...extra }, headers: h });

test('subir con original: se guarda, solo el panel la lee y nunca se sirve a la tienda', async () => {
  const r = await subir({ original: archivo('original'), encuadre: JSON.stringify({ x: 0.1, y: 0.2, ancho: 0.5, alto: 0.6 }) });
  assert.equal(r.status(), 201, await r.text());
  const f = (await fotos())[0];
  assert.match(f.original, /\/original\.webp$/);
  assert.deepEqual(JSON.parse(f.encuadre), { x: 0.1, y: 0.2, ancho: 0.5, alto: 0.6 });
  const o = await pagina.request.get(`${BASE}/api/admin/imagenes/${f.id}/original`);
  assert.equal(o.status(), 200);
  assert.equal(o.headers()['content-type'], 'image/webp');
  assert.equal((await pagina.request.get(`${BASE}/api/imagenes/${f.original}`)).status(), 404, 'la tienda no sirve originales');
  // La API pública del producto no expone la original.
  const pub = await (await fetch(`${BASE}/api/productos/${producto.slug}`)).text();
  assert.ok(!pub.includes('original.webp'));
});

test('reencuadrar: clave nueva, la original y el encuadre nuevo se conservan', async () => {
  const f = (await fotos())[0];
  const r = await pagina.request.put(`${BASE}/api/admin/imagenes/${f.id}/archivos`, { multipart: { chico: archivo('chico'), mediano: archivo('mediano'), grande: archivo('grande'), encuadre: JSON.stringify({ x: 0, y: 0, ancho: 1, alto: 1 }) }, headers: h });
  assert.equal(r.status(), 200, await r.text());
  const g = (await fotos())[0];
  assert.notEqual(g.clave, f.clave);
  assert.equal(g.original, f.original, 'la original no se mueve');
  assert.deepEqual(JSON.parse(g.encuadre), { x: 0, y: 0, ancho: 1, alto: 1 });
  assert.equal((await pagina.request.get(`${BASE}/api/admin/imagenes/${g.id}/original`)).status(), 200);
  assert.equal((await pagina.request.get(`${BASE}/api/imagenes/${g.clave}/grande.webp`)).status(), 200);
});

test('foto sin original (formato anterior): sigue funcionando y se puede reencuadrar', async () => {
  const r = await subir();
  assert.equal(r.status(), 201);
  const f = (await fotos()).find((x) => !x.original);
  assert.ok(f, 'quedó sin original');
  assert.equal((await pagina.request.get(`${BASE}/api/admin/imagenes/${f.id}/original`)).status(), 404);
  const p = await pagina.request.put(`${BASE}/api/admin/imagenes/${f.id}/archivos`, { multipart: { chico: archivo('chico'), mediano: archivo('mediano'), grande: archivo('grande') }, headers: h });
  assert.equal(p.status(), 200);
});

test('una original que no es WebP se rechaza; borrar la foto borra la original', async () => {
  const mala = await subir({ original: { name: 'o.webp', mimeType: 'image/webp', buffer: Buffer.from('no soy webp') } });
  assert.equal(mala.status(), 400);
  const f = (await fotos()).find((x) => x.original);
  assert.equal((await pagina.request.delete(`${BASE}/api/admin/imagenes/${f.id}`, { headers: h })).status(), 200);
  assert.equal((await pagina.request.get(`${BASE}/api/admin/imagenes/${f.id}/original`)).status(), 404);
});

test('panel: al subir una foto se guarda la original y reencuadrar parte de ella', async () => {
  const PNG = { name: 'e2e.png', mimeType: 'image/png', buffer: pngValido(64, 48) };
  for (const f of await fotos()) await pagina.request.delete(`${BASE}/api/admin/imagenes/${f.id}`, { headers: h });
  await pagina.goto(`${BASE}/admin/productos/${producto.id}`);
  await pagina.locator('[data-subida] input[type=file][name=foto]').setInputFiles(PNG);
  await pagina.locator('dialog[open] [data-aceptar]').waitFor({ timeout: 10000 });
  await pagina.waitForTimeout(800);
  await pagina.locator('dialog[open] [data-aceptar]').click();
  await pagina.waitForURL(/\?ok/, { timeout: 30000 });
  const f = (await fotos())[0];
  assert.ok(f.original, 'la subida desde el panel guarda la original');
  const enc = JSON.parse(f.encuadre);
  assert.ok(enc.ancho > 0 && enc.alto > 0);
  // Reencuadrar abre el recorte sobre la original (data-original=1) y guarda el encuadre.
  const zona = pagina.locator('[data-recortar]').first();
  assert.equal(await zona.getAttribute('data-original'), '1');
  await zona.click();
  await pagina.locator('dialog[open] [data-aceptar]').waitFor({ timeout: 10000 });
  await pagina.waitForTimeout(800);
  await pagina.locator('dialog[open] [data-aceptar]').click();
  let g = (await fotos())[0];
  for (let i = 0; i < 30 && g.clave === f.clave; i++) { await pagina.waitForTimeout(500); g = (await fotos())[0]; }
  assert.notEqual(g.clave, f.clave);
  assert.equal(g.original, f.original);
  assert.deepEqual(pagina.errores, []);
});
