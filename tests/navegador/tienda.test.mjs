// La tienda como una clienta, en un navegador real: portada, categorías, filtros, ficha, carrito, checkout con envío y
// retiro, código postal inválido, transferencia, Mercado Pago hasta la preferencia, seguimiento y carrito recuperado.
// Crea pedidos con el email e2e-navegador@sukha.test y al final los cancela y los borra (hace falta el admin de prueba).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { BASE, EMAIL_CLIENTA, LOCAL, abrirNavegador, api, borrarPedidosDePrueba, cancelarPedidosDePrueba, cookieAdmin, hidratada, paginaNueva, sinEmailsDePrueba, sql } from './comun.mjs';

let navegador, pagina, admin, tienda, producto, variante;
const sinErrores = () => assert.deepEqual(pagina.errores.splice(0), [], 'errores de JavaScript o del servidor');
// Vacía el carrito y los datos del checkout de la compra anterior (si no, el email ya viene escrito).
const limpiarCarrito = async () => {
  await pagina.waitForLoadState();
  // Después de cortar la salida a Mercado Pago la pestaña queda en la página de error del navegador, sin localStorage.
  if (!pagina.url().startsWith(BASE)) await pagina.goto(`${BASE}/`);
  await pagina.evaluate(() => {
    localStorage.removeItem('sukha:carrito');
    sessionStorage.clear();
  });
};
// Solo lo que se ve: el carrito lateral cerrado también tiene los nombres de las prendas.
const visible = (texto) => pagina.getByText(texto).filter({ visible: true }).first();
// Opción de envío por correo (no el retiro, que aparece primero mientras se cotiza).
const opcionDeEnvio = () => pagina.locator('label:has(input[name=envio])', { hasText: /a domicilio|a sucursal/i }).first();
// Abre la ficha de la prenda de prueba y espera a que responda.
const abrirFicha = async () => {
  await pagina.goto(`${BASE}/producto/${producto.slug}?variante=${variante.id}`);
  await hidratada(pagina);
};

before(async () => {
  admin = await cookieAdmin();
  tienda = (await api('GET', '/tienda')).json;
  // Una prenda publicada con stock (la más barata, para no tocar las demás).
  const lista = (await api('GET', '/catalogo/productos?orden=precio_asc&limite=24')).json;
  for (const p of lista.productos.filter((p) => p.disponible)) {
    const ficha = (await api('GET', `/catalogo/productos/${p.slug}`)).json;
    // Una variante con talle y color se puede elegir en la ficha; la «sin talle ni color» queda fuera si el producto tiene otras.
    variante = ficha.variantes.find((v) => v.stock > 0 && (v.talle || v.color)) ?? ficha.variantes.find((v) => v.stock > 0);
    if (variante) {
      producto = ficha;
      break;
    }
  }
  assert.ok(variante, 'hace falta al menos un producto publicado con stock');
  navegador = await abrirNavegador();
  pagina = await paginaNueva(navegador);
});

after(async () => {
  if (admin) {
    await cancelarPedidosDePrueba(admin);
    borrarPedidosDePrueba();
  } else console.warn(`Sin admin de prueba: quedaron pedidos de ${EMAIL_CLIENTA} para cancelar a mano.`);
  await navegador?.close();
});

test('portada: carga con cabecera, menú y pie, sin errores', async () => {
  const r = await pagina.goto(`${BASE}/`);
  assert.equal(r.status(), 200);
  await pagina.getByRole('link', { name: 'Sukhä, ir al inicio' }).first().waitFor();
  assert.ok(await pagina.locator('footer').count());
  sinErrores();
});

test('páginas fijas cargan sin errores', async () => {
  for (const ruta of ['/productos', '/ofertas', '/buscar?q=a', '/quienes-somos', '/preguntas-frecuentes', '/cambios-y-devoluciones', '/contacto', '/pedido/buscar', '/arrepentimiento']) {
    const r = await pagina.goto(`${BASE}${ruta}`);
    assert.equal(r.status(), 200, ruta);
  }
  assert.equal((await pagina.goto(`${BASE}/producto/no-existe-e2e`)).status(), 404);
  sinErrores();
});

