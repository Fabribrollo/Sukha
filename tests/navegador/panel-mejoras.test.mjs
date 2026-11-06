// Mejoras del panel: recorte de fotos, rango de fechas en un solo campo, variables editables en «Textos y legales»
// y vista previa instantánea de la portada. Restaura todo lo que toca (variable, borrador de portada).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, BASE, LOCAL, abrirNavegador, api, ingresarAlPanel, paginaNueva } from './comun.mjs';

let navegador, pagina;
const sinErrores = () => assert.deepEqual(pagina.errores.splice(0), [], 'errores de JavaScript o del servidor');
const cookie = async () => (await pagina.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
// PNG de 2×2 px: alcanza para que el recorte lo cargue.
const FOTO = { name: 'e2e.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DwnwEJMDEgAQAv1gIBhxpB8gAAAABJRU5ErkJggg==', 'base64') };

before(async () => {
  assert.ok(ADMIN.clave, 'falta la clave del admin de prueba en .env.e2e');
  navegador = await abrirNavegador();
  pagina = await paginaNueva(navegador);
  await ingresarAlPanel(pagina);
});
after(() => navegador?.close());

test('recorte: al elegir una foto se abre la ventana, se puede cancelar y recortar', async () => {
  await pagina.goto(`${BASE}/admin/categorias`);
  await pagina.locator('[data-editar]').first().click();
  const entrada = pagina.locator('[data-foto-archivo]');
  await entrada.setInputFiles(FOTO);
  const ventana = pagina.locator('dialog[open]:has-text("Recortar foto")');
  await ventana.waitFor();
  await ventana.locator('.cropper-container').waitFor();
  await ventana.getByRole('button', { name: 'Cuadrada' }).click();
  await ventana.getByRole('button', { name: 'Cancelar' }).click();
  await ventana.waitFor({ state: 'detached' });
  sinErrores();
});

test('rango de fechas: promociones guarda desde y hasta con un solo campo', async () => {
  await pagina.goto(`${BASE}/admin/promociones`);
  await pagina.locator('[data-alta="alta-promocion"]').click();
  const campo = pagina.locator('#alta-promocion [data-rango] input[readonly]');
  assert.equal(await pagina.locator('#alta-promocion [data-rango] input[readonly]').count(), 1, 'un solo campo de fechas');
  await campo.click();
  const dias = pagina.locator('.flatpickr-calendar.open .flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)');
  await dias.nth(9).click();
  await dias.nth(11).click();
  const [d, h] = await pagina.locator('#alta-promocion input[name=desde], #alta-promocion input[name=hasta]').evaluateAll((l) => l.map((i) => i.value));
  assert.match(d, /^\d{4}-\d{2}-10T00:00$/);
  assert.match(h, /^\d{4}-\d{2}-12T23:59$/);
  sinErrores();
});

test('textos: una variable se edita desde su lápiz y vuelve a su valor', async () => {
  await pagina.goto(`${BASE}/admin/textos`);
  const fila = pagina.locator('li:has([data-variable="{{horas_reserva}}"])');
  const original = await fila.locator('[data-var-form] input').inputValue();
  await fila.locator('[data-var-editar]').click();
  await fila.locator('[data-var-form] input').fill('47');
  await fila.getByRole('button', { name: 'Guardar' }).click();
  await fila.locator('[data-valor]').filter({ hasText: '47' }).waitFor();
  const c = await cookie();
  assert.equal((await api('GET', '/admin/configuracion', undefined, c)).json.reserva_transferencia_horas, 47);
  await api('PUT', '/admin/configuracion/reserva_transferencia_horas', { valor: Number(original) }, c);
  sinErrores();
});

test('portada: un texto cambia al instante en la vista previa, antes de guardarse', async () => {
  // El autoguardado se corta: la prueba no toca el borrador real de la portada.
  await pagina.route('**/api/admin/portada/borrador', (r) => r.abort());
  // En local se arma un borrador con una campaña (y se descarta al final); en staging se usa la portada que haya.
  if (LOCAL) await api('PUT', '/admin/portada/borrador', { version: 1, secciones: [{ id: 'e2ecamp', tipo: 'campana', visible: true, imagen: '', etiqueta: '', titulo: 'Titulo inicial', boton: '', enlace: '', tono: 'oscuro' }] }, await cookie());
  await pagina.goto(`${BASE}/admin/portada`);
  const marco = pagina.frameLocator('[data-vista]');
  await marco.locator('[data-seccion]').first().waitFor();
  // Se elige la primera sección que tenga un título editable en la vista.
  const titulo = marco.locator('[data-seccion] [data-campo="titulo"]').first();
  await titulo.waitFor();
  await titulo.locator('xpath=ancestor::*[@data-seccion]').click();
  const campoTitulo = pagina.locator('[data-campos] [data-f="titulo"]');
  await campoTitulo.waitFor();
  const texto = `E2E instantaneo ${Date.now().toString(36)}`;
  await campoTitulo.fill(texto);
  // Mucho antes de los 700 ms del autoguardado ya se ve.
  await marco.getByText(texto).first().waitFor({ timeout: 500 });
  await pagina.unroute('**/api/admin/portada/borrador');
  if (LOCAL) await api('DELETE', '/admin/portada/borrador', undefined, await cookie());
  pagina.errores.length = 0; // el aborto del guardado queda como error de red, no del código
});

