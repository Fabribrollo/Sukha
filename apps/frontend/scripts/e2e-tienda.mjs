// Recorre la tienda como una clienta, sin navegador: portada → categoría → filtro → producto → carrito → pedido
// por transferencia → seguimiento. Sirve contra local (`npm run dev`) o staging.
//
//   TIENDA_URL=http://localhost:4321 node scripts/e2e-tienda.mjs
//
// Crea UN pedido de prueba (email e2e@sukha.test). En staging hay que cancelarlo desde el panel; en local no importa.
const base = (process.env.TIENDA_URL ?? 'http://localhost:4321').replace(/\/$/, '');
let ok = 0;
const fallos = [];
const caso = (nombre, cond, detalle = '') => {
  if (cond) ok++;
  else fallos.push(`${nombre}${detalle ? ` → ${detalle}` : ''}`);
};
// El servidor local de desarrollo a veces corta la primera conexión después de recargar: se reintenta.
const llamar = async (ruta, opciones, intentos = 4) => {
  try {
    return await fetch(base + ruta, opciones);
  } catch (e) {
    if (intentos <= 1) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    return llamar(ruta, opciones, intentos - 1);
  }
};
const pedir = async (ruta, cuerpo) => {
  const r = await llamar(ruta, {
    method: cuerpo === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    redirect: 'manual',
  });
  const texto = await r.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {
    /* es HTML */
  }
  return { status: r.status, texto, json };
};

// 1. Portada y páginas fijas
for (const ruta of ['/', '/productos', '/ofertas', '/quienes-somos', '/preguntas-frecuentes', '/cambios-y-devoluciones', '/contacto', '/pedido/buscar', '/arrepentimiento', '/carrito', '/checkout']) {
  const r = await pedir(ruta);
  caso(`GET ${ruta}`, r.status === 200, String(r.status));
}
caso('404 propio', (await pedir('/producto/no-existe-xyz')).status === 404);

// 2. Categoría y filtro
const filtros = (await pedir('/api/catalogo/filtros')).json;
caso('filtros', filtros?.categorias?.length > 0 && filtros?.talles?.length > 0, 'cargá el catálogo de prueba');
if (!filtros?.categorias?.length) {
  console.log(`✗ Sin catálogo no se puede seguir.\n${fallos.join('\n')}`);
  process.exit(1);
}
const categoria = filtros.categorias[0].slug;
caso(`GET /categoria/${categoria}`, (await pedir(`/categoria/${categoria}`)).status === 200);
const talle = filtros.talles[0].id;
const filtrado = await pedir(`/productos?talle=${talle}&orden=precio_asc`);
caso('listado filtrado por talle', filtrado.status === 200);
const lista = (await pedir(`/api/catalogo/productos?talle=${talle}&orden=precio_asc`)).json;
caso('el filtro devuelve productos', lista?.productos?.length > 0);
const precios = lista.productos.map((p) => p.precioOfertaCentavos ?? p.precioCentavos);
caso('orden por precio ascendente', precios.every((p, i) => i === 0 || p >= precios[i - 1]));

// 3. Producto
const slug = lista.productos[0].slug;
const pagina = await pedir(`/producto/${slug}`);
caso('ficha de producto', pagina.status === 200 && pagina.texto.includes('"@type":"Product"'));
const ficha = (await pedir(`/api/catalogo/productos/${slug}`)).json;
const variante = ficha.variantes.find((v) => v.stock > 0);
caso('hay una variante con stock', Boolean(variante));

// 4. Carrito y envío
const items = [{ varianteId: variante.id, cantidad: 1 }];
const validado = (await pedir('/api/carrito/validar', { items, metodoPago: 'transferencia' })).json;
caso('carrito válido', validado?.lineas?.length === 1 && validado.problemas.length === 0);
caso('el total sale del servidor', validado?.totalCentavos > 0);
const opciones = (await pedir('/api/envios/cotizar', { codigoPostal: '5000' })).json ?? [];
const envio = opciones.find((o) => o.modalidad === 'domicilio');

// 5. Pedido por transferencia
const clave = crypto.randomUUID().replaceAll('-', '');
const pedido = {
  claveIdempotencia: clave,
  items,
  nombre: 'Prueba Automática',
  email: 'e2e@sukha.test',
  telefono: '351 555-0000',
  dni: '30111222',
  entrega: envio
    ? { metodoEntrega: 'domicilio', zonaEnvioId: envio.zonaEnvioId, calle: 'San Martín', altura: '123', localidad: 'Córdoba', provincia: 'Córdoba', codigoPostal: '5000' }
    : { metodoEntrega: 'retiro' },
  metodoPago: 'transferencia',
  aceptaNovedades: false,
  comentarioExtra: '',
};
const creado = await pedir('/api/pedidos', pedido);
caso('pedido creado', creado.status === 201 && creado.json?.token, `${creado.status} ${creado.texto.slice(0, 120)}`);
const repetido = await pedir('/api/pedidos', pedido);
caso('reintento con la misma clave no duplica', repetido.status === 200 && repetido.json?.numero === creado.json?.numero, String(repetido.status));
const bot = await pedir('/api/pedidos', { ...pedido, claveIdempotencia: crypto.randomUUID().replaceAll('-', ''), comentarioExtra: 'soy un bot' });
caso('el campo señuelo rechaza el pedido', bot.status >= 400, String(bot.status));

// 6. Seguimiento
const { token, numero } = creado.json ?? {};
const seguimiento = await pedir(`/pedido/${token}`);
caso('seguimiento del pedido', seguimiento.status === 200 && seguimiento.texto.includes(numero) && seguimiento.texto.includes('Datos para transferir'));
caso('seguimiento no se indexa', seguimiento.texto.includes('noindex'));
caso('seguimiento sin analítica', !/googletagmanager|fbevents|gtag\(/.test(seguimiento.texto));
caso('token inexistente da 404', (await pedir('/pedido/' + '0'.repeat(64))).status === 404);
const buscado = await pedir('/api/pedidos/buscar', { numero, email: 'E2E@sukha.test' });
caso('buscar pedido por número y email', buscado.json?.token === token);
caso('buscar con otro email no revela nada', (await pedir('/api/pedidos/buscar', { numero, email: 'otra@sukha.test' })).status === 404);

// 7. SEO
const robots = await pedir('/robots.txt');
caso('robots.txt', robots.texto.includes('Disallow: /pedido') && robots.texto.includes('Sitemap:'));
const mapa = await pedir('/sitemap.xml');
caso('sitemap.xml con el producto', mapa.status === 200 && mapa.texto.includes(`/producto/${slug}`));

console.log(fallos.length ? `✗ ${fallos.length} fallos (${ok} bien):\n- ${fallos.join('\n- ')}` : `✓ ${ok} comprobaciones bien. Pedido de prueba: ${numero}`);
process.exit(fallos.length ? 1 : 0);
