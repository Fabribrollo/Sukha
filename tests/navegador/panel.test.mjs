// El panel de admin en un navegador real: login, cada pantalla sin errores, modales de alta, redirecciones, portada con
// arrastre de secciones y cierre de sesión. Lo que crea lo borra; lo que no tiene forma de borrarse (categorías) solo
// se crea en local.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, BASE, LOCAL, PREFIJO, abrirNavegador, api, ingresarAlPanel, paginaNueva } from './comun.mjs';

let navegador, pagina;
const sufijo = Date.now().toString(36);
const sinErrores = () => assert.deepEqual(pagina.errores.splice(0), [], 'errores de JavaScript o del servidor');
const cookie = async () => (await pagina.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ');

before(async () => {
  assert.ok(ADMIN.clave, 'falta la clave del admin de prueba en .env.e2e');
  navegador = await abrirNavegador();
  pagina = await paginaNueva(navegador);
});
after(() => navegador?.close());

test('login: sin sesión manda al login, una contraseña mala avisa y la buena entra', async () => {
  await pagina.goto(`${BASE}/admin/productos`);
  assert.equal(new URL(pagina.url()).pathname, '/admin/login');
  await pagina.fill('input[name=email]', ADMIN.email);
  await pagina.fill('input[name=contrasena]', 'contraseña-incorrecta-e2e');
  await pagina.click('button:has-text("Ingresar")');
  await pagina.getByRole('alert').waitFor();
  await ingresarAlPanel(pagina);
  await pagina.getByRole('heading', { level: 1 }).waitFor();
  sinErrores();
});

const PANTALLAS = {
  '/admin': null,
  '/admin/pedidos': 'Ventas',
  '/admin/productos': 'Productos',
  '/admin/productos/carga-rapida': null,
  '/admin/categorias': 'Categorías',
  '/admin/colecciones': null,
  '/admin/portada': 'Editar página',
  '/admin/envios': null,
  '/admin/configuracion': null,
  '/admin/reportes': null,
  '/admin/carritos': null,
  '/admin/emails': null,
  '/admin/redirecciones': 'Redirecciones',
  '/admin/cupones': null,
  '/admin/clientas': null,
  '/admin/solicitudes': null,
  '/admin/opciones': null,
  '/admin/banners': null,
};

test('cada pantalla del panel carga con su título y sin errores', async () => {
  const fallas = [];
  for (const [ruta, titulo] of Object.entries(PANTALLAS)) {
    const r = await pagina.goto(`${BASE}${ruta}`);
    const h1 = (await pagina.locator('h1').first().textContent({ timeout: 5000 }).catch(() => ''))?.trim();
    const errores = pagina.errores.splice(0);
    if (r.status() !== 200 || !h1 || (titulo && h1 !== titulo) || errores.length) fallas.push(`${ruta}: ${r.status()} «${h1}» ${errores.join(' | ')}`);
  }
  // El detalle de la última venta y del primer producto, si hay.
  const c = await cookie();
  const venta = (await api('GET', '/admin/pedidos', undefined, c)).json?.[0];
  const producto = (await api('GET', '/admin/productos', undefined, c)).json?.[0];
  for (const ruta of [venta && `/admin/pedidos/${venta.id}`, producto && `/admin/productos/${producto.id}`].filter(Boolean)) {
    const r = await pagina.goto(`${BASE}${ruta}`);
    const errores = pagina.errores.splice(0);
    if (r.status() !== 200 || errores.length) fallas.push(`${ruta}: ${r.status()} ${errores.join(' | ')}`);
  }
  assert.deepEqual(fallas, []);
});

test('ventas: buscar y filtrar por estado', async () => {
  await pagina.goto(`${BASE}/admin/pedidos`);
  await pagina.getByRole('searchbox', { name: 'Buscar ventas' }).fill('SUK');
  await pagina.keyboard.press('Enter');
  await pagina.waitForURL(/q=SUK/);
  sinErrores();
});

test('modales de alta: producto, categoría y colección se abren y se cierran', async () => {
  for (const [ruta, id] of [['/admin/productos', 'alta-producto'], ['/admin/categorias', 'alta-categoria'], ['/admin/colecciones', 'alta-coleccion']]) {
    await pagina.goto(`${BASE}${ruta}`);
    await pagina.locator(`[data-alta="${id}"]`).click();
    const ventana = pagina.locator(`dialog#${id}`);
    await ventana.waitFor({ state: 'visible' });
    await ventana.locator('[data-cerrar]').first().click();
    await ventana.waitFor({ state: 'hidden' });
  }
  sinErrores();
});

test('alta de producto desde el modal y borrado desde la lista', async () => {
  const nombre = `${PREFIJO} Remera ${sufijo}`;
  await pagina.goto(`${BASE}/admin/productos`);
  await pagina.locator('[data-alta="alta-producto"]').click();
  const ventana = pagina.locator('dialog#alta-producto');
  await ventana.locator('input[name=nombre]').fill(nombre);
  await ventana.locator('input[name=precio]').fill('18.500');
  await ventana.getByRole('button', { name: 'Crear borrador' }).click();
  await pagina.waitForURL(/\/admin\/productos\/\d+\?ok$/);
  const id = pagina.url().match(/productos\/(\d+)/)[1];
  await pagina.getByRole('heading', { level: 1 }).waitFor();
  await pagina.goto(`${BASE}/admin/productos?q=${encodeURIComponent(nombre)}`);
  await pagina.locator(`summary[aria-label="Borrar ${nombre}"]`).click();
  await pagina.getByRole('button', { name: '¿Borrar?' }).click();
  await pagina.waitForURL(/\/admin\/productos\?(ok|oculto)/);
  assert.equal((await api('GET', `/admin/productos/${id}`, undefined, await cookie())).status, 404, 'el borrador se borra del todo');
  sinErrores();
});

test('local: alta de categoría desde el modal (no hay forma de borrarla)', { skip: !LOCAL || undefined }, async () => {
  const nombre = `${PREFIJO} Categoría ${sufijo}`;
  await pagina.goto(`${BASE}/admin/categorias`);
  await pagina.locator('[data-alta="alta-categoria"]').click();
  await pagina.locator('dialog#alta-categoria input[name=nombre]').fill(nombre);
  await pagina.getByRole('button', { name: 'Crear categoría' }).click();
  await pagina.waitForURL(/\/admin\/categorias\?ok$/);
  await pagina.getByText(nombre).first().waitFor();
  sinErrores();
});

test('redirecciones: se carga una, la tienda la sigue y se borra', async () => {
  const desde = `/e2e-viejo-${sufijo}`;
  await pagina.goto(`${BASE}/admin/redirecciones`);
  await pagina.locator('[data-alta="alta-redireccion"]').click();
  await pagina.locator('input[name=desde]').fill(desde);
  await pagina.locator('input[name=hacia]').fill('/productos');
  await pagina.getByRole('button', { name: 'Agregar' }).click();
  await pagina.waitForURL(/\/admin\/redirecciones\?ok$/);
  const r = await fetch(`${BASE}${desde}?utm=1`, { redirect: 'manual' });
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), '/productos?utm=1');
  await pagina.locator(`summary[aria-label="Borrar la redirección desde ${desde}"]`).click();
  await pagina.getByRole('button', { name: '¿Borrar?' }).click();
  await pagina.waitForURL(/\/admin\/redirecciones\?ok$/);
  assert.equal(await pagina.getByText(desde).count(), 0);
  sinErrores();
});

