// Prueba de punta a punta contra el backend local: carga un catálogo mínimo, compra, paga, vence y reembolsa.
// Necesita `wrangler dev --test-scheduled` corriendo, la base local migrada y un admin local:
//   E2E_EMAIL=... E2E_CLAVE=... node scripts/e2e.ts
// Ensucia la base local con datos de prueba (cada corrida usa nombres nuevos).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const BASE = process.env.E2E_BASE ?? 'http://localhost:8787';
const sufijo = Date.now().toString(36);
let cookie = '';

async function api(metodo: string, ruta: string, cuerpo?: unknown, extra: Record<string, string> = {}) {
  const esForm = cuerpo instanceof FormData;
  const r = await fetch(`${BASE}/api${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo && !esForm ? { 'content-type': 'application/json' } : {}),
      cookie,
      // En local esta cabecera la pone quien llama: una IP distinta por llamada evita los límites por minuto.
      'cf-connecting-ip': `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
      ...extra,
    },
    body: esForm ? cuerpo : cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let json: any = null;
  try {
    json = JSON.parse(texto);
  } catch {}
  return { status: r.status, json, texto, headers: r.headers };
}
const ok = async (metodo: string, ruta: string, cuerpo?: unknown) => {
  const r = await api(metodo, ruta, cuerpo);
  assert.ok(r.status < 300, `${metodo} ${ruta} → ${r.status} ${r.texto}`);
  return r.json;
};
const paso = (texto: string) => console.log(`✓ ${texto}`);

// ───────────── Panel: sesión ─────────────
assert.equal((await api('GET', '/admin/productos')).status, 401);
const login = await api('POST', '/admin/login', { email: process.env.E2E_EMAIL, contrasena: process.env.E2E_CLAVE });
assert.equal(login.status, 200, login.texto);
cookie = login.headers.get('set-cookie')!.split(';')[0];
paso('el panel exige sesión y el login funciona');

// ───────────── Panel: catálogo ─────────────
const { talles, colores } = await ok('GET', '/admin/opciones');
const talleM = talles.find((t: any) => t.nombre === 'M').id;
const negro = colores.find((c: any) => c.nombre === 'Negro').id;

const categoria = await ok('POST', '/admin/categorias', { nombre: `Remeras ${sufijo}`, guiaTalles: { M: { pecho: 50 } } });
const coleccion = await ok('POST', '/admin/colecciones', { nombre: `Verano ${sufijo}` });
assert.equal((await api('POST', '/admin/categorias', { nombre: `Remeras ${sufijo}` })).status, 409);

let producto = await ok('POST', '/admin/productos', {
  categoriaId: categoria.id,
  nombre: `Remera Ñandú ${sufijo}`,
  precioCentavos: 2_000_000,
  precioOfertaCentavos: 1_800_000,
  coleccionIds: [coleccion.id],
});
assert.match(producto.slug, /^remera-nandu-/);
assert.equal((await api('PATCH', `/admin/productos/${producto.id}`, { precioOfertaCentavos: 2_500_000 })).status, 400);
assert.equal((await api('PATCH', `/admin/productos/${producto.id}`, { estado: 'publicado' })).status, 409); // sin variante ni foto

producto = await ok('POST', `/admin/productos/${producto.id}/variantes`, { talleId: talleM, colorId: negro, stock: 3 });
const variante = producto.variantes[0];
assert.equal(variante.stock, 3);
assert.deepEqual([variante.talle, variante.color], ['M', 'Negro']);
assert.equal((await api('POST', `/admin/productos/${producto.id}/variantes`, { talleId: talleM, colorId: negro })).status, 409);
assert.equal((await api('PATCH', `/admin/productos/${producto.id}`, { estado: 'publicado' })).status, 409); // falta la foto

