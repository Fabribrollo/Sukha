import { beforeEach, expect, test } from 'vitest';
import { armarEmail } from './emails.service';
import { leerConfiguracion } from './configuracion.service';
import { cargarPedido } from './pedidos.service';
import { crearSolicitud } from './postventa.service';

// D1 de prueba sobre SQLite en memoria con las migraciones reales (como en pagos-raros.test.ts).
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
    all: async () => ejecutar(sql, args),
    run: async () => ejecutar(sql, args),
  });
  const d1 = { prepare: (sql: string) => sentencia(sql), batch: async (ss: { sql: string; args: unknown[] }[]) => ss.map((s) => ejecutar(s.sql, s.args)) };
  return { db, d1: d1 as unknown as D1Database };
}

let base: ReturnType<typeof d1Falsa>;
let env: Env;
const emails = (tipo: string) => base.db.prepare('SELECT destinatario FROM email_saliente WHERE tipo = ?').all(tipo) as { destinatario: string }[];

beforeEach(() => {
  base = d1Falsa();
  base.db.exec(`INSERT INTO configuracion (clave, valor) VALUES ('email_avisos', '"duena@sukha.test"')`);
  base.db
    .prepare(
      `INSERT INTO pedido (id, token_seguimiento, clave_idempotencia, clienta_id, estado, nombre, email, telefono, dni,
         metodo_entrega, metodo_pago, subtotal_centavos, total_centavos)
       VALUES (12, 'tok', 'idem', 1, 'entregado', 'Ana', 'ana@test.com', '1', '1', 'retiro', 'mercadopago', 10000, 10000)`,
    )
    .run();
  base.db.prepare("INSERT INTO pedido_item (pedido_id, variante_id, nombre_producto, sku, precio_unitario_centavos, cantidad) VALUES (12, 1, 'Remera', 'R1', 5000, 2)").run();
  env = { DB: base.d1, SITE_URL: 'https://tienda.test' } as unknown as Env;
});

test('arrepentimiento: la clienta recibe el email con el código y un segundo pedido no duplica nada', async () => {
  const r = await crearSolicitud(env, 'tok', { tipo: 'arrepentimiento', motivo: null, items: [] });
  expect(r.codigo).toBe(`${r.numero}-A`);
  expect(emails('arrepentimiento_recibido')).toEqual([{ destinatario: 'ana@test.com' }]);
  expect(emails('aviso_postventa')).toEqual([{ destinatario: 'duena@sukha.test' }]);

  const email = armarEmail('arrepentimiento_recibido', await cargarPedido(base.d1, { id: 12 }), await leerConfiguracion(base.d1), 'https://tienda.test');
  expect(email?.asunto).toBe(`Recibimos tu solicitud de arrepentimiento · Código ${r.codigo}`);
  expect(email?.html).toContain(`<strong>${r.codigo}</strong>`);

  const otra = await crearSolicitud(env, 'tok', { tipo: 'arrepentimiento', motivo: null, items: [] });
  expect(otra).toEqual(r);
  expect(emails('arrepentimiento_recibido')).toHaveLength(1);
  expect(base.db.prepare('SELECT count(*) AS n FROM solicitud_postventa').get()).toEqual({ n: 1 });
});

test('un cambio no manda el email del arrepentimiento', async () => {
  const r = await crearSolicitud(env, 'tok', { tipo: 'cambio', motivo: 'Talle', items: [] });
  expect(r.codigo).toBeNull();
  expect(emails('arrepentimiento_recibido')).toHaveLength(0);
});
