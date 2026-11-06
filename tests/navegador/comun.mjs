// Lo compartido por las pruebas en navegador: a qué tienda apuntar, el navegador, el login del panel y la limpieza.
//
//   TIENDA_URL=http://localhost:4321 (por defecto) o la de staging.
//   Credenciales del admin de prueba en `.env.e2e` (raíz del repo, ignorado por git):
//     E2E_EMAIL=e2e@sukha.test   E2E_CLAVE=...            (local)
//     E2E_CLAVE_STAGING=...                               (staging, mismo email)
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
if (existsSync(`${raiz}.env.e2e`)) {
  for (const linea of readFileSync(`${raiz}.env.e2e`, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

export const BASE = (process.env.TIENDA_URL ?? 'http://localhost:4321').replace(/\/$/, '');
export const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)/.test(BASE);
export const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'e2e@sukha.test',
  clave: LOCAL ? process.env.E2E_CLAVE : process.env.E2E_CLAVE_STAGING,
};
// Todo lo que crean las pruebas lleva este email o este prefijo, para encontrarlo y borrarlo después.
export const EMAIL_CLIENTA = 'e2e-navegador@sukha.test';
export const PREFIJO = 'E2E';

// Edge viene con Windows: no hace falta descargar navegadores. En otra máquina: NAVEGADOR=chrome.
export async function abrirNavegador() {
  return chromium.launch({ channel: process.env.NAVEGADOR ?? 'msedge', headless: process.env.VER !== '1' });
}

// Página nueva que junta los errores de JavaScript y las respuestas 5xx, para fallar si aparece alguno.
export async function paginaNueva(navegador, opciones = {}) {
  const contexto = await navegador.newContext({ locale: 'es-AR', viewport: { width: 1280, height: 900 }, ...opciones });
  const pagina = await contexto.newPage();
  pagina.errores = [];
  pagina.on('pageerror', (e) => pagina.errores.push(`JS: ${e.message}`));
  pagina.on('response', (r) => r.status() >= 500 && pagina.errores.push(`${r.status()} ${r.url()}`));
  // Nunca se sale a Mercado Pago ni a WhatsApp: se corta la navegación y se anota a dónde iba.
  await contexto.route(/mercadopago\.com|mercadolibre\.com|wa\.me/, (ruta) => {
    pagina.salidaExterna = ruta.request().url();
    return ruta.abort();
  });
  return pagina;
}

// Espera a que las islas de Preact que se hidratan al cargar (client:load y client:only) ya respondan: un clic antes
// se pierde (Astro saca el atributo `ssr` de cada isla cuando termina de hidratarla).
export const hidratada = (pagina) =>
  pagina.waitForFunction(() => !document.querySelector('astro-island[ssr][client="load"], astro-island[ssr][client="only"]'));

export async function ingresarAlPanel(pagina) {
  if (!ADMIN.clave) throw new Error(`Falta la clave del admin de prueba en .env.e2e (${LOCAL ? 'E2E_CLAVE' : 'E2E_CLAVE_STAGING'}).`);
  await pagina.goto(`${BASE}/admin/login`);
  await pagina.fill('input[name=email]', ADMIN.email);
  await pagina.fill('input[name=contrasena]', ADMIN.clave);
  await Promise.all([pagina.waitForURL(`${BASE}/admin`), pagina.click('button:has-text("Ingresar")')]);
}

// Llamada a la API sin navegador. Con `cookie`, como admin.
export async function api(metodo, ruta, cuerpo, cookie = '') {
  const r = await fetch(`${BASE}/api${ruta}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', origin: BASE, cookie },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {}
  return { status: r.status, json, texto, headers: r.headers };
}

// Sesión de admin para la API (preparar datos y cancelar los pedidos de prueba). Devuelve la cookie, o null sin clave.
export async function cookieAdmin() {
  if (!ADMIN.clave) return null;
  const r = await api('POST', '/admin/login', { email: ADMIN.email, contrasena: ADMIN.clave });
  if (r.status !== 200) throw new Error(`Login del admin de prueba: ${r.status} ${r.texto}`);
  return r.headers.get('set-cookie').split(';')[0];
}

// Cancela (y así devuelve el stock de) todos los pedidos abiertos de la clienta de prueba.
export async function cancelarPedidosDePrueba(cookie) {
  const pedidos = (await api('GET', `/admin/pedidos?q=${encodeURIComponent(EMAIL_CLIENTA)}`, undefined, cookie)).json ?? [];
  for (const p of pedidos) {
    if (['cancelado', 'reembolsado'].includes(p.estado)) continue;
    await api('POST', `/admin/pedidos/${p.id}/estado`, { estado: 'cancelado', nota: 'Prueba automática' }, cookie);
  }
  return pedidos.length;
}

// SQL directo contra la base (local o staging). Solo para preparar datos que no tienen pantalla (ej. adelantar el reloj
// de un carrito) y para borrar lo que crearon las pruebas.
export function sql(consulta) {
  const destino = LOCAL ? ['sukha', '--local'] : ['sukha-staging', '--env', 'staging', '--remote'];
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', ...destino, '--yes', '--json', '--command', JSON.stringify(consulta)], {
    cwd: `${raiz}apps/backend`,
    shell: true,
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`SQL falló: ${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout)[0]?.results ?? [];
}

// Saca de la cola los emails todavía sin mandar de los pedidos de prueba: el de la clienta (dominio .test, no existe) y
// sobre todo el aviso a la dueña (`email_avisos`, que en staging es un email real). Se llama apenas se crea o se cancela
// un pedido, antes de que pase la tarea programada (cada 5 minutos).
export function sinEmailsDePrueba() {
  sql(`DELETE FROM email_saliente WHERE estado = 'pendiente' AND pedido_id IN (SELECT id FROM pedido WHERE email = '${EMAIL_CLIENTA}')`);
}

// Borra los pedidos, la clienta y el carrito abandonado de la clienta de prueba. Antes hay que cancelar los pedidos desde
// la API (eso devuelve el stock); sus movimientos de reserva y devolución se borran juntos y el libro queda igual.
export function borrarPedidosDePrueba() {
  const deLaClienta = `SELECT id FROM pedido WHERE email = '${EMAIL_CLIENTA}'`;
  sql(
    [
      ...['historial_estado', 'movimiento_stock', 'pedido_item', 'pedido_descuento', 'pago', 'email_saliente'].map(
        (t) => `DELETE FROM ${t} WHERE pedido_id IN (${deLaClienta})`,
      ),
      `DELETE FROM email_saliente WHERE destinatario = '${EMAIL_CLIENTA}'`,
      `DELETE FROM pedido WHERE email = '${EMAIL_CLIENTA}'`,
      `DELETE FROM clienta WHERE email = '${EMAIL_CLIENTA}'`,
      `DELETE FROM carrito_abandonado WHERE email = '${EMAIL_CLIENTA}'`,
    ].join('; '),
  );
}
