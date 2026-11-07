// Editores de la tienda: pestañas Portada | Cabecera, orden solo con el asa (sin flechas), y fotos de producto
// (tocar la foto reencuadra; tocar el color la reasigna).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { BASE, abrirNavegador, ingresarAlPanel, paginaNueva } from './comun.mjs';

let navegador, pagina;
before(async () => {
  navegador = await abrirNavegador();
  pagina = await paginaNueva(navegador, { viewport: { width: 1440, height: 900 } });
  await ingresarAlPanel(pagina);
});
after(async () => {
  await pagina?.request.delete(`${BASE}/api/admin/cabecera/borrador`).catch(() => {});
  await navegador?.close();
});

test('pestañas Portada | Cabecera en escritorio y celular', async () => {
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await pagina.setViewportSize(vp);
    await pagina.goto(`${BASE}/admin/portada`);
    const nav = pagina.getByRole('navigation', { name: 'Editores de la tienda' });
    assert.equal(await nav.getByRole('link', { name: 'Portada' }).getAttribute('aria-current'), 'page');
    await nav.getByRole('link', { name: 'Cabecera' }).click();
    await pagina.waitForURL(/\/admin\/cabecera/);
    assert.equal(await pagina.getByRole('navigation', { name: 'Editores de la tienda' }).getByRole('link', { name: 'Cabecera' }).getAttribute('aria-current'), 'page');
    await pagina.locator('[data-secciones] > li').first().waitFor();
  }
  await pagina.setViewportSize({ width: 1440, height: 900 });
  // Menú lateral: una sola entrada «Editar página», activa en las dos rutas.
  const lateral = pagina.locator('aside nav');
  assert.equal(await lateral.getByRole('link', { name: 'Cabecera', exact: true }).count(), 0);
  assert.equal(await lateral.getByRole('link', { name: 'Editar página' }).getAttribute('aria-current'), 'page');
  assert.equal(await pagina.locator('h1').first().innerText(), 'Editar página');
  assert.deepEqual(pagina.errores, []);
});

test('portada y cabecera: sin flechas de subir/bajar, solo asa', async () => {
  await pagina.goto(`${BASE}/admin/portada`);
  await pagina.locator('[data-secciones] > li').first().waitFor();
  assert.equal(await pagina.locator('[data-subir], [data-bajar], [data-subir-chip]').count(), 0);
  assert.ok((await pagina.locator('[data-secciones] [data-asa]').count()) > 1);
  await pagina.goto(`${BASE}/admin/cabecera`);
  await pagina.locator('[data-secciones] > li').first().waitFor();
  assert.equal(await pagina.locator('[data-subir], [data-bajar]').count(), 0);
});

test('producto: tocar el color abre el selector y tocar la foto abre el recorte', async () => {
  const lista = await (await pagina.request.get(`${BASE}/api/admin/productos`)).json();
  let id;
  for (const p of lista) {
    if (String(p.nombre).startsWith('E2E')) continue; // las de otras pruebas en curso
    const d = await (await pagina.request.get(`${BASE}/api/admin/productos/${p.id}`)).json();
    if (d.imagenes?.length) { id = p.id; break; }
  }
  assert.ok(id, 'hay un producto con fotos en staging');
  await pagina.goto(`${BASE}/admin/productos/${id}`);
  const fig = pagina.locator('[data-fotos] figure').first();
  await fig.scrollIntoViewIfNeeded();
  assert.equal(await fig.locator('summary svg.lucide-pencil, summary [class*=pencil]').count(), 0, 'sin lápiz');
  const nombre = fig.locator('figcaption details').first().locator('summary');
  await nombre.click();
  await fig.locator('select[name=colorId]').first().waitFor({ state: 'attached' });
  assert.ok(await fig.locator('figcaption details').first().evaluate((d) => d.open), 'el nombre abre el selector');
  await nombre.click();
  // Hover indica «Reencuadrar»; el clic abre el recorte y «Recortar» guarda con una clave nueva.
  const zona = fig.locator('[data-recortar]');
  await zona.hover();
  assert.equal(await fig.getByText('Reencuadrar', { exact: true }).isVisible(), true);
  const antes = await zona.getAttribute('data-clave');
  await zona.click();
  await pagina.locator('dialog[open] [data-aceptar]').waitFor({ timeout: 10000 });
  await pagina.waitForTimeout(800);
  await pagina.locator('dialog[open] [data-aceptar]').click();
  await pagina.waitForURL(/\?ok/);
  const despues = await pagina.locator('[data-fotos] figure').first().locator('[data-recortar]').getAttribute('data-clave');
  assert.notEqual(despues, antes, 'la foto tiene archivos nuevos');
  assert.equal((await pagina.request.get(`${BASE}/api/imagenes/${despues}/mediano.webp`)).status(), 200);
  assert.deepEqual(pagina.errores, []);
});

test('producto: categoría en dos pasos y borrar variante con confirmación', async () => {
  // Producto nuevo de prueba por API (se borra al final).
  const cats = await (await pagina.request.get(`${BASE}/api/admin/categorias`)).json();
  const padre = cats.find((c) => !c.padreId && cats.some((h) => h.padreId === c.id));
  assert.ok(padre, 'hay una categoría con subcategorías en staging');
  const hija = cats.find((h) => h.padreId === padre.id);
  const r = await pagina.request.post(`${BASE}/api/admin/productos`, { data: { nombre: 'E2E variantes', categoriaId: padre.id, precioCentavos: 10000 }, headers: { origin: BASE } });
  assert.equal(r.status() < 300, true, await r.text());
  const prod = await r.json();
  try {
    await pagina.goto(`${BASE}/admin/productos/${prod.id}`);
    const caja = pagina.locator('[data-categoria]');
    assert.equal(await caja.locator('select[name=categoriaPadre]').inputValue(), String(padre.id));
    const hijaSel = caja.locator('select[name=categoriaHija]');
    assert.equal(await hijaSel.isVisible(), true, 'se ofrecen las subcategorías de la principal');
    await hijaSel.selectOption(String(hija.id));
    assert.equal(await caja.locator('input[name=categoriaId]').inputValue(), String(hija.id));
    await hijaSel.selectOption('');
    assert.equal(await caja.locator('input[name=categoriaId]').inputValue(), String(padre.id), 'sin subcategoría vale la principal');
    // Variante: borrar pide confirmación; cancelar no borra, confirmar sí.
    await pagina.locator('form:has(input[name=accion][value=variante])').locator('button:has-text("Agregar")').click();
    await pagina.waitForURL(/\?ok/);
    const borrar = pagina.locator('form[data-confirmar-variante] button').first();
    await borrar.click();
    await pagina.locator('dialog[open] button.btn-secundario').click();
    assert.equal(await pagina.locator('form[data-confirmar-variante]').count(), 1, 'cancelar no borra');
    await borrar.click();
    await pagina.locator('dialog[open] button.btn-primario').click();
    await pagina.waitForURL(/\?ok/);
    assert.equal(await pagina.locator('form[data-confirmar-variante]').count(), 0, 'confirmar borra');
    assert.deepEqual(pagina.errores, []);
  } finally {
    await pagina.request.delete(`${BASE}/api/admin/productos/${prod.id}`, { headers: { origin: BASE } }).catch(() => {});
  }
});
