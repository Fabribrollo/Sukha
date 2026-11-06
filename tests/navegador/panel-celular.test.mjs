// Panel cómodo en el celular (375 px), altas en modal y herramientas del día a día (paquetes 4.2, 4.4 y 4.9): ninguna
// pantalla se sale del ancho, pestañas con cantidades, aviso «Guardado» flotante, portada con pestañas, cupones, talles y
// colores en modal con orden, post-venta con pestañas y modo vacaciones. Lo que se crea se borra al terminar.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, BASE, abrirNavegador, api, ingresarAlPanel, paginaNueva, sql } from './comun.mjs';

let navegador, pagina, antes;
const sufijo = Date.now().toString(36).toUpperCase();
// «Transition was aborted»: el fundido entre pantallas del navegador se corta si se recarga justo ahí; no es de la página.
const sinErrores = () => assert.deepEqual(pagina.errores.splice(0).filter((e) => !e.includes('Transition was aborted')), [], 'errores de JavaScript o del servidor');
const cookie = async () => (await pagina.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
const ancho = () => pagina.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);

before(async () => {
  assert.ok(ADMIN.clave, 'falta la clave del admin de prueba en .env.e2e');
  navegador = await abrirNavegador();
  pagina = await paginaNueva(navegador, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  await pagina.addInitScript(() => addEventListener('DOMContentLoaded', () => document.head.insertAdjacentHTML('beforeend', '<style>astro-dev-toolbar{display:none!important}</style>')));
  await ingresarAlPanel(pagina);
  antes = (await api('GET', '/admin/configuracion', undefined, await cookie())).json;
});
after(async () => {
  const c = await cookie();
  for (const clave of ['vacaciones_activo', 'vacaciones_mensaje']) if (antes && clave in antes) await api('PUT', `/admin/configuracion/${clave}`, { valor: antes[clave] }, c);
  sql(`DELETE FROM cupon WHERE codigo LIKE 'E2E${sufijo}%'`);
  sql(`DELETE FROM talle WHERE nombre LIKE 'E2E%'`);
  sql(`DELETE FROM color WHERE nombre LIKE 'E2E%'`);
  await navegador?.close();
});

test('en el celular, ninguna pantalla del panel se sale del ancho', async () => {
  for (const ruta of ['/admin', '/admin/pedidos', '/admin/productos', '/admin/cupones', '/admin/opciones', '/admin/solicitudes', '/admin/redirecciones', '/admin/carritos']) {
    await pagina.goto(`${BASE}${ruta}`);
    assert.deepEqual(await ancho(), [375, 375], `${ruta} es más ancha que la pantalla`);
  }
  sinErrores();
});

test('inicio: lo pendiente va primero y no repite Reportes', async () => {
  await pagina.goto(`${BASE}/admin`);
  assert.equal(await pagina.getByText('Más vendidos').count(), 0);
  sinErrores();
});

test('ventas y productos: tarjetas en el celular y cantidades en las pestañas', async () => {
  await pagina.goto(`${BASE}/admin/productos`);
  assert.equal(await pagina.locator('table.tabla-tarjetas thead').first().isVisible(), false, 'sin encabezado de tabla en el celular');
  assert.match(await pagina.locator('nav[aria-label="Filtrar por estado"] a').first().innerText(), /\d/, 'la pestaña Todos lleva su cantidad');
  await pagina.goto(`${BASE}/admin/pedidos`);
  assert.ok((await pagina.locator('nav[aria-label="Filtrar por estado"] a').count()) > 1);
  sinErrores();
});

test('«Guardado» es un aviso flotante que no empuja la página', async () => {
  await pagina.goto(`${BASE}/admin/cupones?ok`);
  const aviso = pagina.locator('.aviso-flotante');
  await aviso.waitFor();
  assert.equal(await aviso.evaluate((e) => getComputedStyle(e).position), 'fixed');
  sinErrores();
});

test('portada: en el celular arranca en vista celular con pestañas Secciones · Vista previa', async () => {
  await pagina.goto(`${BASE}/admin/portada`);
  assert.equal(await pagina.locator('[data-ancho="celular"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await pagina.locator('section[aria-label="Vista previa de la portada"]').isVisible(), false);
  await pagina.locator('[data-ver="previa"]').click();
  assert.equal(await pagina.locator('section[aria-label="Vista previa de la portada"]').isVisible(), true);
  assert.equal(await pagina.locator('section[aria-label="Secciones de la portada"]').isVisible(), false);
  sinErrores();
});

test('cupones: alta y edición en modal, con % o $ según el tipo', async () => {
  const codigo = `E2E${sufijo}`;
  await pagina.goto(`${BASE}/admin/cupones`);
  await pagina.locator('[data-alta="alta-cupon"]').click();
  const alta = pagina.locator('dialog#alta-cupon');
  assert.equal(await alta.locator('[data-prefijo]').first().innerText(), '%');
  await alta.locator('select[name=tipo]').selectOption('monto');
  assert.equal(await alta.locator('[data-prefijo]').first().innerText(), '$');
  await alta.locator('select[name=tipo]').selectOption('envio_gratis');
  assert.equal(await alta.locator('input[name=valor]').isDisabled(), true);
  await alta.locator('select[name=tipo]').selectOption('porcentaje');
  await alta.locator('input[name=codigo]').fill(codigo);
  await alta.locator('input[name=valor]').fill('10');
  await alta.getByRole('button', { name: 'Crear cupón' }).click();
  await pagina.waitForURL(/\/admin\/cupones\?ok$/);
  await pagina.locator('article', { hasText: codigo }).getByRole('button', { name: 'Editar' }).click();
  const edicion = pagina.locator('dialog#editar-cupon');
  assert.match(await edicion.locator('h2').innerText(), new RegExp(codigo));
  await edicion.locator('input[name=usosMaximos]').fill('5');
  await edicion.getByRole('button', { name: 'Guardar' }).click();
  await pagina.waitForURL(/\/admin\/cupones\?ok$/);
  await pagina.locator('article', { hasText: codigo }).getByText('de 5 usos').waitFor();
  sinErrores();
});

test('talles y colores: alta y edición en modal, orden con el teclado', async () => {
  await pagina.goto(`${BASE}/admin/opciones`);
  for (const nombre of [`E2E-${sufijo}-1`, `E2E-${sufijo}-2`]) {
    await pagina.locator('[data-alta="alta-talle"]').click();
    await pagina.locator('dialog#alta-talle input[name=nombre]').fill(nombre.slice(0, 20));
    await pagina.locator('dialog#alta-talle').getByRole('button', { name: 'Agregar' }).click();
    await pagina.waitForURL(/\/admin\/opciones\?ok$/);
  }
  const lista = pagina.locator('ul[data-orden="/api/admin/talles/orden"]');
  // Subir el último talle un lugar con las flechas guarda el orden.
  await lista.locator('li', { hasText: `E2E-${sufijo}-2` }).locator('[data-asa]').focus();
  await pagina.keyboard.press('ArrowUp');
  await pagina.getByText('Orden guardado.').first().waitFor({ timeout: 5000 });
  await pagina.reload();
  const nombres = await lista.locator('li span.flex-1').allInnerTexts();
  assert.ok(nombres.indexOf(`E2E-${sufijo}-2`) < nombres.indexOf(`E2E-${sufijo}-1`), 'el orden quedó guardado');
  // Editar el nombre.
  await lista.locator('li', { hasText: `E2E-${sufijo}-1` }).getByRole('button', { name: /Editar/ }).click();
  await pagina.locator('dialog#editar-talle input[name=nombre]').fill(`E2E-${sufijo}-uno`);
  await pagina.locator('dialog#editar-talle').getByRole('button', { name: 'Guardar' }).click();
  await pagina.waitForURL(/\/admin\/opciones\?ok$/);
  await pagina.locator('ul[data-orden="/api/admin/talles/orden"] li', { hasText: `E2E-${sufijo}-uno` }).waitFor();
  // Color nuevo.
  await pagina.locator('[data-alta="alta-color"]').click();
  await pagina.locator('dialog#alta-color input[name=nombre]').fill(`E2E ${sufijo}`);
  await pagina.locator('dialog#alta-color').getByRole('button', { name: 'Agregar' }).click();
  await pagina.waitForURL(/\/admin\/opciones\?ok$/);
  await pagina.locator('ul[data-orden="/api/admin/colores/orden"] li', { hasText: `E2E ${sufijo}` }).waitFor();
  sinErrores();
});

test('post-venta: pestañas por estado', async () => {
  await pagina.goto(`${BASE}/admin/solicitudes`);
  const activa = () => pagina.locator('nav[aria-label="Filtrar por estado"] a[aria-current=page]').innerText();
  assert.match(await activa(), /^Abierta/);
  await pagina.goto(`${BASE}/admin/solicitudes?estado=todas`);
  assert.match(await activa(), /^Todas/);
  sinErrores();
});

test('exportar stock en CSV y modo vacaciones', async () => {
  const c = await cookie();
  const csv = await fetch(`${BASE}/api/admin/productos/exportar`, { headers: { cookie: c } });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match((await csv.text()).split('\n')[0], /producto/);

  await api('PUT', '/admin/configuracion/vacaciones_activo', { valor: true }, c);
  await api('PUT', '/admin/configuracion/vacaciones_mensaje', { valor: 'Volvemos pronto' }, c);
  const activo = await api('GET', '/tienda');
  assert.deepEqual(activo.json.vacaciones, { mensaje: 'Volvemos pronto' });
  await api('PUT', '/admin/configuracion/vacaciones_activo', { valor: false }, c);
  assert.equal((await api('GET', '/tienda')).json.vacaciones, null);
});
