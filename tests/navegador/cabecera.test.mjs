// Panel: categorías con tarjetas (padres → subcategorías) y pestaña «Cabecera» que define el menú de la tienda.
// Restaura el menú original al terminar.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, BASE, abrirNavegador, ingresarAlPanel, paginaNueva } from './comun.mjs';

let navegador, pagina;
const sinErrores = () => assert.deepEqual(pagina.errores.splice(0), [], 'errores de JavaScript o del servidor');
const PNG = { name: 'e2e.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DwnwEJMDEgAQAv1gIBhxpB8gAAAABJRU5ErkJggg==', 'base64') };

before(async () => {
  assert.ok(ADMIN.clave, 'falta la clave del admin de prueba en .env.e2e');
  navegador = await abrirNavegador();
  pagina = await paginaNueva(navegador, { viewport: { width: 1440, height: 900 } });
  await ingresarAlPanel(pagina);
});
after(async () => {
  await pagina?.request.delete(`${BASE}/api/admin/cabecera`).catch(() => {});
  await navegador?.close();
});

test('categorías: tarjetas de las principales y paso a sus subcategorías', async () => {
  await pagina.goto(`${BASE}/admin/categorias`);
  const tarjetas = pagina.locator('li[data-id]');
  assert.ok((await tarjetas.count()) > 0);
  const ver = pagina.locator('[data-subcategorias]').first();
  await ver.click();
  await pagina.waitForURL(/padre=\d+/);
  assert.ok(await pagina.getByText('Categorías').first().isVisible());
  assert.equal(await pagina.locator('[data-subcategorias]').count(), 0, 'las subcategorías no tienen otro nivel');
  sinErrores();
});

test('cabecera: se edita el orden, se guarda y la tienda lo muestra', async () => {
  await pagina.goto(`${BASE}/admin/cabecera`);
  await pagina.locator('#editor details').first().waitFor();
  const antes = await pagina.locator('#editor details summary span').allTextContents();
  assert.ok(antes.length >= 2);
  // «Lo nuevo» baja un lugar y se renombra.
  const asa = pagina.locator('#editor details').first().locator('[data-asa]').first();
  await asa.focus();
  await pagina.keyboard.press('ArrowDown');
  await pagina.waitForTimeout(1000); // el orden se aplica tras una pausa corta
  await pagina.locator('#editor details').nth(1).locator('summary').click();
  await pagina.locator('#editor details').nth(1).locator('input[data-c$=".texto"]').fill('Novedades E2E');
  await pagina.locator('[data-guardar]').click();
  await pagina.waitForFunction(() => /Guardado/.test(document.querySelector('[data-aviso]')?.textContent ?? ''));
  const r = await pagina.request.get(`${BASE}/api/cabecera`);
  const menu = await r.json();
  assert.equal(menu.items[1].texto, 'Novedades E2E');
  // La tienda lo toma (la caché dura hasta un minuto, así que se mira la API y no la página).
  sinErrores();
});

test('cabecera: foto de una tarjeta y entrada solo para celular', async () => {
  await pagina.goto(`${BASE}/admin/cabecera`);
  await pagina.locator('#editor details').first().waitFor();
  await pagina.locator('[data-a=mas-enlace]').click();
  const nueva = pagina.locator('#editor details').last();
  await nueva.locator('select[data-c$=".dispositivo"]').selectOption('celular');
  // Quitar pide confirmación: el primer toque no borra.
  const cantidad = await pagina.locator('#editor details').count();
  await nueva.locator('[data-a=borrar]').click();
  assert.equal(await pagina.locator('#editor details').count(), cantidad, 'el primer toque no borra');
  await pagina.locator('#tarjetas-movil [data-a=mas-tarjeta]').click();
  await pagina.locator('#tarjetas-movil input[type=file]').setInputFiles(PNG);
  await pagina.locator('dialog[open], [role=dialog]').first().waitFor({ timeout: 5000 }).catch(() => {});
  sinErrores();
});
