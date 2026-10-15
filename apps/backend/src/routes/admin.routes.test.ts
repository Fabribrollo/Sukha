import { expect, test } from 'vitest';
import { app } from '../app';
import { adminRoutes } from './admin.routes';

// Entorno falso: si alguna ruta del panel llegara a tocar la base sin sesión, este test explota.
const sinBase = new Proxy({}, { get: (_o, nombre) => { throw new Error(`sin sesión no se debería usar ${String(nombre)}`); } });
const siempre = { limit: async () => ({ success: true }) };
const env = { DB: sinBase, IMAGENES: sinBase, LIMITE_LOGIN: siempre, LIMITE_CHECKOUT: siempre, LIMITE_PUBLICO: siempre, LIMITE_PEDIDOS: siempre } as unknown as Env;

const rutas = adminRoutes.routes.filter((r) => r.method !== 'ALL' && r.path !== '/login');

test('hay rutas del panel para revisar', () => {
  expect(rutas.length).toBeGreaterThan(30);
});

test.each(rutas.map((r) => [r.method, r.path]))('%s /api/admin%s exige sesión', async (metodo, ruta) => {
  const r = await app.request(`/api/admin${ruta.replace(/:\w+/g, '1')}`, { method: metodo }, env);
  expect(r.status).toBe(401);
  expect(r.headers.get('cache-control')).toBe('no-store');
});

test('el panel rechaza cambios que vienen de otro sitio', async () => {
  const r = await app.request(
    'https://tienda.test/api/admin/talles',
    { method: 'POST', headers: { origin: 'https://malo.example', cookie: '__Host-sesion=x' } },
    env,
  );
  expect(r.status).toBe(403);
});

test('la API responde con cabeceras de seguridad y sin CORS', async () => {
  const r = await app.request('/api/no-existe', { headers: { origin: 'https://malo.example' } }, env);
  expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  expect(r.headers.get('x-frame-options')).toBe('DENY');
  expect(r.headers.get('access-control-allow-origin')).toBeNull();
});