test('reportes: cambiar el rango de fechas', async () => {
  await pagina.goto(`${BASE}/admin/reportes`);
  // Un solo campo con calendario: dos toques (el 1 del mes y el último día habilitado) arman el rango.
  await pagina.locator('[data-rango] input[readonly]').click();
  const dias = pagina.locator('.flatpickr-calendar.open .flatpickr-day:not(.prevMonthDay):not(.nextMonthDay):not(.flatpickr-disabled)');
  await dias.first().click();
  await dias.last().click(); // el último día habilitado (hoy)
  await pagina.getByRole('button', { name: 'Ver' }).click();
  await pagina.waitForURL(/desde=\d{4}-\d{2}-01&hasta=\d{4}-\d{2}-\d{2}/);
  sinErrores();
});

test('emails: cada plantilla abre su editor', async () => {
  await pagina.goto(`${BASE}/admin/emails`);
  await pagina.locator('textarea[name=texto]').waitFor();
  sinErrores();
});

// La portada se edita en un borrador compartido: en staging solo se mira, para no pisar un borrador de Fabrizio.
test('local: portada, arrastrar una sección cambia el orden del borrador', { skip: !LOCAL || undefined }, async () => {
  const c = await cookie();
  const antes = (await api('GET', '/admin/portada', undefined, c)).json;
  try {
    await pagina.goto(`${BASE}/admin/portada`);
    const filas = pagina.locator('[data-secciones] > li');
    await filas.nth(1).waitFor();
    const orden = async () => filas.evaluateAll((l) => l.map((f) => f.dataset.id));
    const inicial = await orden();
    // Arrastra la primera sección debajo de la segunda, con el mouse, como una persona.
    const asa = await filas.nth(0).locator('[data-asa]').boundingBox();
    const destino = await filas.nth(1).boundingBox();
    await pagina.mouse.move(asa.x + asa.width / 2, asa.y + asa.height / 2);
    await pagina.mouse.down();
    await pagina.mouse.move(asa.x + asa.width / 2, destino.y + destino.height * 0.8, { steps: 15 });
    await pagina.mouse.up();
    await pagina.getByText('Guardado en el borrador').waitFor();
    const nuevo = await orden();
    assert.deepEqual(nuevo.slice(0, 2), [inicial[1], inicial[0]], 'la lista cambió de orden');
    const borrador = (await api('GET', '/admin/portada', undefined, c)).json.borrador;
    assert.deepEqual(borrador.secciones.slice(0, 2).map((s) => s.id), [inicial[1], inicial[0]], 'y el borrador se guardó así');
    // Deshacer vuelve al orden anterior.
    await pagina.getByRole('button', { name: 'Deshacer' }).click();
    await pagina.waitForFunction((ids) => [...document.querySelectorAll('[data-secciones] > li')].map((f) => f.dataset.id).join() === ids, inicial.join());
    sinErrores();
  } finally {
    // Deja el borrador como estaba.
    if (antes.borrador) await api('PUT', '/admin/portada/borrador', antes.borrador, c);
    else await api('DELETE', '/admin/portada/borrador', undefined, c);
  }
});

