// El panel no pierde datos (en un celular de 375 px): la ficha de producto guarda todo junto desde la barra «Cambios sin
// guardar», avisa al salir con cambios, muestra cuál tarjeta falló sin borrar lo escrito, y los borrados (foto, rango de
// códigos postales, logo) piden un segundo toque. Crea un producto de prueba y lo borra al final; rangos y logo no se borran.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, BASE, PREFIJO, abrirNavegador, api, ingresarAlPanel, paginaNueva } from './comun.mjs';

let navegador, pagina, id;
const sufijo = Date.now().toString(36);
const sinErrores = () => assert.deepEqual(pagina.errores.splice(0), [], 'errores de JavaScript o del servidor');
const cookie = async () => (await pagina.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
const producto = async () => (await api('GET', `/admin/productos/${id}`, undefined, await cookie())).json;
// Foto de 1×1 px: alcanza para que el navegador la pase a WebP y se suba.
const FOTO = { name: 'e2e.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') };
const barra = () => pagina.locator('[data-barra-guardado]');
// Al elegir la foto se abre el recorte: se sube completa.
const subirFoto = async () => {
  await pagina.locator('form[data-subida] input[type=file][name=foto]').setInputFiles(FOTO);
  await pagina.getByRole('button', { name: 'Usar completa' }).click();
};

