// Promociones (5.2), tienda que vende más (4.6), menú del celular (5.7) y portada con teclado: la página de promociones del
// panel, el 2x1 en el carrito, las etiquetas de la tarjeta, el pie con ayuda y el orden de la portada con flechas.
// Lo que se crea se borra al terminar.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, BASE, abrirNavegador, api, ingresarAlPanel, paginaNueva, sql } from './comun.mjs';

let navegador, pagina;
const sufijo = Date.now().toString(36).toUpperCase();
const NOMBRE = `E2E ${sufijo} 2x1`;
const sinErrores = () => assert.deepEqual(pagina.errores.splice(0).filter((e) => !e.includes('Transition was aborted')), [], 'errores de JavaScript o del servidor');

before(async () => {
  assert.ok(ADMIN.clave, 'falta la clave del admin de prueba en .env.e2e');
  navegador = await abrirNavegador();
  pagina = await paginaNueva(navegador, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  await ingresarAlPanel(pagina);
});
after(async () => {
  sql(`DELETE FROM promocion WHERE nombre LIKE 'E2E ${sufijo}%'`);
  await navegador?.close();
});

test('panel: se crea un 2x1 por colección y aparece como vigente', async () => {
  await pagina.goto(`${BASE}/admin/promociones`);
  await pagina.locator('[data-alta="alta-promocion"]').click();
  const ventana = pagina.locator('#alta-promocion');
  await ventana.locator('input[name=nombre]').fill(NOMBRE);
  await ventana.locator('select[name=tipo]').selectOption('2x1');
  assert.equal(await ventana.locator('input[name=porcentaje]').isDisabled(), true, 'sin porcentaje en un 2x1');
  await ventana.locator('select[name=alcance]').selectOption({ index: 0 });
  await Promise.all([pagina.waitForURL(/\?ok/), ventana.getByRole('button', { name: 'Crear promoción' }).click()]);
  const tarjeta = pagina.locator('article', { hasText: NOMBRE });
  assert.equal(await tarjeta.count(), 1);
  assert.match(await tarjeta.innerText(), /Vigente/);
  sinErrores();
});

test('API: la liquidación vigente baja el precio y el 2x1 descuenta la más barata', async () => {
  const [{ id: categoriaId }] = sql('SELECT id FROM categoria LIMIT 1');
  sql(`INSERT INTO promocion (nombre, tipo, porcentaje, categoria_id) VALUES ('E2E ${sufijo} liq', 'liquidacion', 50, ${categoriaId})`);
  const [{ id: varianteId, precio_centavos }] = sql(
    `SELECT v.id, p.precio_centavos FROM variante v JOIN producto p ON p.id = v.producto_id WHERE p.categoria_id = ${categoriaId} AND p.estado = 'publicado' AND v.activa = 1 AND v.stock >= 2 ORDER BY p.precio_centavos DESC LIMIT 1`,
  );
  const r = await api('POST', '/carrito/validar', { items: [{ varianteId, cantidad: 2 }] });
  assert.equal(r.status, 200);
  assert.ok(r.json.lineas[0].precioCentavos <= Math.ceil(precio_centavos / 2), 'la liquidación del 50% rige');
});

test('carrito: un producto de una categoría oculta no se puede comprar', async () => {
  const [{ varianteId, categoriaId }] = sql(
    `SELECT v.id AS varianteId, p.categoria_id AS categoriaId FROM variante v JOIN producto p ON p.id = v.producto_id WHERE p.estado = 'publicado' AND v.activa = 1 AND v.stock > 0 LIMIT 1`,
  );
  try {
    sql(`UPDATE categoria SET activa = 0 WHERE id = ${categoriaId}`);
    const r = await api('POST', '/carrito/validar', { items: [{ varianteId, cantidad: 1 }] });
    assert.equal(r.json.lineas.length, 0);
    assert.equal(r.json.problemas[0]?.motivo, 'Ya no está disponible.');
  } finally {
    sql(`UPDATE categoria SET activa = 1 WHERE id = ${categoriaId}`);
  }
});

test('tienda en el celular: pie con ayuda, tarjeta con precio por transferencia y menú con letra grande', async () => {
  await pagina.goto(`${BASE}/productos`);
  // Diseño de Categoría: cada tarjeta del listado dice cuánto cuesta pagando por transferencia (si la tienda tiene el descuento).
  const descuento = (await api('GET', '/tienda')).json.descuentoTransferenciaPorcentaje;
  if (descuento > 0) assert.ok((await pagina.getByText('con transferencia').count()) > 0, 'la tarjeta muestra el precio con transferencia');
  // El pie del diseño: la lista de ayuda con el botón de arrepentimiento (obligatorio por ley) a un toque.
  await pagina.locator('footer').getByRole('link', { name: 'Botón de arrepentimiento' }).waitFor();
  const [scroll, ancho] = await pagina.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert.equal(scroll, ancho, 'sin scroll horizontal');
  sinErrores();
});

test('portada: las secciones se ordenan con el teclado y el foco no se pierde', async () => {
  await pagina.setViewportSize({ width: 1280, height: 900 });
  await pagina.goto(`${BASE}/admin/portada`);
  await pagina.waitForSelector('[data-secciones] [data-id]');
  const orden = () => pagina.locator('[data-secciones] [data-id]').evaluateAll((filas) => filas.map((f) => f.dataset.id));
  const habiaBorrador = await pagina.locator('[data-descartar]').isVisible();
  const antes = await orden();
  assert.ok(antes.length >= 2, 'la portada de prueba tiene al menos dos secciones');
  // Solo se ordena con el asa (arrastrando o con el teclado sobre ella); no hay botones de flecha.
  assert.equal(await pagina.locator('[data-secciones] [data-subir], [data-secciones] [data-bajar]').count(), 0, 'sin botones subir/bajar');
  await pagina.locator('[data-secciones] [data-id]').first().locator('[data-asa]').focus();
  await pagina.keyboard.press('ArrowDown');
  assert.equal((await orden())[1], antes[0], 'la primera sección bajó un lugar');
  await pagina.waitForTimeout(1200);
  // Con las flechas del asa también: se deja la sección donde estaba.
  await pagina.locator('[data-secciones] [data-id]').nth(1).locator('[data-asa]').focus();
  await pagina.keyboard.press('ArrowUp');
  assert.deepEqual(await orden(), antes, 'la flecha arriba la devolvió a su lugar');
  await pagina.waitForTimeout(1500);
  if (!habiaBorrador) {
    const cookie = (await pagina.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
    await api('DELETE', '/admin/portada/borrador', undefined, cookie);
  }
  sinErrores();
});