test('categoría: se entra desde el menú y lista sus productos', async () => {
  await pagina.goto(`${BASE}/`);
  const enlace = pagina.locator('header a[href^="/categoria/"]').first();
  const destino = await enlace.getAttribute('href');
  await enlace.click();
  await pagina.waitForURL(`${BASE}${destino}`);
  await pagina.locator('h1').first().waitFor();
  sinErrores();
});

test('filtros: talle aplicado desde el formulario', async () => {
  await pagina.goto(`${BASE}/productos`);
  const talle = pagina.locator('#filtros-form input[name=talle]').first();
  if (!(await talle.count())) return; // sin talles con stock no hay filtro que probar
  const id = await talle.getAttribute('value');
  // En escritorio los grupos de filtros son botones que abren su panel; en el celular el panel lateral ya los muestra abiertos.
  if (!(await talle.isVisible())) await pagina.locator('#filtros-form summary', { hasText: 'Talle' }).click();
  await talle.locator('xpath=..').click();
  // En escritorio el filtro se aplica solo (el botón «Aplicar filtros» queda para el celular).
  const aplicar = pagina.locator('[data-aplicar]');
  if (await aplicar.isVisible()) await aplicar.click();
  await pagina.waitForURL(new RegExp(`talle=${id}`));
  const esperado = (await api('GET', `/catalogo/productos?talle=${id}`)).json.total;
  assert.ok(esperado > 0, 'un talle ofrecido en los filtros debería tener productos');
  await pagina.locator('section[aria-label=Productos] a[href^="/producto/"]').first().waitFor();
  sinErrores();
});

test('ficha: datos del producto y cotizador de envío con código postal inválido y válido', async () => {
  await abrirFicha();
  await pagina.getByRole('heading', { level: 1, name: producto.nombre }).waitFor();
  assert.match(await pagina.content(), /"@type":"Product"/);
  // El cotizador vive en el desplegable «Envío y retiro» de la ficha.
  await pagina.locator('summary', { hasText: 'Envío y retiro' }).click();
  const cp = pagina.getByPlaceholder('Tu código postal');
  await cp.fill('12');
  await pagina.getByRole('button', { name: 'Calcular' }).click();
  await pagina.getByText('4 números').waitFor();
  await cp.fill('5000');
  await pagina.getByRole('button', { name: 'Calcular' }).click();
  await pagina.getByText(/A domicilio|A sucursal|Todavía no enviamos/).first().waitFor();
  sinErrores();
});

// Agrega la prenda y va al checkout desde el carrito lateral.
async function alCheckout() {
  await limpiarCarrito();
  await abrirFicha();
  await pagina.getByRole('button', { name: /Agregar al carrito/i }).click();
  const lateral = pagina.getByRole('dialog', { name: 'Tu carrito' });
  await lateral.getByText(producto.nombre).waitFor();
  await lateral.getByRole('link', { name: 'Iniciar compra' }).click();
  await pagina.waitForURL(`${BASE}/checkout`);
}

test('carrito: agregar, ver la página del carrito y cambiar cantidades', async () => {
  await limpiarCarrito();
  await abrirFicha();
  await pagina.getByRole('button', { name: /Agregar al carrito/i }).click();
  await pagina.getByRole('dialog', { name: 'Tu carrito' }).getByRole('link', { name: 'Ver carrito' }).click();
  await pagina.waitForURL(`${BASE}/carrito`);
  await visible(producto.nombre).waitFor();
  if (variante.stock > 1) {
    await pagina.getByRole('button', { name: 'Una más' }).filter({ visible: true }).first().click();
    await pagina.getByRole('group', { name: `Cantidad de ${producto.nombre}` }).getByText('2').waitFor();
  }
  await pagina.getByRole('button', { name: `Quitar ${producto.nombre}` }).filter({ visible: true }).first().click();
  await visible(/carrito está vacío/i).waitFor();
  sinErrores();
});

