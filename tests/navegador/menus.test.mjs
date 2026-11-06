// Menús de la cabecera como en el canvas: en escritorio, paneles que se abren al pasar por una categoría con subcategorías o por
// «Colecciones»; en el celular, un menú a pantalla completa con una pantalla por categoría y otra para las colecciones.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { BASE, abrirNavegador, paginaNueva } from './comun.mjs';

let navegador;
before(async () => (navegador = await abrirNavegador()));
after(() => navegador?.close());

test('escritorio: la categoría con subcategorías abre su panel y «Colecciones» el suyo', async () => {
  const pagina = await paginaNueva(navegador, { viewport: { width: 1440, height: 800 } });
  await pagina.goto(`${BASE}/productos`);
  const gatillo = pagina.locator('[data-cabecera] [data-menu-abre^="cat-"]').first();
  if (!(await gatillo.count())) return; // sin categorías con subcategorías no hay panel
  await pagina.waitForFunction(() => document.querySelector('[data-cabecera]')); // el script ya enganchó los eventos
  await gatillo.hover();
  const id = await gatillo.getAttribute('data-menu-abre');
  const panel = pagina.locator(`[data-panel="${id}"]`);
  await panel.waitFor({ state: 'visible' });
  assert.equal(await gatillo.getAttribute('aria-expanded'), 'true');
  const colecciones = pagina.locator('[data-menu-abre="colecciones"]');
  if (await colecciones.count()) {
    await colecciones.hover();
    await pagina.locator('[data-panel="colecciones"]').waitFor({ state: 'visible' });
    assert.equal(await panel.isVisible(), false, 'se abre un panel por vez');
  }
  await pagina.keyboard.press('Escape');
  assert.equal(await pagina.locator('[data-panel]:visible').count(), 0, 'Escape cierra el panel');
  assert.deepEqual(pagina.errores, []);
});

test('celular: el menú muestra la categoría, vuelve y abre las colecciones', async () => {
  const pagina = await paginaNueva(navegador, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await pagina.goto(`${BASE}/productos`);
  await pagina.getByTitle('Abrir menú').click();
  const menu = pagina.locator('[data-menu-movil]');
  const ir = menu.locator('[data-ir^="cat-"]').first();
  if (await ir.count()) {
    const id = await ir.getAttribute('data-ir');
    await ir.click();
    await menu.locator(`[data-pantalla="${id}"]`).waitFor({ state: 'visible' });
    assert.equal(await menu.locator('[data-pantalla="principal"]').isVisible(), false);
    await menu.locator(`[data-pantalla="${id}"] [data-volver]`).click();
    await menu.locator('[data-pantalla="principal"]').waitFor({ state: 'visible' });
  }
  const col = menu.locator('[data-ir="colecciones"]');
  if (await col.count()) {
    await col.click();
    await menu.locator('[data-pantalla="colecciones"]').waitFor({ state: 'visible' });
  }
  assert.deepEqual(pagina.errores, []);
});
