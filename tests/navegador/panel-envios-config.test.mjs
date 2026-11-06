// Envíos, Configuración y Preguntas frecuentes ordenados (en un celular de 375 px): Envíos en pestañas que quedan en la
// dirección y no pierden lo escrito, zonas en una lista con su ventana, Configuración por secciones con la barra
// «Cambios sin guardar», y las preguntas frecuentes como lista (agregar, ordenar con el teclado, borrar en dos toques).
// Lo que cambia (alias, titular, bultos y preguntas) se deja como estaba al terminar.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, BASE, abrirNavegador, api, ingresarAlPanel, paginaNueva } from './comun.mjs';

let navegador, pagina, antes;
const CLAVES = ['alias_transferencia', 'titular_transferencia', 'contenido_preguntas_frecuentes', 'bultos'];
const sinErrores = () => assert.deepEqual(pagina.errores.splice(0), [], 'errores de JavaScript o del servidor');
const cookie = async () => (await pagina.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
const config = async () => (await api('GET', '/admin/configuracion', undefined, await cookie())).json;
const barra = () => pagina.locator('[data-barra-guardado]');
const anchoDePantalla = () => pagina.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);

before(async () => {
  assert.ok(ADMIN.clave, 'falta la clave del admin de prueba en .env.e2e');
  navegador = await abrirNavegador();
  pagina = await paginaNueva(navegador, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  // La barra de herramientas de `astro dev` tapa la barra de guardado (en staging no existe).
  await pagina.addInitScript(() => addEventListener('DOMContentLoaded', () => document.head.insertAdjacentHTML('beforeend', '<style>astro-dev-toolbar{display:none!important}</style>')));
  await ingresarAlPanel(pagina);
  antes = await config();
});
after(async () => {
  const c = await cookie();
  for (const clave of CLAVES) if (antes && clave in antes) await api('PUT', `/admin/configuracion/${clave}`, { valor: antes[clave] }, c);
  await navegador?.close();
});

test('envíos: pestañas en la dirección, zonas en lista con ventana, nada se pierde al cambiar de pestaña', async () => {
  await pagina.goto(`${BASE}/admin/envios`);
  const alto = await pagina.evaluate(() => document.documentElement.scrollHeight);
  assert.ok(alto < 6000, `la pestaña Zonas mide ${alto} px`);
  assert.deepEqual(await anchoDePantalla(), [375, 375], 'la página es más ancha que la pantalla');
  assert.equal(await pagina.locator('[data-panel="bultos"]').isVisible(), false, 'solo se ve una pestaña');

  // Cada zona abre su ventana con precios y códigos postales.
  const zona = pagina.locator('[data-panel="zonas"] button[data-alta^="zona-"]').first();
  if (await zona.count()) {
    await zona.click();
    const ventana = pagina.locator('dialog[open]');
    await ventana.locator('input[name=precio]').waitFor();
    assert.equal(await ventana.locator('input[name=cpDesde]').count(), 1);
    await ventana.getByRole('button', { name: 'Cerrar' }).first().click();
  }
  // «+ Nueva» abre el alta en una ventana.
  await pagina.getByRole('button', { name: 'Nueva', exact: true }).click();
  await pagina.locator('dialog#alta-zona[open]').waitFor();
  await pagina.locator('dialog#alta-zona').getByRole('button', { name: 'Cancelar' }).click();

  // Bultos: lo escrito sigue ahí al ir a otra pestaña y volver; la barra avisa.
  await pagina.getByRole('link', { name: 'Bultos', exact: true }).click();
  assert.match(pagina.url(), /#bultos$/);
  const nombre = pagina.locator('[data-panel="bultos"] input[name=bultoNombre]').last();
  await nombre.fill('E2E caja');
  await barra().waitFor();
  await pagina.getByRole('link', { name: 'Zonas', exact: true }).click();
  await pagina.getByRole('link', { name: 'Bultos', exact: true }).click();
  assert.equal(await nombre.inputValue(), 'E2E caja');
  assert.deepEqual(await anchoDePantalla(), [375, 375], 'Bultos es más ancho que la pantalla');

  // Recargar con #bultos vuelve a esa pestaña; «Descartar» recarga sin guardar.
  await barra().getByRole('button', { name: 'Descartar los cambios' }).click();
  await pagina.waitForLoadState('load');
  await pagina.locator('[data-panel="bultos"]').waitFor();
  assert.equal(await pagina.locator('[data-panel="zonas"]').isVisible(), false);
  assert.ok(!(await config()).bultos?.some((b) => b.nombre === 'E2E caja'), 'descartar no guarda');
  sinErrores();
});

test('configuración: una sección por vez, se guardan juntas desde la barra y se vuelve a la misma sección', async () => {
  await pagina.goto(`${BASE}/admin/configuracion`);
  assert.deepEqual(await anchoDePantalla(), [375, 375], 'la página es más ancha que la pantalla');
  await pagina.getByRole('link', { name: 'Pagos', exact: true }).click();
  await pagina.locator('input[name=alias_transferencia]').fill('e2e.alias');
  await pagina.locator('input[name=titular_transferencia]').fill('E2E titular');
  // Salir con cambios pregunta; «cancelar» se queda.
  pagina.once('dialog', (d) => d.dismiss());
  await pagina.getByRole('link', { name: 'Textos', exact: true }).click();
  assert.match(pagina.url(), /configuracion/);

  await Promise.all([pagina.waitForURL(/\?ok#pagos$/), barra().getByRole('button', { name: 'Guardar' }).click()]);
  await pagina.locator('input[name=alias_transferencia]').waitFor();
  const c = await config();
  assert.equal(c.alias_transferencia, 'e2e.alias');
  assert.equal(c.titular_transferencia, 'E2E titular');
  assert.equal(await barra().isVisible(), false);
  sinErrores();
});

test('preguntas frecuentes: agregar, ordenar con el teclado, borrar en dos toques y restaurar', async () => {
  await pagina.goto(`${BASE}/admin/textos?t=contenido_preguntas_frecuentes`);
  assert.deepEqual(await anchoDePantalla(), [375, 375], 'la página es más ancha que la pantalla');
  const filas = pagina.locator('[data-preguntas] > li');
  const cuantas = await filas.count();
  assert.ok(cuantas > 1);
  const primera = await filas.first().locator('[data-titulo]').textContent();

  // Agregar una pregunta (se abre sola) y subirla al primer lugar con las flechas.
  await pagina.getByRole('button', { name: 'Agregar pregunta' }).click();
  const nueva = filas.last();
  await nueva.locator('input[name=pregunta]').fill('¿E2E pregunta?');
  await nueva.locator('textarea[name=respuesta]').fill('Primer párrafo.\n\nSegundo párrafo.');
  await barra().waitFor();
  const asa = nueva.locator('[data-asa]');
  await asa.focus();
  for (let i = 0; i < cuantas; i++) await pagina.keyboard.press('ArrowUp');
  assert.equal(await filas.first().locator('[data-titulo]').textContent(), '¿E2E pregunta?');

  // Borrar la que era primera: un toque solo muestra «¿Borrar?».
  const vieja = filas.nth(1);
  await vieja.locator('summary').first().click();
  await vieja.getByLabel('Borrar la pregunta').click();
  assert.equal(await filas.count(), cuantas + 1, 'un toque no borra');
  await vieja.getByRole('button', { name: '¿Borrar?' }).click();
  assert.equal(await filas.count(), cuantas);

  await Promise.all([pagina.waitForURL(/t=contenido_preguntas_frecuentes&ok$/), barra().getByRole('button', { name: 'Guardar' }).click()]);
  const guardadas = (await config()).contenido_preguntas_frecuentes;
  assert.equal(guardadas.length, cuantas);
  assert.deepEqual(guardadas[0], { pregunta: '¿E2E pregunta?', respuesta: 'Primer párrafo.\n\nSegundo párrafo.' });
  assert.ok(!guardadas.some((q) => q.pregunta === primera), 'la borrada no se guarda');

  // «Restaurar el original» viaja con su botón aunque lo mande la barra.
  await Promise.all([pagina.waitForNavigation(), pagina.getByRole('button', { name: 'Restaurar el original' }).click()]);
  assert.deepEqual((await config()).contenido_preguntas_frecuentes, []);
  assert.notEqual(await filas.first().locator('[data-titulo]').textContent(), '¿E2E pregunta?', 'vuelven las originales');
  sinErrores();
});