// Datos de la clienta de prueba, completos hasta el paso de pago.
async function contacto() {
  await pagina.getByRole('button', { name: 'Continuar' }).click();
  assert.equal(await pagina.locator('#email').getAttribute('aria-invalid'), 'true', 'el email vacío marca error');
  const aviso = pagina.waitForResponse((r) => r.url().endsWith('/api/carritos') && r.request().method() === 'POST');
  await pagina.locator('#email').fill(EMAIL_CLIENTA);
  // El paso 1 («Tus datos») pide también nombre y teléfono.
  await pagina.locator('#nombre').fill('Prueba Navegador');
  await pagina.locator('#telefono').fill('351 555-0000');
  await pagina.getByRole('button', { name: 'Continuar' }).click();
  assert.ok((await aviso).ok(), 'el checkout guarda el carrito abandonado al pasar el email');
}
async function datosPersonales() {
  await pagina.locator('#dni').fill('30111222');
}
// Dirección en Córdoba capital; la localidad hay que elegirla de las sugerencias (si el servicio de localidades falla,
// el checkout deja seguir con lo escrito).
async function direccion() {
  await pagina.locator('#provincia').selectOption('Córdoba');
  await pagina.locator('#localidad').fill('Córdoba');
  // Las sugerencias de localidad (no las <option> del select de provincia).
  const sugerencia = pagina.locator('#localidad-lista [role=option]').first();
  await sugerencia.waitFor({ timeout: 8000 }).catch(() => {});
  if (await sugerencia.count()) await sugerencia.dispatchEvent('mousedown');
  await pagina.locator('#calle').fill('San Martín');
  await pagina.locator('#altura').fill('123');
  await pagina.locator('#altura').press('Tab');
}
async function finalizar(metodo) {
  await pagina.getByRole('radio', { name: metodo }).check();
  await pagina.getByRole('button', { name: /Finalizar compra/ }).click();
  assert.equal(await pagina.locator('#acepta').getAttribute('aria-invalid'), 'true', 'sin aceptar los términos no sigue');
  await pagina.locator('#acepta').check();
  const creado = pagina.waitForResponse((r) => r.url().endsWith('/api/pedidos') && r.request().method() === 'POST');
  await pagina.getByRole('button', { name: /Finalizar compra/ }).click();
  await creado;
  sinEmailsDePrueba();
}
// Cancela los pedidos de prueba (devuelve la prenda y libera el tope de pedidos sin pagar) sin que salga ningún email.
async function cancelar() {
  if (!admin) return;
  await cancelarPedidosDePrueba(admin);
  sinEmailsDePrueba();
}

test('checkout con envío a domicilio, código postal inválido y pago por transferencia', async () => {
  await alCheckout();
  await contacto();
  const cp = pagina.locator('#codigoPostal');
  await cp.fill('12');
  await pagina.getByRole('button', { name: 'Continuar' }).click();
  assert.equal(await cp.getAttribute('aria-invalid'), 'true', 'un código postal de 2 dígitos marca error');
  await cp.fill('5000');
  await opcionDeEnvio()
    .waitFor({ timeout: 10000 })
    .catch(() => assert.fail('el 5000 (Córdoba) debería tener envío'));
  const domicilio = pagina.locator('label:has(input[name=envio])', { hasText: /a domicilio/i }).first();
  if (!(await domicilio.count())) return; // solo sucursal: no se completa la dirección
  await domicilio.locator('input').check();
  await datosPersonales();
  await direccion();
  await pagina.getByRole('button', { name: 'Continuar' }).click();
  await pagina.getByRole('radio', { name: /Transferencia/ }).waitFor();
  await finalizar(/Transferencia/);
  await pagina.waitForURL(/\/pedido\/[0-9a-f]{64}$/);
  await pagina.getByText('Datos para transferir').waitFor();
  assert.equal(await pagina.locator('meta[name=robots]').getAttribute('content'), 'noindex');
  sinErrores();
});

test('seguimiento: buscar el pedido por número y email', async () => {
  const pedido = (await api('GET', `/admin/pedidos?q=${EMAIL_CLIENTA}`, undefined, admin)).json?.[0];
  if (!pedido) return; // sin admin no se sabe el número
  await pagina.goto(`${BASE}/pedido/buscar`);
  await pagina.locator('#numero').fill(pedido.numero);
  await pagina.locator('#email-pedido').fill('otra@sukha.test');
  await pagina.getByRole('button', { name: 'Buscar mi pedido' }).click();
  await pagina.getByRole('alert').waitFor();
  await pagina.locator('#email-pedido').fill(EMAIL_CLIENTA.toUpperCase());
  await pagina.getByRole('button', { name: 'Buscar mi pedido' }).click();
  await pagina.waitForURL(/\/pedido\/[0-9a-f]{64}$/);
  await pagina.getByText(pedido.numero).first().waitFor();
  sinErrores();
});

