import { beforeEach, expect, test } from 'vitest';
import { borrarVariante } from './catalogo-admin.service';

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
    return { results: [], meta: { changes: Number(s.run(...(args as never[])).changes) } };
  };
  const sentencia = (sql: string, args: unknown[] = []): any => ({
    sql,
    args,
    bind: (...a: unknown[]) => sentencia(sql, a),
    first: async () => ejecutar(sql, args).results[0] ?? null,
    run: async () => ejecutar(sql, args),
  });
  const d1 = { prepare: (sql: string) => sentencia(sql), batch: async (ss: { sql: string; args: unknown[] }[]) => ss.map((s) => ejecutar(s.sql, s.args)) };
  return { db, d1: d1 as unknown as D1Database };
}

let base: ReturnType<typeof d1Falsa>;
const filas = (sql: string) => base.db.prepare(sql).all() as Record<string, number>[];

beforeEach(() => {
  base = d1Falsa();
  base.db.exec(`INSERT INTO categoria (id, nombre, slug) VALUES (1, 'Ropa', 'ropa');
    INSERT INTO producto (id, categoria_id, nombre, slug, precio_centavos) VALUES (1, 1, 'Remera', 'remera', 10000);
    INSERT INTO talle (id, nombre) VALUES (1, 'S'), (2, 'M');
    INSERT INTO variante (id, producto_id, talle_id, sku, stock) VALUES (1, 1, 1, 'A', 3), (2, 1, 2, 'B', 2);
    INSERT INTO movimiento_stock (variante_id, tipo, cantidad, nota) VALUES (1, 'carga', 3, 'Stock inicial'), (2, 'carga', 2, 'Stock inicial');
    INSERT INTO pedido (id, token_seguimiento, clave_idempotencia, clienta_id, estado, nombre, email, telefono, dni, metodo_entrega, metodo_pago, subtotal_centavos, total_centavos)
      VALUES (1, 't', 'i', 1, 'pagado', 'Ana', 'a@t.com', '1', '1', 'retiro', 'mercadopago', 10000, 10000);
    INSERT INTO pedido_item (pedido_id, variante_id, nombre_producto, sku, precio_unitario_centavos, cantidad) VALUES (1, 2, 'Remera', 'B', 10000, 1);`);
});

test('una variante sin ventas se borra con su libro de movimientos', async () => {
  expect(await borrarVariante(base.d1, 1)).toBe('borrada');
  expect(filas('SELECT id FROM variante')).toEqual([{ id: 2 }]);
  expect(filas('SELECT id FROM movimiento_stock WHERE variante_id = 1')).toEqual([]);
});

test('una variante vendida no se borra: queda pausada y el historial intacto', async () => {
  expect(await borrarVariante(base.d1, 2)).toBe('pausada');
  expect(filas('SELECT activa FROM variante WHERE id = 2')).toEqual([{ activa: 0 }]);
  expect(filas('SELECT id FROM pedido_item')).toHaveLength(1);
});

test('una variante que no existe da 404', async () => {
  await expect(borrarVariante(base.d1, 99)).rejects.toThrow();
});