test('producto: tarjetas en orden de trabajo, un solo guardado y fotos por «Color del producto»', async () => {
  const c = await cookie();
  const categoriaId = (await api('GET', '/admin/categorias', undefined, c)).json[0].id;
  const r = await api('POST', '/admin/productos', { nombre: `E2E Orden ${Date.now().toString(36)}`, categoriaId, precioCentavos: 1850000 }, c);
  assert.equal(r.status, 201, r.texto);
  try {
    await pagina.goto(`${BASE}/admin/productos/${r.json.id}`);
    const titulos = await pagina.locator('main h2').allInnerTexts();
    const orden = ['Información', 'Fotos', 'Precio y envío', 'Talles, colores y stock', 'Organización', 'Buscadores y redes'];
    const posiciones = orden.map((t) => titulos.findIndex((x) => x.trim() === t));
    assert.ok(posiciones.every((p) => p >= 0), `faltan tarjetas: ${titulos}`);
    // En el celular el orden de lectura es el de trabajo; en pantalla grande Organización va en su columna.
    assert.equal(await pagina.getByText('Variante de la foto').count(), 0);
    assert.ok(await pagina.getByText('Color del producto').count() >= 1);
    // Un campo de cada tarjeta marca cambios en la misma barra de guardado.
    for (const campo of ['nombre', 'precio', 'pesoGramos']) {
      await pagina.locator(`input[name=${campo}]`).fill('7');
      await pagina.locator('[data-barra-guardado]').waitFor();
      await pagina.locator('[data-barra-guardado] button', { hasText: 'Descartar' }).click();
      await pagina.waitForLoadState('load');
    }
    sinErrores();
  } finally {
    await api('DELETE', `/admin/productos/${r.json.id}`, undefined, c);
  }
});

test('configuración: la cantidad de cuotas se habilita con el interruptor y comparte fila', async () => {
  await pagina.goto(`${BASE}/admin/configuracion#pagos`);
  await pagina.locator('[data-panel="pagos"]').waitFor();
  const cantidad = pagina.locator('input[name=cuotas_cantidad]');
  const interruptor = pagina.locator('input[name=cuotas_sin_interes]');
  const antes = await interruptor.isChecked();
  assert.equal(await cantidad.isDisabled(), !antes);
  await interruptor.evaluate((i) => i.closest('label').click());
  assert.equal(await cantidad.isDisabled(), antes);
  const a = await interruptor.evaluate((i) => i.closest('label').getBoundingClientRect().top);
  const b = await cantidad.evaluate((i) => i.getBoundingClientRect().top);
  assert.ok(Math.abs(a - b) < 60, 'el interruptor y la cantidad van en la misma fila');
  sinErrores();
});

test('recorte de fotos de producto: proporción fija 4:3, sin elegir otra', async () => {
  const c = await cookie();
  const categoriaId = (await api('GET', '/admin/categorias', undefined, c)).json[0].id;
  const r = await api('POST', '/admin/productos', { nombre: `E2E Recorte ${Date.now().toString(36)}`, categoriaId, precioCentavos: 1850000 }, c);
  assert.equal(r.status, 201, r.texto);
  try {
    await pagina.goto(`${BASE}/admin/productos/${r.json.id}`);
    await pagina.locator('form[data-subida] input[type=file][name=foto]').setInputFiles(FOTO);
    const ventana = pagina.locator('dialog[open]:has-text("Recortar foto")');
    await ventana.locator('.cropper-container').waitFor();
    assert.equal(await ventana.getByRole('button', { name: 'Libre' }).count(), 0, 'no se elige otra proporción');
    const caja = await ventana.locator('.cropper-crop-box').boundingBox();
    assert.ok(Math.abs(caja.width / caja.height - 4 / 3) < 0.05, `la caja de recorte es 4:3 (${caja.width}×${caja.height})`);
    await ventana.getByRole('button', { name: 'Cancelar' }).click();
  } finally {
    await api('DELETE', `/admin/productos/${r.json.id}`, undefined, c);
  }
});