const foto = new FormData();
for (const t of ['chico', 'mediano', 'grande']) foto.set(t, new File([`RIFFxxxxWEBP-${t}`], `${t}.webp`, { type: 'image/webp' }));
foto.set('colorId', String(negro));
foto.set('textoAlternativo', 'Remera negra de frente');
const subida = await api('POST', `/admin/productos/${producto.id}/imagenes`, foto);
assert.equal(subida.status, 201, subida.texto);
const servida = await fetch(`${BASE}/api/imagenes/${subida.json.clave}/mediano.webp`);
assert.equal(await servida.text(), 'RIFFxxxxWEBP-mediano');
const fotoMala = new FormData();
fotoMala.set('chico', new File(['x'], 'a.png', { type: 'image/png' }));
assert.equal((await api('POST', `/admin/productos/${producto.id}/imagenes`, fotoMala)).status, 400);
// Un archivo que dice ser WebP pero no lo es (por ejemplo, HTML con otro nombre) también se rechaza.
const disfrazada = new FormData();
for (const t of ['chico', 'mediano', 'grande']) disfrazada.set(t, new File(['<script>alert(1)</script>'], `${t}.webp`, { type: 'image/webp' }));
assert.equal((await api('POST', `/admin/productos/${producto.id}/imagenes`, disfrazada)).status, 400);
// La foto se sirve con cabeceras seguras, también desde caché y aunque le agreguen parámetros.
for (const sufijoUrl of ['', '', '?x=1']) {
  const r = await fetch(`${BASE}/api/imagenes/${subida.json.clave}/chico.webp${sufijoUrl}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/webp');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  await r.arrayBuffer();
}
// Seguridad del panel: la cookie no la puede leer JavaScript, un cambio desde otro sitio se rechaza y nada se cachea.
const cookieCompleta = login.headers.get('set-cookie')!;
assert.match(cookieCompleta, /^__Host-sesion=[0-9a-f]{64}; /);
for (const atributo of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(cookieCompleta.includes(atributo), atributo);
assert.equal((await api('POST', '/admin/talles', { nombre: 'X' }, { origin: 'https://malo.example' })).status, 403);
assert.equal((await api('GET', '/admin/productos')).headers.get('cache-control'), 'no-store');
assert.equal((await api('POST', '/carrito/validar', { relleno: 'x'.repeat(70_000) })).status, 413);

await ok('PATCH', `/admin/productos/${producto.id}`, { estado: 'publicado', destacado: true });

const banner = new FormData();
banner.set('escritorio', new File(['RIFFxxxxWEBP-banner'], 'b.webp', { type: 'image/webp' }));
banner.set('enlace', `/categoria/${categoria.slug}`);
const bannerCreado = await api('POST', '/admin/banners', banner);
assert.equal(bannerCreado.status, 201, bannerCreado.texto);
banner.set('enlace', 'https://otro-sitio.example');
assert.equal((await api('POST', '/admin/banners', banner)).status, 400); // solo rutas internas
const vencido = new FormData();
vencido.set('escritorio', new File(['RIFFxxxxWEBP-viejo'], 'v.webp', { type: 'image/webp' }));
vencido.set('hasta', '2020-01-01T00:00:00Z');
const bannerVencido = await api('POST', '/admin/banners', vencido);
assert.equal(bannerVencido.status, 201, bannerVencido.texto);
paso('categoría, producto, variante con stock, foto en KV y publicación (con sus reglas)');

await ok('POST', `/admin/variantes/${variante.id}/stock`, { tipo: 'carga', cantidad: 4, nota: 'Reposición' });
await ok('POST', `/admin/variantes/${variante.id}/stock`, { tipo: 'venta_local', cantidad: 2 });
assert.equal((await api('POST', `/admin/variantes/${variante.id}/stock`, { tipo: 'ajuste', cantidad: -99 })).status, 409);
const movimientos = await ok('GET', `/admin/variantes/${variante.id}/movimientos`);
assert.deepEqual(movimientos.map((m: any) => m.cantidad), [-2, 4, 3]);
const stockDe = async () => (await ok('GET', `/admin/productos/${producto.id}`)).variantes[0].stock;
assert.equal(await stockDe(), 5);
paso('stock: carga, venta del local y libro de movimientos; nunca queda negativo');

const duplicado = await ok('POST', `/admin/productos/${producto.id}/duplicar`);
assert.equal(duplicado.estado, 'borrador');
assert.equal(duplicado.variantes[0].stock, 0);

// ───────────── Panel: envíos, cupones, configuración ─────────────
const cp = 1000 + (Date.now() % 8000); // rango propio de esta corrida
const zona = await ok('POST', '/admin/zonas', {
  nombre: `Zona ${sufijo}`,
  transporte: 'andreani',
  modalidad: 'domicilio',
  precioCentavos: 800_000,
  gratisDesdeCentavos: 10_000_000,
});
await ok('POST', `/admin/zonas/${zona.id}/rangos`, { cpDesde: cp, cpHasta: cp });
const otraZona = await ok('POST', '/admin/zonas', { nombre: `Otra ${sufijo}`, transporte: 'andreani', modalidad: 'domicilio', precioCentavos: 1 });
assert.equal((await api('POST', `/admin/zonas/${otraZona.id}/rangos`, { cpDesde: cp - 1, cpHasta: cp + 1 })).status, 409);

const codigo = `HOLA${sufijo}`.toUpperCase();
const cupon = await ok('POST', '/admin/cupones', { codigo, tipo: 'porcentaje', valor: 10, usosMaximos: 1 });
assert.equal((await api('POST', '/admin/cupones', { codigo: 'MAL', tipo: 'porcentaje', valor: 150 })).status, 400);

await ok('PUT', '/admin/configuracion/alias_transferencia', { valor: 'sukha.prueba' });
await ok('PUT', '/admin/configuracion/email_avisos', { valor: 'avisos@sukha.test' });
await ok('PUT', '/admin/configuracion/contenido_home', { valor: { titulo: 'Hola' } });
assert.equal((await api('PUT', '/admin/configuracion/descuento_transferencia_porcentaje', { valor: 500 })).status, 400);
assert.equal((await api('PUT', '/admin/configuracion/cualquiera', { valor: 1 })).status, 400);
paso('zonas sin rangos superpuestos, cupones y configuración validada');

// ───────────── Tienda: catálogo y carrito ─────────────
// Subcategorías: la principal incluye los productos de sus hijas, se ocultan con ella y solo hay un nivel.
const hija = await ok('POST', '/admin/categorias', { nombre: `Hija ${sufijo}`, padreId: categoria.id });
assert.equal(hija.padreId, categoria.id);
const otraHija = await ok('POST', '/admin/categorias', { nombre: `Otra hija ${sufijo}`, padreId: categoria.id });
assert.equal(otraHija.orden, hija.orden + 1); // sin orden explícito, va al final de su grupo
assert.equal((await api('POST', '/admin/categorias', { nombre: `Nieta ${sufijo}`, padreId: hija.id })).status, 400);
assert.equal((await api('PATCH', `/admin/categorias/${categoria.id}`, { padreId: hija.id })).status, 400);
assert.equal((await api('PUT', '/admin/categorias/orden', { ids: [categoria.id, hija.id] })).status, 400); // niveles distintos
await ok('PUT', '/admin/categorias/orden', { ids: [otraHija.id, hija.id] });
const arbol = (await ok('GET', '/catalogo/filtros')).categorias.find((c: any) => c.slug === categoria.slug);
assert.deepEqual(arbol.hijas.map((h: any) => h.slug), [otraHija.slug, hija.slug]);
await ok('PATCH', `/admin/productos/${producto.id}`, { categoriaId: hija.id });
assert.ok((await ok('GET', `/catalogo/productos?categoria=${categoria.slug}`)).productos.some((p: any) => p.slug === producto.slug));
assert.equal((await ok('GET', `/catalogo/productos/${producto.slug}`)).categoriaPadre.slug, categoria.slug);
await ok('PATCH', `/admin/categorias/${categoria.id}`, { activa: false });
assert.ok(!(await ok('GET', '/catalogo/filtros')).categorias.some((c: any) => c.slug === categoria.slug), 'una principal oculta no se lista');
assert.equal((await ok('GET', `/catalogo/productos?categoria=${hija.slug}`)).total, 0, 'sus hijas tampoco');
await ok('PATCH', `/admin/categorias/${categoria.id}`, { activa: true });
await ok('PATCH', `/admin/productos/${producto.id}`, { categoriaId: categoria.id });

// Colecciones: agregar y quitar productos, sin duplicar.
const col = await ok('POST', '/admin/colecciones', { nombre: `Colección ${sufijo}` });
await ok('POST', `/admin/colecciones/${col.id}/productos`, { productoIds: [producto.id] });
await ok('POST', `/admin/colecciones/${col.id}/productos`, { productoIds: [producto.id] }); // repetir no duplica
assert.deepEqual((await ok('GET', '/admin/colecciones')).find((c: any) => c.id === col.id).productoIds, [producto.id]);
assert.equal((await api('POST', `/admin/colecciones/${col.id}/productos`, { productoIds: [producto.id, 999999] })).status, 404); // si falta uno, no se agrega ninguno
await ok('DELETE', `/admin/colecciones/${col.id}/productos/${producto.id}`);
assert.deepEqual((await ok('GET', '/admin/colecciones')).find((c: any) => c.id === col.id).productoIds, []);

// Fotos: el orden se guarda en el orden de la lista y no se aceptan fotos de otro producto.
const fotosProducto = (await ok('GET', `/admin/productos/${producto.id}`)).imagenes.map((i: any) => i.id);
assert.equal((await api('PUT', `/admin/productos/${producto.id}/imagenes/orden`, { ids: [999999] })).status, 404);
await ok('PUT', `/admin/productos/${producto.id}/imagenes/orden`, { ids: [...fotosProducto].reverse() });
assert.deepEqual((await ok('GET', `/admin/productos/${producto.id}`)).imagenes.map((i: any) => i.id), [...fotosProducto].reverse());

cookie = ''; // de acá en más, como una clienta
const lista = await ok('GET', `/catalogo/productos?categoria=${categoria.slug}&talle=${talleM}`);
assert.equal(lista.total, 1);
assert.equal(lista.productos[0].disponible, 1);
assert.equal(lista.productos[0].slug, producto.slug);
assert.equal(lista.productos[0].categoria, categoria.slug);
assert.equal(lista.productos[0].foto, subida.json.clave);
assert.equal((await ok('GET', `/catalogo/productos?categoria=${categoria.slug}&min=1900000`)).total, 0); // filtra por el precio de oferta
// Varios talles y colores a la vez, y límite de resultados (para las sugerencias del buscador).
assert.equal((await ok('GET', `/catalogo/productos?categoria=${categoria.slug}&talle=${talleM},999999&color=${negro},999999`)).total, 1);
assert.equal((await ok('GET', `/catalogo/productos?categoria=${categoria.slug}&talle=999999,888888`)).total, 0);
assert.equal((await ok('GET', '/catalogo/productos?limite=1')).productos.length, 1);
assert.ok((await ok('GET', '/catalogo/productos?limite=5000')).productos.length <= 24);
// Los filtros solo ofrecen talles y colores con stock, más el rango de precios.
const filtros = await ok('GET', '/catalogo/filtros');
assert.ok(filtros.talles.some((t: any) => t.id === talleM));
assert.ok(filtros.colores.some((c: any) => c.id === negro));
assert.ok(filtros.talles.length < 13, 'los talles sin stock no deberían aparecer');
assert.ok(filtros.precio.min > 0 && filtros.precio.max >= filtros.precio.min);
const mapa = await ok('GET', '/catalogo/sitemap');
assert.ok(mapa.productos.some((p: any) => p.slug === producto.slug && p.actualizadoEn));
assert.ok(!mapa.productos.some((p: any) => p.slug === duplicado.slug)); // los borradores no van
assert.ok(mapa.categorias.includes(categoria.slug));
const ficha = await ok('GET', `/catalogo/productos/${producto.slug}`);
assert.equal(ficha.variantes[0].stock, 5);
assert.deepEqual([ficha.variantes[0].talle, ficha.variantes[0].color, ficha.variantes[0].hex], ['M', 'Negro', '#000000']);
assert.deepEqual(ficha.guiaTalles, { M: { pecho: 50 } });
assert.equal((await api('GET', `/catalogo/productos/${duplicado.slug}`)).status, 404); // borrador
const tiendaInfo = await ok('GET', '/tienda');
assert.equal(tiendaInfo.contenido.contenido_home.titulo, 'Hola');
assert.equal(tiendaInfo.cuotasSinInteres, null); // desactivadas por defecto
assert.equal(typeof tiendaInfo.reservaTransferenciaHoras, 'number');
assert.equal(typeof tiendaInfo.reservaMercadoPagoMinutos, 'number');
const portada = await ok('GET', '/portada');
assert.ok(portada.destacados.some((p: any) => p.slug === producto.slug));
assert.ok(portada.nuevos.some((p: any) => p.slug === producto.slug));
assert.ok(portada.ofertas.some((p: any) => p.slug === producto.slug));
assert.ok(portada.banners.some((b: any) => b.clave === bannerCreado.json.clave && b.enlace === `/categoria/${categoria.slug}`));
assert.ok(!portada.banners.some((b: any) => b.clave === bannerVencido.json.clave)); // fuera de fecha
assert.equal(await (await fetch(`${BASE}/api/imagenes/${bannerCreado.json.clave}`)).text(), 'RIFFxxxxWEBP-banner');
assert.equal((await ok('GET', `/catalogo/productos?destacado=1&categoria=${categoria.slug}`)).total, 1);

const opciones = await ok('POST', '/envios/cotizar', { codigoPostal: `X${cp}ABC` });
assert.equal(opciones[0].zonaEnvioId, zona.id);

const items = [{ varianteId: variante.id, cantidad: 2 }];
const carrito = await ok('POST', '/carrito/validar', { items, cupon: codigo, zonaEnvioId: zona.id, codigoPostal: String(cp), metodoPago: 'transferencia' });
// 2 × 18.000 = 36.000; cupón 10% = 3.600; transferencia 10% de 32.400 = 3.240; envío 8.000
assert.deepEqual(
  [carrito.subtotalCentavos, carrito.descuentoCentavos, carrito.envioCentavos, carrito.totalCentavos],
  [3_600_000, 684_000, 800_000, 3_716_000],
);
const sinStock = await ok('POST', '/carrito/validar', { items: [{ varianteId: variante.id, cantidad: 9 }] });
assert.equal(sinStock.problemas[0].disponible, 5);
paso('catálogo público con filtros, cotización de envío y carrito recalculado en el servidor');

// ───────────── Tienda: pedido por transferencia ─────────────
const datos = {
  nombre: 'Clienta <b>Prueba</b>',
  email: ` Prueba.${sufijo}@Sukha.Test `,
  telefono: '351 555-0000',
  dni: '30111222',
  entrega: {
    metodoEntrega: 'domicilio',
    zonaEnvioId: zona.id,
    calle: 'San Martín',
    altura: '123',
    localidad: 'Córdoba',
    provincia: 'Córdoba',
    codigoPostal: String(cp),
  },
};
const clave1 = `e2e-${sufijo}-transferencia-1`;
const pedido = { claveIdempotencia: clave1, items, ...datos, metodoPago: 'transferencia', cupon: codigo, aceptaNovedades: true };
const creado = await api('POST', '/pedidos', pedido);
assert.equal(creado.status, 201, creado.texto);
assert.match(creado.json.numero, /^SUK-\d{4,}$/);
assert.equal(creado.json.pedido.totalCentavos, 3_716_000);
assert.equal(creado.json.pedido.transferencia.alias, 'sukha.prueba');
const token = creado.json.token;

const repetido = await api('POST', '/pedidos', pedido); // doble clic
assert.equal(repetido.status, 200);
assert.equal(repetido.json.token, token);

cookie = login.headers.get('set-cookie')!.split(';')[0];
assert.equal(await stockDe(), 3); // reservó 2, una sola vez
const cuponUsado = (await ok('GET', '/admin/cupones')).find((c: any) => c.id === cupon.id);
assert.equal(cuponUsado.usos, 1);
paso('pedido por transferencia: total correcto, stock reservado y doble clic sin duplicar');

// El cupón de un solo uso ya está agotado y un pedido sin stock suficiente no reserva nada.
cookie = '';
const base2 = { ...datos, metodoPago: 'mercadopago', aceptaNovedades: false };
const conCupon = await api('POST', '/pedidos', { ...base2, claveIdempotencia: `e2e-${sufijo}-cupon-2`, items, cupon: codigo });
assert.equal(conCupon.status, 409);
const demasiado = await api('POST', '/pedidos', { ...base2, claveIdempotencia: `e2e-${sufijo}-stock-3`, items: [{ varianteId: variante.id, cantidad: 4 }] });
assert.equal(demasiado.status, 409);
assert.equal((await api('POST', '/pedidos', { ...base2, claveIdempotencia: 'corta', items })).status, 400);
// Topes contra pedidos falsos: unidades por pedido y pedidos sin pagar abiertos por visitante.
const mismaIp = { 'cf-connecting-ip': '203.0.113.7' };
const otroEmail = (n: number) => ({ ...base2, email: `otra${n}.${sufijo}@sukha.test`, claveIdempotencia: `e2e-${sufijo}-tope-${n}0`, items: [{ varianteId: variante.id, cantidad: 1 }] });
cookie = login.headers.get('set-cookie')!.split(';')[0];
await ok('PUT', '/admin/configuracion/max_pedidos_pendientes', { valor: 1 });
await ok('PUT', '/admin/configuracion/max_unidades_por_pedido', { valor: 2 });
cookie = '';
const grande = await api('POST', '/pedidos', { ...otroEmail(9), items: [{ varianteId: variante.id, cantidad: 3 }] }); // hay stock, pero supera el tope
assert.equal(grande.status, 400, grande.texto);
assert.match(grande.json.error, /hasta 2 prendas/);
const primero = await api('POST', '/pedidos', otroEmail(1), mismaIp);
assert.equal(primero.status, 201, primero.texto);
const segundo = await api('POST', '/pedidos', otroEmail(2), mismaIp); // misma IP, otro email
assert.equal(segundo.status, 429, segundo.texto);
const tercero = await api('POST', '/pedidos', { ...otroEmail(3), email: `otra1.${sufijo}@sukha.test` }); // otra IP, mismo email
assert.equal(tercero.status, 429, tercero.texto);
cookie = login.headers.get('set-cookie')!.split(';')[0];
await ok('PUT', '/admin/configuracion/max_pedidos_pendientes', { valor: 3 });
await ok('PUT', '/admin/configuracion/max_unidades_por_pedido', { valor: 10 });
const idTope = (await ok('GET', `/admin/pedidos?q=${primero.json.numero}`))[0].id;
await ok('POST', `/admin/pedidos/${idTope}/estado`, { estado: 'cancelado' }); // libera la prenda para el resto de la prueba
assert.equal(await stockDe(), 3);
cookie = '';
// Campo señuelo completo = bot: se rechaza aunque el resto del pedido sea válido.
assert.equal((await api('POST', '/pedidos', { ...base2, claveIdempotencia: `e2e-${sufijo}-senuelo-9`, items: [{ varianteId: variante.id, cantidad: 1 }], comentarioExtra: 'http://spam.example' })).status, 400);
cookie = login.headers.get('set-cookie')!.split(';')[0];
assert.equal(await stockDe(), 3);
paso('cupón agotado y falta de stock rechazan el pedido sin tocar nada');

// ───────────── Panel: ciclo del pedido ─────────────
const lista1 = await ok('GET', `/admin/pedidos?q=${creado.json.numero}`);
const id = lista1[0].id;
const estado = (e: string, extra = {}) => api('POST', `/admin/pedidos/${id}/estado`, { estado: e, ...extra });
assert.equal((await estado('enviado', { numeroSeguimiento: 'AR1' })).status, 409); // todavía no está pagado
assert.equal((await estado('pagado')).status, 200);
assert.equal((await estado('pagado')).status, 409); // ya lo estaba
assert.equal((await estado('en_preparacion')).status, 200);
assert.equal((await estado('listo_para_retirar')).status, 409); // es con envío
assert.equal((await estado('enviado')).status, 409); // falta el seguimiento
assert.equal((await estado('enviado', { numeroSeguimiento: 'AR123456' })).status, 200);
assert.equal((await estado('entregado')).status, 200);
const detalle = await ok('GET', `/admin/pedidos/${id}`);
assert.deepEqual(
  detalle.historial.map((h: any) => h.estado_nuevo),
  ['pendiente_pago', 'pagado', 'en_preparacion', 'enviado', 'entregado'],
);
assert.equal(detalle.pagos[0].estado, 'aprobado');
assert.equal(detalle.historial[1].admin_id > 0, true);
paso('estados: solo transiciones permitidas, con historial y pago de la transferencia aprobado');

// Post-venta: la clienta pide devolver una de las dos prendas; se reembolsa devolviendo el stock.
cookie = '';
const seguimiento = await ok('GET', `/pedidos/${token}`);
assert.equal(seguimiento.estado, 'entregado');
assert.equal(seguimiento.numeroSeguimiento, 'AR123456');
assert.equal(seguimiento.transferencia, null);
assert.equal(JSON.stringify(seguimiento).includes('admin'), false);
// Buscar el pedido por número y email, sin el link.
const numeroPedido = seguimiento.numero;
const buscado = await ok('POST', '/pedidos/buscar', { numero: numeroPedido, email: ` PRUEBA.${sufijo}@SUKHA.test ` });
assert.equal(buscado.token, token);
assert.equal((await ok('POST', '/pedidos/buscar', { numero: numeroPedido.replace('SUK-', '').replace(/^0+/, ''), email: `prueba.${sufijo}@sukha.test` })).token, token);
const noHay = await api('POST', '/pedidos/buscar', { numero: numeroPedido, email: 'otra@sukha.test' });
const noHay2 = await api('POST', '/pedidos/buscar', { numero: 'SUK-9999999', email: `prueba.${sufijo}@sukha.test` });
assert.equal(noHay.status, 404);
assert.equal(noHay.texto, noHay2.texto); // el mismo mensaje: no delata cuál dato falló
assert.equal((await api('POST', '/pedidos/buscar', { numero: 'abc', email: `prueba.${sufijo}@sukha.test` })).status, 404);
const itemId = seguimiento.items[0].id;
assert.equal((await api('POST', `/pedidos/${token}/solicitudes`, { tipo: 'devolucion', items: [{ pedidoItemId: itemId, cantidad: 5 }] })).status, 400);
await ok('POST', `/pedidos/${token}/solicitudes`, { tipo: 'devolucion', motivo: 'No me quedó', items: [{ pedidoItemId: itemId, cantidad: 1 }] });
cookie = login.headers.get('set-cookie')!.split(';')[0];
const solicitudes = await ok('GET', '/admin/solicitudes?estado=abierta');
const solicitud = solicitudes.find((s: any) => s.pedido_id === id);
assert.equal(solicitud.items[0].cantidad, 1);
await ok('PATCH', `/admin/solicitudes/${solicitud.id}`, { estado: 'resuelta', reembolsoCentavos: 1_800_000 });
assert.equal((await estado('reembolsado', { devolverStock: true })).status, 200);
assert.equal(await stockDe(), 5);
paso('post-venta registrada y reembolso que devuelve el stock');

// ───────────── Reserva vencida y pago que llega tarde ─────────────
cookie = '';
const mp = await api('POST', '/pedidos', { ...base2, claveIdempotencia: `e2e-${sufijo}-vence-4`, items: [{ varianteId: variante.id, cantidad: 5 }] });
assert.equal(mp.status, 201, mp.texto);
assert.equal(mp.json.urlPago, null); // sin credenciales de Mercado Pago en local
assert.equal(mp.json.pedido.totalCentavos, 9_000_000 + 800_000);
cookie = login.headers.get('set-cookie')!.split(';')[0];
assert.equal(await stockDe(), 0);
cookie = '';
assert.equal((await ok('GET', `/catalogo/productos?categoria=${categoria.slug}`)).productos[0].disponible, 0); // se ve como agotado

// Se adelanta el vencimiento directo en la base local y se dispara la tarea programada.
const vencer = spawnSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'sukha', '--local', '--command', `"UPDATE pedido SET reserva_vence_en = '2000-01-01T00:00:00.000Z' WHERE token_seguimiento = '${mp.json.token}'"`],
  { shell: true, stdio: 'ignore' },
);
assert.equal(vencer.status, 0);
// wrangler dev puede reiniciarse al tocar la base desde afuera: se reintenta hasta que responda.
for (let intento = 0; ; intento++) {
  const r = await fetch(`${BASE}/__scheduled`).catch(() => null);
  if (r?.ok) break;
  assert.ok(intento < 15, 'la tarea programada no respondió');
  await new Promise((listo) => setTimeout(listo, 1000));
}
assert.equal((await ok('GET', `/pedidos/${mp.json.token}`)).estado, 'cancelado');
cookie = login.headers.get('set-cookie')!.split(';')[0];
assert.equal(await stockDe(), 5);
paso('la tarea programada cancela la reserva vencida y libera el stock');

// La dueña recibe el pago por otro lado y reactiva el pedido: vuelve a tomar el stock, o avisa si ya no hay.
const idMp = (await ok('GET', `/admin/pedidos?q=${mp.json.numero}`))[0].id;
await ok('POST', `/admin/variantes/${variante.id}/stock`, { tipo: 'venta_local', cantidad: 1 });
const reactivar = await api('POST', `/admin/pedidos/${idMp}/estado`, { estado: 'pagado' });
assert.equal(reactivar.status, 409);
assert.match(reactivar.json.error, /stock/);
assert.equal(await stockDe(), 4); // el intento fallido no dejó nada a medias
await ok('POST', `/admin/pedidos/${idMp}/estado`, { estado: 'a_revisar', nota: 'Pagó tarde, sin stock' });
await ok('POST', `/admin/variantes/${variante.id}/stock`, { tipo: 'carga', cantidad: 1 });
await ok('POST', `/admin/pedidos/${idMp}/estado`, { estado: 'pagado' });
assert.equal(await stockDe(), 0);
paso('reactivar un pedido cancelado vuelve a reservar stock, o falla entero si no alcanza');

// ───────────── Webhook, reportes y exportaciones ─────────────
cookie = '';
assert.equal((await api('POST', '/webhooks/mercadopago?data.id=123&type=payment', { type: 'payment', data: { id: '123' } })).status, 401);
await ok('POST', '/novedades', { email: `otra.${sufijo}@sukha.test` });
cookie = login.headers.get('set-cookie')!.split(';')[0];
const resumen = await ok('GET', '/admin/resumen');
assert.ok(resumen.hoy.ventas >= 1 && resumen.hoy.total_centavos > 0);
assert.ok(resumen.hoy.solicitudes_abiertas >= 0 && resumen.hoy.por_despachar >= 1);
await ok('DELETE', `/admin/banners/${bannerCreado.json.id}`);
await ok('DELETE', `/admin/banners/${bannerVencido.json.id}`);
assert.ok(resumen.porDia.at(-1).pedidos >= 1);
assert.ok(resumen.masVendidos.some((m: any) => m.producto === producto.nombre));
assert.ok(resumen.stockBajo.some((s: any) => s.variante_id === variante.id));
const csv = await api('GET', '/admin/pedidos/exportar');
assert.match(csv.headers.get('content-type')!, /text\/csv/);
assert.ok(csv.texto.includes(creado.json.numero));
const clientas = await ok('GET', '/admin/clientas');
const clienta = clientas.find((c: any) => c.email === `prueba.${sufijo}@sukha.test`);
assert.equal(clienta.acepta_novedades, 1);
paso('webhook sin firma rechazado, reportes, CSV y clientas');

await ok('POST', '/admin/logout');
assert.equal((await api('GET', '/admin/productos')).status, 401);
console.log('TODO OK');
process.exit(0);