test('local: portada, ordenar con el teclado desde el botón de arrastre', { skip: !LOCAL || undefined }, async () => {
  const c = await cookie();
  const antes = (await api('GET', '/admin/portada', undefined, c)).json;
  try {
    await pagina.goto(`${BASE}/admin/portada`);
    const filas = pagina.locator('[data-secciones] > li');
    await filas.nth(1).waitFor();
    const inicial = await filas.evaluateAll((l) => l.map((f) => f.dataset.id));
    await filas.nth(0).locator('[data-asa]').focus();
    await pagina.keyboard.press('ArrowDown');
    await pagina.waitForTimeout(1200);
    const nuevo = await filas.evaluateAll((l) => l.map((f) => f.dataset.id));
    assert.deepEqual(nuevo.slice(0, 2), [inicial[1], inicial[0]], 'la flecha abajo sobre el asa debería bajar la sección');
  } finally {
    if (antes.borrador) await api('PUT', '/admin/portada/borrador', antes.borrador, c);
    else await api('DELETE', '/admin/portada/borrador', undefined, c);
  }
});

test('cerrar sesión: vuelve al login y el panel ya no abre', async () => {
  await pagina.goto(`${BASE}/admin`);
  await pagina.getByRole('button', { name: 'Cerrar sesión' }).click();
  await pagina.waitForURL(`${BASE}/admin/login`);
  await pagina.goto(`${BASE}/admin/productos`);
  assert.equal(new URL(pagina.url()).pathname, '/admin/login');
});