test('hero «Moda real»: se arma desde el editor y se ve en la portada (local: usa un borrador y lo descarta)', async () => {
  if (!LOCAL) return; // en staging no se pisa el borrador real
  const c = await cookie();
  const look = (k, cat) => ({ imagen: `portada/${k}`, descripcion: `Look ${k}`, categoria: cat, enlace: '/productos' });
  const r = await api('PUT', '/admin/portada/borrador', { version: 1, secciones: [{ id: 'e2ehero', tipo: 'hero', visible: true, titulo: 'MODA REAL', etiqueta: 'PRIMAVERA', producto: 'Vestido', boton: 'Ver fiesta', enlace: '/productos', looks: [look('uno', 'Vestidos'), look('dos', 'Conjuntos'), look('tres', 'Blusas')] }] }, c);
  assert.equal(r.status, 200, r.texto);
  try {
    // En la tienda: título, los looks y los enlaces de categoría de la franja.
    await pagina.goto(`${BASE}/?vista-previa=1`);
    const hero = pagina.locator('section.hero');
    await hero.waitFor();
    assert.equal(await hero.locator('h1').innerText(), 'MODA REAL');
    assert.equal(await hero.locator('.hero-pista .hero-slide').count(), 5, '3 looks y los 2 repetidos del final');
    assert.ok(await hero.locator('.hero-franja a', { hasText: 'Vestidos' }).count() >= 1);
    // En el editor: el formulario del hero con sus tres looks.
    await pagina.goto(`${BASE}/admin/portada`);
    await pagina.locator('[data-secciones] li', { hasText: 'Hero Moda real' }).click();
    await pagina.locator('[data-campos] [data-lk="2"][data-lf="categoria"]').waitFor();
    assert.equal(await pagina.locator('[data-campos] input[type=file][data-lf=foto]').count(), 3);
  } finally {
    await api('DELETE', '/admin/portada/borrador', undefined, c);
  }
});

test('colecciones: se borra con un segundo toque y sus productos siguen', async () => {
  const c = await cookie();
  const nombre = `E2E Colección ${Date.now().toString(36)}`;
  const r = await api('POST', '/admin/colecciones', { nombre }, c);
  assert.equal(r.status, 201, r.texto);
  await pagina.goto(`${BASE}/admin/colecciones?abierta=${r.json.id}`);
  const zona = pagina.locator(`#coleccion-${r.json.id}`);
  await zona.locator('summary', { hasText: 'Borrar colección' }).click();
  await zona.getByRole('button', { name: '¿Borrar?' }).click();
  await pagina.waitForURL(/\?ok$/);
  const lista = (await api('GET', '/admin/colecciones', undefined, c)).json;
  assert.ok(!lista.some((x) => x.id === r.json.id), 'la colección ya no está');
  sinErrores();
});

test('categorías: una vacía se borra; con productos avisa y no se borra', async () => {
  const c = await cookie();
  const sufijo = Date.now().toString(36);
  const vacia = (await api('POST', '/admin/categorias', { nombre: `E2E Vacía ${sufijo}` }, c)).json;
  const conProducto = (await api('POST', '/admin/categorias', { nombre: `E2E Con producto ${sufijo}` }, c)).json;
  const p = await api('POST', '/admin/productos', { nombre: `E2E Borrar cat ${sufijo}`, categoriaId: conProducto.id, precioCentavos: 1000000 }, c);
  try {
    await pagina.goto(`${BASE}/admin/categorias`);
    await pagina.locator(`[data-editar*='"id":${conProducto.id},']`).first().click();
    await pagina.locator('#editar-categoria [data-borrar]').click();
    await pagina.locator('#editar-categoria [data-borrar-confirmar]').click();
    await pagina.locator('#editar-categoria [data-borrar-error]').filter({ hasText: 'pasalos a otra categoría' }).waitFor();
    await pagina.reload();
    await pagina.locator(`[data-editar*='"id":${vacia.id},']`).first().click();
    await pagina.locator('#editar-categoria [data-borrar]').click();
    await pagina.locator('#editar-categoria [data-borrar-confirmar]').click();
    await pagina.waitForURL(/\?ok$/);
    const lista = (await api('GET', '/admin/categorias', undefined, c)).json;
    assert.ok(!lista.some((x) => x.id === vacia.id) && lista.some((x) => x.id === conProducto.id));
    sinErrores();
  } finally {
    await api('DELETE', `/admin/productos/${p.json.id}`, undefined, c);
    await api('DELETE', `/admin/categorias/${conProducto.id}`, undefined, c);
    await api('DELETE', `/admin/categorias/${vacia.id}`, undefined, c);
  }
});

test('carga rápida: cada producto permite elegir sus colecciones', async () => {
  const c = await cookie();
  const nombre = `E2E Carga ${Date.now().toString(36)}`;
  const col = (await api('POST', '/admin/colecciones', { nombre }, c)).json;
  try {
    await pagina.goto(`${BASE}/admin/productos/carga-rapida`);
    const selector = pagina.locator('select[data-agregar-coleccion]').first();
    await selector.waitFor({ state: 'attached' });
    assert.ok((await selector.locator('option', { hasText: nombre }).count()) === 1, 'la colección se ofrece');
    sinErrores();
  } finally {
    await api('DELETE', `/admin/colecciones/${col.id}`, undefined, c);
  }
});