before(async () => {
  assert.ok(ADMIN.clave, 'falta la clave del admin de prueba en .env.e2e');
  navegador = await abrirNavegador();
  pagina = await paginaNueva(navegador, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  // La barra de herramientas de `astro dev` tapa la barra de guardado (en staging no existe).
  await pagina.addInitScript(() => addEventListener('DOMContentLoaded', () => document.head.insertAdjacentHTML('beforeend', '<style>astro-dev-toolbar{display:none!important}</style>')));
  await ingresarAlPanel(pagina);
  // El producto de prueba se crea por la API: el alta desde el modal ya la prueba panel.test.mjs.
  const c = await cookie();
  const categoriaId = (await api('GET', '/admin/categorias', undefined, c)).json[0].id;
  const r = await api('POST', '/admin/productos', { nombre: `${PREFIJO} Guardado ${sufijo}`, categoriaId, precioCentavos: 1850000 }, c);
  assert.equal(r.status, 201, r.texto);
  id = r.json.id;
});
after(async () => {
  if (id) await api('DELETE', `/admin/productos/${id}`, undefined, await cookie());
  await navegador?.close();
});

test('producto: datos, variante y buscadores se guardan juntos desde la barra', async () => {
  await pagina.goto(`${BASE}/admin/productos/${id}`);
  assert.equal(await barra().isVisible(), false, 'sin cambios no hay barra');
  // Sin cambios, la foto se sube y la página se recarga para mostrarla.
  await subirFoto();
  await pagina.waitForURL(/\?ok$/);

  await pagina.locator('input[name=nombre]').fill(`${PREFIJO} Guardado nuevo ${sufijo}`);
  await barra().waitFor();
  // Con cambios, una foto nueva se sube igual pero no recarga (se perdería lo escrito).
  await subirFoto();
  await pagina.getByText('Foto subida. Se ve al guardar los cambios.').waitFor();
  assert.equal(await pagina.locator('input[name=nombre]').inputValue(), `${PREFIJO} Guardado nuevo ${sufijo}`);

  await pagina.locator('input[name=precio]').fill('19.900');
  await pagina.locator('form[data-pendiente="Nueva variante"] input[name=stock]').fill('3');
  await pagina.locator('input[name=seoTitulo]').fill(`${PREFIJO} título ${sufijo}`);
  // La dirección de otro producto: el servidor la rechaza.
  const c = await cookie();
  const otro = (await api('GET', '/admin/productos', undefined, c)).json.find((x) => String(x.id) !== String(id));
  const slugAjeno = (await api('GET', `/admin/productos/${otro.id}`, undefined, c)).json.slug;
  await pagina.locator('input[name=slug]').fill(slugAjeno);
  // Nada se sale de la pantalla del celular (la tarjeta de buscadores incluida).
  assert.deepEqual(await pagina.evaluate(() => [document.documentElement.scrollWidth, innerWidth]), [375, 375], 'la página es más ancha que la pantalla');

  // Salir por un link del panel con cambios pregunta; «cancelar» se queda.
  pagina.once('dialog', (d) => d.dismiss());
  await pagina.getByRole('link', { name: '← Productos' }).click();
  assert.match(pagina.url(), new RegExp(`/admin/productos/${id}`));

  // Datos y variante se guardan; Buscadores falla: dice cuál y no borra nada de lo escrito.
  await barra().getByRole('button', { name: 'Guardar' }).click();
  await barra().getByText(/^Buscadores: /).waitFor();
  assert.equal(await pagina.locator('input[name=slug]').inputValue(), slugAjeno);
  assert.equal(await pagina.locator('input[name=seoTitulo]').inputValue(), `${PREFIJO} título ${sufijo}`);

  // Al reintentar no se repite lo que ya se guardó (la variante se crea una sola vez).
  await pagina.locator('input[name=slug]').fill(`e2e-guardado-${sufijo}`);
  // La dirección ya termina en ?ok (por la foto): se espera la recarga, no la dirección.
  await Promise.all([pagina.waitForNavigation(), barra().getByRole('button', { name: 'Guardar' }).click()]);
  const p = await producto();
  assert.equal(p.nombre, `${PREFIJO} Guardado nuevo ${sufijo}`);
  assert.equal(p.precioCentavos, 1990000);
  assert.equal(p.seoTitulo, `${PREFIJO} título ${sufijo}`);
  assert.equal(p.slug, `e2e-guardado-${sufijo}`);
  assert.deepEqual(p.variantes.map((v) => v.stock), [3]);
  assert.equal(p.imagenes.length, 2);
  assert.equal(await barra().isVisible(), false);
  sinErrores();
});

test('producto: «Descartar» vuelve a lo guardado', async () => {
  await pagina.goto(`${BASE}/admin/productos/${id}`);
  await pagina.locator('input[name=nombre]').fill('Esto no se guarda');
  await barra().getByRole('button', { name: 'Descartar los cambios' }).click();
  await pagina.waitForLoadState('load');
  await pagina.locator('input[name=nombre]').waitFor();
  assert.equal(await pagina.locator('input[name=nombre]').inputValue(), `${PREFIJO} Guardado nuevo ${sufijo}`);
  assert.equal(await barra().isVisible(), false);
  sinErrores();
});

test('borrar una foto pide un segundo toque', async () => {
  await pagina.goto(`${BASE}/admin/productos/${id}`);
  await pagina.getByLabel('Borrar la foto 1').click();
  assert.equal(await pagina.locator('figure[data-id]').count(), 2, 'un toque no borra');
  await pagina.locator('figure[data-id]').first().getByRole('button', { name: '¿Borrar?' }).click();
  await pagina.waitForURL(/\?ok$/);
  assert.equal(await pagina.locator('figure[data-id]').count(), 1);
  sinErrores();
});

test('rangos de códigos postales y logo: un toque solo muestra «¿Borrar?»', async () => {
  await pagina.goto(`${BASE}/admin/envios`);
  // Los códigos postales están en la ventana de cada zona.
  const ventana = pagina.locator('dialog:has(summary[aria-label^="Quitar códigos"])').first();
  if (await ventana.count()) {
    await pagina.locator(`[data-alta="${await ventana.getAttribute('id')}"]`).click();
    const antes = await ventana.locator('summary[aria-label^="Quitar códigos"]').count();
    await ventana.locator('summary[aria-label^="Quitar códigos"]').first().click();
    await ventana.locator('details[open]').getByRole('button', { name: '¿Borrar?' }).waitFor();
    assert.equal(await ventana.locator('summary[aria-label^="Quitar códigos"]').count(), antes, 'un toque no borra');
  }
  await pagina.goto(`${BASE}/admin/configuracion#imagen`);
  const logo = pagina.getByLabel('Quitar logo');
  if (await logo.count()) {
    await logo.click();
    await pagina.locator('details[open]').getByRole('button', { name: '¿Borrar?' }).waitFor();
    assert.equal(await pagina.getByAltText('Logo actual').count(), 1, 'un toque no borra');
  }
  sinErrores();
});
