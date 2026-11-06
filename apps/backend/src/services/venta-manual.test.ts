import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NuevaVentaManual } from '../validations/tienda.validation';
import { vencerReservas } from './estados.service';
import { crearPreferencia } from './pagos.service';
import { cargarPedido } from './pedidos.service';
import { crearVentaManual, prendasParaVender } from './venta-manual.service';

// D1 de prueba sobre SQLite en memoria con las migraciones reales (como en postventa.test.ts).
const { readFileSync, readdirSync } = await import('node:fs' as string);
const { DatabaseSync } = await import('node:sqlite' as string);
const MIGRACIONES = new URL('../../migrations/', (import.meta as { url: string }).url);
function d1Falsa() {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  for (const f of readdirSync(MIGRACIONES).sort()) db.exec(readFileSync(new URL(f, MIGRACIONES), 'utf8'));
  const ejecutar = (sql: string, args: unknown[]) => {
    const s = db.prepare(sql);
    if (s.columns().length) return { results: s.all(...(args as never[])), meta: { changes: 0 } };
    const r = s.run(...(args as never[]));
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const sentencia = (sql: string, args: unknown[] = []): any => ({
    sql,
    args,
    bind: (...a: unknown[]) => sentencia(sql, a),
    first: async () => ejecutar(sql, args).results[0] ?? null,
    all: async () => ejecutar(sql, args),
    run: async () => ejecutar(sql, args),
  });
  // Como D1: el lote es una transacción, si una sentencia falla no queda nada.
  const batch = async (ss: { sql: string; args: unknown[] }[]) => {
    db.exec('BEGIN');
    try {
      const r = ss.map((s) => ejecutar(s.sql, s.args));
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  return { db, d1: { prepare: (sql: string) => sentencia(sql), batch } as unknown as D1Database };
}

let base: ReturnType<typeof d1Falsa>;
let env: Env;
const uno = (sql: string, ...a: unknown[]) => base.db.prepare(sql).get(...a) as any;
const stock = () => uno('SELECT stock FROM variante WHERE id = 1').stock;
const venta = (extra: Record<string, unknown> = {}) =>
  NuevaVentaManual.parse({
    claveIdempotencia: `clave-de-prueba-${Math.random().toString(36).slice(2)}`,
    canal: 'whatsapp',
    items: [{ varianteId: 1, cantidad: 2 }],
    nombre: 'Ana',
    telefono: '+54 9 299 555-1234',
    entrega: { metodoEntrega: 'retiro' },
    metodoPago: 'mercadopago',
    ...extra,
  });

beforeEach(() => {
  base = d1Falsa();
  base.db.exec(`INSERT INTO configuracion (clave, valor) VALUES ('retiro_habilitado', 'true'), ('email_avisos', '"duena@sukha.test"'),
                  ('reserva_mercado_pago_minutos', '30'), ('reserva_transferencia_horas', '48'), ('max_unidades_por_pedido', '5')`);
  base.db.exec("INSERT INTO categoria (id, nombre, slug) VALUES (1, 'Ropa', 'ropa')");
  base.db.exec("INSERT INTO producto (id, categoria_id, nombre, slug, precio_centavos, estado) VALUES (1, 1, 'Remera', 'remera', 1000000, 'publicado')");
  base.db.exec("INSERT INTO talle (id, nombre) VALUES (1, 'M')");
  base.db.exec("INSERT INTO variante (id, producto_id, talle_id, sku, stock) VALUES (1, 1, 1, 'R1', 3)");
  env = { DB: base.d1, SITE_URL: 'https://tienda.test', MP_ACCESS_TOKEN: 'prueba' } as unknown as Env;
});
afterEach(() => vi.unstubAllGlobals());

test('venta manual: reserva el stock, guarda el canal y la nota, espera el pago 48 h y sin email no encola emails', async () => {
  expect(await prendasParaVender(base.d1)).toMatchObject([{ id: 1, nombre: 'Remera', talle: 'M', stock: 3, precio_centavos: 1000000 }]);
  const antes = Date.now();
  const p = await crearVentaManual(env, venta({ notaInterna: 'Pidió envolver para regalo' }), 7);
  expect(p).toMatchObject({ estado: 'pendiente_pago', canal: 'whatsapp', nota_interna: 'Pidió envolver para regalo', total_centavos: 2000000, dni: '' });
  expect(p.email).toBe('5492995551234@sin-email.invalid');
  expect(Date.parse(p.reserva_vence_en!) - antes).toBeGreaterThan(47 * 3_600_000);
  expect(stock()).toBe(1);
  expect(uno("SELECT sum(cantidad) AS n FROM movimiento_stock WHERE tipo = 'reserva'").n).toBe(-2);
  expect(p.historial[0].admin_id).toBe(7);
  expect(uno('SELECT count(*) AS n FROM email_saliente').n).toBe(0);
  // Sin topes por visitante: la dueña puede cargar varias seguidas.
  await crearVentaManual(env, venta({ items: [{ varianteId: 1, cantidad: 1 }] }), 7);
  expect(stock()).toBe(0);
});

test('venta manual: sin stock o pasando el máximo de prendas no se crea nada', async () => {
  await expect(crearVentaManual(env, venta({ items: [{ varianteId: 1, cantidad: 4 }] }), 7)).rejects.toThrow(/quedan 3/);
  base.db.exec('UPDATE variante SET stock = 10 WHERE id = 1');
  await expect(crearVentaManual(env, venta({ items: [{ varianteId: 1, cantidad: 6 }] }), 7)).rejects.toThrow(/hasta 5 prendas/);
  expect(uno('SELECT count(*) AS n FROM pedido').n).toBe(0);
  expect(stock()).toBe(10);
});

test('venta manual: descuento a mano, ya pagada por transferencia y email de la clienta', async () => {
  const p = await crearVentaManual(
    env,
    venta({ email: 'ana@test.com', metodoPago: 'transferencia', pagado: true, descuentoCentavos: 300000, canal: 'instagram' }),
    7,
  );
  // 10% de transferencia por defecto: 20.000 − 2.000 − 3.000.
  expect(p).toMatchObject({ estado: 'pagado', canal: 'instagram', subtotal_centavos: 2000000, descuento_centavos: 500000, total_centavos: 1500000 });
  expect(p.descuentos.map((d) => d.descripcion)).toContain('Descuento');
  expect(p.pagos).toMatchObject([{ proveedor: 'transferencia', estado: 'aprobado', monto_centavos: 1500000 }]);
  const tipos = (base.db.prepare('SELECT tipo FROM email_saliente ORDER BY id').all() as { tipo: string }[]).map((e) => e.tipo);
  expect(tipos).toEqual(['pedido_recibido', 'pago_aprobado', 'aviso_nueva_venta']);
  // «Ya pagó» solo con transferencia o efectivo.
  expect(() => venta({ pagado: true })).toThrow();
});

test('venta manual: el link de pago de Mercado Pago vence con la reserva, y al vencer se libera el stock', async () => {
  const p = await crearVentaManual(env, venta(), 7);
  let cuerpo: any;
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    cuerpo = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ init_point: 'https://mp.test/pagar' }));
  });
  expect(await crearPreferencia(env, p)).toBe('https://mp.test/pagar');
  expect(cuerpo.date_of_expiration).toBe(p.reserva_vence_en);
  expect(cuerpo.back_urls.success).toBe(`https://tienda.test/pedido/${p.token_seguimiento}`);

  base.db.prepare('UPDATE pedido SET reserva_vence_en = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', p.id);
  expect(await vencerReservas(env, 10)).toBe(1);
  expect((await cargarPedido(base.d1, { id: p.id })).estado).toBe('cancelado');
  expect(stock()).toBe(3);
  // La clienta sin email no recibe el aviso de cancelación.
  expect(uno('SELECT count(*) AS n FROM email_saliente').n).toBe(0);
});