test('checkout con retiro en persona', async (t) => {
  if (!tienda.retiro) return t.skip('la tienda no tiene retiro configurado');
  await cancelar();
  await alCheckout();
  await contacto();
  await pagina.locator('#codigoPostal').fill('5000');
  await pagina.getByRole('radio', { name: /Retiro en persona/ }).check();
  await datosPersonales();
  assert.equal(await pagina.locator('#calle').count(), 0, 'el retiro no pide dirección');
  await pagina.getByRole('button', { name: 'Continuar' }).click();
  await finalizar(/Transferencia/);
  await pagina.waitForURL(/\/pedido\/[0-9a-f]{64}$/);
  sinErrores();
});

test('Mercado Pago: el pedido se crea y lleva a pagar (sin pagar)', async (t) => {
  await cancelar();
  await alCheckout();
  await contacto();
  await pagina.locator('#codigoPostal').fill('5000');
  await opcionDeEnvio().locator('input').check();
  await datosPersonales();
  const sucursal = pagina.locator('#sucursal');
  if (await sucursal.count()) await sucursal.fill('Sucursal Centro');
  else await direccion();
  await pagina.getByRole('button', { name: 'Continuar' }).click();
  // La respuesta se copia al pasar: la página navega enseguida y el navegador ya no la guarda.
  let cuerpo;
  await pagina.route(/\/api\/pedidos$/, async (ruta) => {
    if (ruta.request().method() !== 'POST') return ruta.continue();
    const respuesta = await ruta.fetch();
    cuerpo = await respuesta.json();
    return ruta.fulfill({ response: respuesta, json: cuerpo });
  });
  await finalizar(/Mercado Pago/);
  await pagina.unroute(/\/api\/pedidos$/);
  assert.ok(cuerpo?.token, JSON.stringify(cuerpo));
  if (cuerpo.urlPago) {
    // Con credenciales: la tienda manda a Mercado Pago (la prueba corta la salida, no se paga nada).
    await pagina.waitForTimeout(1500);
    assert.match(pagina.salidaExterna ?? '', /mercadopago|mercadolibre/);
    t.diagnostic(`preferencia creada: ${new URL(cuerpo.urlPago).host}`);
  } else {
    // Sin credenciales (local): queda en el seguimiento, pendiente de pago.
    await pagina.waitForURL(/\/pedido\/[0-9a-f]{64}$/);
    t.diagnostic('sin credenciales de Mercado Pago: no se crea preferencia');
  }
  pagina.errores.splice(0); // el corte de la salida a Mercado Pago no es un error de la tienda
});

test('carrito abandonado: el link de recuperación vuelve a armar el carrito', async (t) => {
  let codigo;
  try {
    codigo = sql(`SELECT codigo FROM carrito_abandonado WHERE email = '${EMAIL_CLIENTA}'`)[0]?.codigo;
  } catch (e) {
    return t.skip(`sin acceso a la base: ${e.message.slice(0, 80)}`);
  }
  assert.ok(codigo, 'el checkout debería haber guardado el carrito');
  // El pedido marcó el carrito como recuperado, pero el link sigue sirviendo mientras la prenda tenga stock.
  await cancelar();
  await limpiarCarrito();
  await pagina.goto(`${BASE}/recuperar/${codigo}`);
  await pagina.waitForURL(/\/(checkout|carrito)$/);
  await visible(producto.nombre).waitFor();
  await pagina.goto(`${BASE}/recuperar/no-existe-e2e`);
  await pagina.getByText('Este link ya no está disponible').waitFor();
  sinErrores();
});

test('local: el carrito abandonado aparece en el panel después de una hora', { skip: !LOCAL || undefined }, async () => {
  sql(`UPDATE carrito_abandonado SET actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours'), estado = 'sin_contactar' WHERE email = '${EMAIL_CLIENTA}'`);
  const lista = (await api('GET', '/admin/carritos', undefined, admin)).json;
  assert.ok(lista.some((c) => c.email === EMAIL_CLIENTA));
});
