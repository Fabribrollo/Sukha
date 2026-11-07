// Panel: categorías con tarjetas (padres → subcategorías) y pestaña «Cabecera» que define el menú de la tienda.
// Restaura el menú original al terminar.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, BASE, abrirNavegador, ingresarAlPanel, paginaNueva } from './comun.mjs';

let navegador, pagina;
const sinErrores = () => assert.deepEqual(pagina.errores.splice(0), [], 'errores de JavaScript o del servidor');

before(async () => {
  assert.ok(ADMIN.clave, 'falta la clave del admin de prueba en .env.e2e');
  navegador = await abrirNavegador();
  pagina = await paginaNueva(navegador, { viewport: { width: 1440, height: 900 } });
  await ingresarAlPanel(pagina);
});
after(async () => {
  await pagina?.request.delete(`${BASE}/api/admin/cabecera`).catch(() => {});
  await pagina?.request.delete(`${BASE}/api/admin/cabecera/borrador`).catch(() => {});
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

test('cabecera: editor visual con borrador, vista previa y publicar', async () => {
  await pagina.goto(`${BASE}/admin/cabecera`);
  const filas = pagina.locator('[data-secciones] > li');
  await filas.first().waitFor();
  assert.ok((await filas.count()) >= 2);
  const vista = pagina.frameLocator('iframe[data-vista]');
  await vista.locator('[data-cabecera]').waitFor();
  // Elegir en la lista una categoría con panel abre su desplegable en la vista previa.
  const conPanel = filas.filter({ hasText: 'con panel' }).first();
  await conPanel.click();
  await pagina.locator('[data-panel]').waitFor({ state: 'visible' });
  await vista.locator('[data-panel][data-eid]:not([hidden])').waitFor({ timeout: 8000 });
  // Tocar otra entrada en la vista previa la selecciona en el panel.
  const enlaceSuelto = vista.locator('[data-menu-sin-panel][data-eid]').first();
  const idSuelto = await enlaceSuelto.getAttribute('data-eid');
  await enlaceSuelto.click();
  await pagina.locator(`[data-secciones] > li[data-id="${idSuelto}"][aria-selected="true"]`).waitFor();
  // Se cambia el texto: se guarda solo en el borrador y lo publicado no cambia.
  const antes = (await (await pagina.request.get(`${BASE}/api/cabecera`)).json()).items.map((e) => e.texto);
  await pagina.locator('[data-campos] input[data-c$=".texto"]').fill('Novedades E2E');
  await pagina.waitForFunction(() => /Guardado en el borrador/.test(document.querySelector('[data-mensaje]')?.textContent ?? ''));
  assert.deepEqual((await (await pagina.request.get(`${BASE}/api/cabecera`)).json()).items.map((e) => e.texto), antes, 'lo publicado no cambia');
  const borr = await (await pagina.request.get(`${BASE}/api/cabecera?borrador=1`)).json();
  assert.ok(borr.items.some((e) => e.texto === 'Novedades E2E'), 'el borrador sí');
  // La vista previa se recarga con el borrador.
  await vista.locator('[data-cabecera] >> text=Novedades E2E').first().waitFor({ timeout: 10000 });
  assert.equal(await pagina.locator('[data-descartar]').isVisible(), true);
  // Publicar (con confirmación).
  await pagina.locator('[data-publicar]').click();
  await pagina.locator('dialog[open] button.btn-primario').click();
  await pagina.waitForLoadState('load');
  await pagina.waitForFunction(async (url) => (await (await fetch(url)).json()).items.some((e) => e.texto === 'Novedades E2E'), `${BASE}/api/cabecera`);
  await pagina.locator('[data-estado-publicada]').waitFor({ state: 'visible' });
  sinErrores();
});

test('cabecera: vista de celular abre la pantalla de la entrada; quitar pide confirmación', async () => {
  await pagina.goto(`${BASE}/admin/cabecera`);
  await pagina.locator('[data-secciones] > li').first().waitFor();
  const vista = pagina.frameLocator('iframe[data-vista]');
  await vista.locator('[data-cabecera]').waitFor();
  await pagina.locator('[data-ancho=celular]').click();
  await pagina.locator('[data-secciones] > li', { hasText: 'con panel' }).first().click();
  await vista.locator('[data-menu-movil] [data-pantalla]:not([hidden])[data-pantalla^="cat-"]').waitFor({ timeout: 8000 });
  // Agregar una entrada y quitarla: el diálogo de confirmación puede cancelarse.
  const cantidad = await pagina.locator('[data-secciones] > li').count();
  await pagina.locator('[data-agregar]').click();
  await pagina.locator('[data-secciones] > li').nth(cantidad).waitFor();
  await pagina.locator('[data-borrar]').click();
  await pagina.locator('dialog[open] button.btn-secundario').click();
  assert.equal(await pagina.locator('[data-secciones] > li').count(), cantidad + 1, 'cancelar no borra');
  await pagina.locator('[data-borrar]').click();
  await pagina.locator('dialog[open] button.btn-primario').click();
  await pagina.waitForFunction((n) => document.querySelectorAll('[data-secciones] > li').length === n, cantidad);
  // Descartar el borrador deja todo como estaba.
  await pagina.locator('[data-descartar]').click();
  await pagina.locator('dialog[open] button.btn-primario').click();
  await pagina.waitForLoadState('load');
  sinErrores();
});
