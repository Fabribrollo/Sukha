import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import tarea from '../index';
import { MAX_INTENTOS_EMAIL, RESERVA_EMAILS_PEDIDOS, TOPE_EMAILS_DIA } from '../config';
import { numeroPedido } from '../utils/texto';
import { alertar } from './alertas.service';
import { armarEmail, emailsParaMandar, procesarCola, revisarAtrasados } from './emails.service';
import { cambiarEstado, vencerReservas } from './estados.service';
import { procesarPago } from './pagos.service';
import { cargarPedido } from './pedidos.service';

// D1 de prueba sobre SQLite en memoria con las migraciones reales. Cuenta las consultas (un lote cuenta como una,
// igual que en Cloudflare) para controlar el tope de 50 por ejecución del plan gratis.
// Los módulos de Node se importan sin tipos: el backend compila con los tipos de Workers, no los de Node.
const { readFileSync, readdirSync } = await import('node:fs' as string);
const { DatabaseSync } = await import('node:sqlite' as string);
const MIGRACIONES = new URL('../../migrations/', (import.meta as { url: string }).url);
function d1Falsa() {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  for (const f of readdirSync(MIGRACIONES).sort()) db.exec(readFileSync(new URL(f, MIGRACIONES), 'utf8'));
  const cuenta = { consultas: 0 };
  const ejecutar = (sql: string, args: unknown[]) => {
    const s = db.prepare(sql);
    if (s.columns().length) return { results: s.all(...(args as never[])), meta: { changes: 0 } };
    return { results: [], meta: { changes: Number(s.run(...(args as never[])).changes) } };
  };
  const sentencia = (sql: string, args: unknown[] = []): any => ({
    sql,
    args,
    bind: (...a: unknown[]) => sentencia(sql, a),
    first: async () => (cuenta.consultas++, ejecutar(sql, args).results[0] ?? null),
    all: async () => (cuenta.consultas++, ejecutar(sql, args)),
    run: async () => (cuenta.consultas++, ejecutar(sql, args)),
  });
  const d1 = {
    prepare: (sql: string) => sentencia(sql),
    batch: async (ss: { sql: string; args: unknown[] }[]) => {
      cuenta.consultas++;
      db.exec('BEGIN');
      try {
        const r = ss.map((s) => ejecutar(s.sql, s.args));
        db.exec('COMMIT');
        return r;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { db, d1: d1 as unknown as D1Database, cuenta };
}

let base: ReturnType<typeof d1Falsa>;
let env: Env;
const DUENA = 'duena@sukha.test';
const hace = (horas: number) => new Date(Date.now() - horas * 3_600_000).toISOString();
const uno = (sql: string, ...args: unknown[]) => base.db.prepare(sql).get(...(args as never[])) as any;
const stock = () => uno('SELECT stock FROM variante WHERE id = 1').stock;
const avisos = (pedido: number) =>
  uno("SELECT count(*) AS n FROM email_saliente WHERE pedido_id = ? AND tipo = 'aviso_a_revisar' AND destinatario = ?", pedido, DUENA).n;
const ultimaNota = (pedido: number) => uno('SELECT * FROM historial_estado WHERE pedido_id = ? ORDER BY id DESC LIMIT 1', pedido);

// Un pedido de $100 (2 prendas de la variante 1) pagado con Mercado Pago, con retiro en el local.
function pedido(estado: string, reservaVence = hace(-1)) {
  const { lastInsertRowid } = base.db
    .prepare(
      `INSERT INTO pedido (token_seguimiento, clave_idempotencia, clienta_id, estado, nombre, email, telefono, dni,
         metodo_entrega, metodo_pago, subtotal_centavos, total_centavos, reserva_vence_en)
       VALUES (?, ?, 1, ?, 'Ana', 'ana@test.com', '1', '1', 'retiro', 'mercadopago', 10000, 10000, ?)`,
    )
    .run(crypto.randomUUID(), crypto.randomUUID(), estado, reservaVence);
  const id = Number(lastInsertRowid);
  base.db
    .prepare("INSERT INTO pedido_item (pedido_id, variante_id, nombre_producto, sku, precio_unitario_centavos, cantidad) VALUES (?, 1, 'Remera', 'R1', 5000, 2)")
    .run(id);
  base.db.prepare("INSERT INTO historial_estado (pedido_id, estado_nuevo) VALUES (?, 'pendiente_pago')").run(id);
  return id;
}

// Mercado Pago responde lo que diga `pagos` (id → estado); Resend acepta todo.
let pagos: Record<string, { status: string; pedido: number }> = {};
beforeEach(() => {
  base = d1Falsa();
  base.db.exec(`INSERT INTO configuracion (clave, valor) VALUES ('email_avisos', '"${DUENA}"')`);
  base.db.exec("INSERT INTO variante (id, producto_id, sku, stock) VALUES (1, 1, 'R1', 10)");
  env = { DB: base.d1, MP_ACCESS_TOKEN: 'x', SITE_URL: 'https://tienda.test', EMAIL_FROM: 'a@b.c' } as unknown as Env;
  pagos = {};
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.includes('resend')) return Response.json({ id: 'email' });
    const id = url.split('/').at(-1)!;
    const p = pagos[id];
    return Response.json({ id: Number(id), status: p.status, status_detail: '', external_reference: String(p.pedido), transaction_amount: 100, currency_id: 'ARS', payment_method_id: 'visa' });
  });
});
afterEach(() => vi.unstubAllGlobals());

async function aviso(id: string, status: string, pedidoId: number) {
  pagos[id] = { status, pedido: pedidoId };
  return procesarPago(env, id);
}

test('pago doble: el segundo pago aprobado deja nota y avisa a la dueña, una sola vez y sin cambiar el estado', async () => {
  const id = pedido('pendiente_pago');
  await aviso('111', 'approved', id);
  expect(uno('SELECT estado FROM pedido WHERE id = ?', id).estado).toBe('pagado');
  expect(avisos(id)).toBe(0);

  expect(await aviso('222', 'approved', id)).toBe('pago_doble');
  expect(uno('SELECT estado FROM pedido WHERE id = ?', id).estado).toBe('pagado');
  expect(ultimaNota(id)).toMatchObject({ estado_anterior: 'pagado', estado_nuevo: 'pagado' });
  expect(ultimaNota(id).nota).toMatch(/segundo pago aprobado.*222/);
  expect(avisos(id)).toBe(1);

  // Mercado Pago repite el aviso: no se duplica nada.
  await aviso('222', 'approved', id);
  expect(avisos(id)).toBe(1);

  // El email a la dueña dice el motivo; la clienta no ve la nota como un paso más.
  const p = await cargarPedido(env.DB, { id });
  expect(armarEmail('aviso_a_revisar', p, {} as any, env.SITE_URL)!.html).toContain('segundo pago aprobado');
});

test('contracargo: el pedido sigue pagado, queda nota y llega el aviso', async () => {
  const id = pedido('pendiente_pago');
  await aviso('111', 'approved', id);
  expect(await aviso('111', 'charged_back', id)).toBe('reembolsado');
  expect(uno('SELECT estado FROM pedido WHERE id = ?', id).estado).toBe('pagado');
  expect(uno("SELECT estado FROM pago WHERE id_externo = '111'").estado).toBe('reembolsado');
  expect(ultimaNota(id).nota).toMatch(/contracargo/);
  expect(avisos(id)).toBe(1);
  await aviso('111', 'charged_back', id);
  expect(avisos(id)).toBe(1);
});

test('reembolso o anulación desde Mercado Pago avisa; si se reembolsó desde el panel, no', async () => {
  const id = pedido('pendiente_pago');
  await aviso('111', 'approved', id);
  await aviso('111', 'refunded', id);
  expect(ultimaNota(id).nota).toMatch(/se devolvió o se anuló/);
  expect(avisos(id)).toBe(1);

  const otro = pedido('pendiente_pago');
  await aviso('333', 'approved', otro);
  await aviso('333', 'cancelled', otro);
  expect(avisos(otro)).toBe(1);

  // Reembolsado desde el panel: Mercado Pago confirma la devolución y no hace falta avisar.
  const tercero = pedido('pendiente_pago');
  await aviso('444', 'approved', tercero);
  await cambiarEstado(env, await cargarPedido(env.DB, { id: tercero }), { a: 'reembolsado', adminId: null });
  await aviso('444', 'refunded', tercero);
  expect(avisos(tercero)).toBe(0);
});

test('pago pendiente de más de 72 horas: se cancela, vuelve el stock y se avisa; uno reciente se sigue esperando', async () => {
  base.db.exec('UPDATE variante SET stock = 4'); // 3 pedidos de 2 prendas ya reservadas
  const viejo = pedido('pendiente_pago', hace(80));
  base.db.prepare("INSERT INTO pago (pedido_id, proveedor, id_externo, estado, monto_centavos, creado_en) VALUES (?, 'mercadopago', '1', 'pendiente', 10000, ?)").run(viejo, hace(73));
  const reciente = pedido('pendiente_pago', hace(2));
  base.db.prepare("INSERT INTO pago (pedido_id, proveedor, id_externo, estado, monto_centavos, creado_en) VALUES (?, 'mercadopago', '2', 'pendiente', 10000, ?)").run(reciente, hace(3));
  const sinPago = pedido('pendiente_pago', hace(1));

  expect(await vencerReservas(env, 6)).toBe(2);
  expect(uno('SELECT estado FROM pedido WHERE id = ?', viejo).estado).toBe('cancelado');
  expect(uno('SELECT estado FROM pedido WHERE id = ?', reciente).estado).toBe('pendiente_pago');
  expect(uno('SELECT estado FROM pedido WHERE id = ?', sinPago).estado).toBe('cancelado');
  expect(stock()).toBe(8);
  expect(uno("SELECT estado FROM pago WHERE id_externo = '1'").estado).toBe('rechazado');
  expect(ultimaNota(viejo).nota).toMatch(/más de 72 horas/);
  expect(avisos(viejo)).toBe(1);
  expect(avisos(sinPago)).toBe(0); // una reserva vencida común no necesita aviso
  expect(uno("SELECT count(*) AS n FROM email_saliente WHERE pedido_id = ? AND tipo = 'pedido_cancelado'", viejo).n).toBe(1);
});

test('tarea programada: si un paso falla, los demás corren igual y el error queda registrado', async () => {
  base.db.exec(`INSERT INTO sesion (token_hash, admin_id, vence_en) VALUES ('x', 1, '${hace(1)}')`);
  const DB = { ...base.d1, prepare: (sql: string) => (sql.includes('FROM pedido p') ? { bind: () => { throw new Error('D1 caída'); } } : base.d1.prepare(sql)) };
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  await tarea.scheduled!({} as ScheduledController, { ...env, DB } as unknown as Env);
  expect(error).toHaveBeenCalledWith('Tarea programada: falló "vencer reservas"', expect.any(Error));
  expect(uno('SELECT count(*) AS n FROM sesion').n).toBe(0);
  error.mockRestore();
});

test('tarea programada: con tandas llenas no pasa de 50 consultas a D1', async () => {
  base.db.exec('UPDATE variante SET stock = 100');
  for (let i = 0; i < 8; i++) {
    const id = pedido('pendiente_pago', hace(80));
    base.db.prepare("INSERT INTO pago (pedido_id, proveedor, id_externo, estado, monto_centavos, creado_en) VALUES (?, 'mercadopago', ?, 'pendiente', 10000, ?)").run(id, `p${i}`, hace(73));
    base.db.prepare("INSERT INTO email_saliente (pedido_id, destinatario, tipo) VALUES (?, 'ana@test.com', 'pedido_recibido')").run(id);
  }
  base.cuenta.consultas = 0;
  await tarea.scheduled!({} as ScheduledController, { ...env, RESEND_API_KEY: 're_x' } as Env);
  expect(uno("SELECT count(*) AS n FROM pedido WHERE estado = 'cancelado'").n).toBe(6);
  expect(uno("SELECT count(*) AS n FROM email_saliente WHERE estado = 'enviado'").n).toBe(8);
  expect(base.cuenta.consultas).toBeLessThanOrEqual(50);
});

// ───────────── Cola de emails: prioridad y avisos de fallas ─────────────
const enviadosHace = (cantidad: number, horas: number) => {
  for (let i = 0; i < cantidad; i++) {
    base.db.prepare("INSERT INTO email_saliente (destinatario, tipo, estado, enviado_en) VALUES ('x@test.com', 'pago_aprobado', 'enviado', ?)").run(hace(horas));
  }
};
const encolar = (tipo: string, destinatario = 'ana@test.com', pedidoId: number | null = null) =>
  Number(base.db.prepare('INSERT INTO email_saliente (pedido_id, destinatario, tipo, proximo_intento_en) VALUES (?, ?, ?, ?)').run(pedidoId, destinatario, tipo, hace(1)).lastInsertRowid);

test('cola de emails: los de pedidos salen antes que los de marketing, y el marketing espera si queda poco cupo del día', async () => {
  const marketing = encolar('marketing_newsletter');
  const compra = encolar('pago_aprobado');
  base.db.prepare('UPDATE email_saliente SET proximo_intento_en = ? WHERE id = ?').run(hace(2), marketing); // el de marketing es más viejo
  expect((await emailsParaMandar(env.DB, 8)).map((e) => e.id)).toEqual([compra, marketing]);

  enviadosHace(TOPE_EMAILS_DIA - RESERVA_EMAILS_PEDIDOS, 3); // ya salieron 70 en las últimas 24 horas
  expect((await emailsParaMandar(env.DB, 8)).map((e) => e.id)).toEqual([compra]);

  base.db.exec("UPDATE email_saliente SET enviado_en = '2020-01-01T00:00:00.000Z' WHERE estado = 'enviado'"); // un día nuevo
  expect((await emailsParaMandar(env.DB, 8)).map((e) => e.id)).toEqual([compra, marketing]);
});

// Resend falla para "rebota@test.com"; los demás emails salen. Se guarda a quién se mandó cada uno.
let mandados: { to: string; subject: string }[] = [];
function resendQueFalla() {
  mandados = [];
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    const email = JSON.parse(String(init.body));
    if (email.to === 'rebota@test.com' || email.to?.[0] === 'rebota@test.com') {
      return Response.json({ name: 'validation_error', message: 'Dirección inválida', statusCode: 422 }, { status: 422 });
    }
    mandados.push({ to: [email.to].flat()[0], subject: email.subject });
    return Response.json({ id: 'email' });
  });
}
const alertasMandadas = () => mandados.filter((m) => m.subject.startsWith('Aviso de la tienda'));

test('cola de emails: un email que se da por perdido le avisa a la dueña con el número de pedido, una vez cada 3 horas', async () => {
  resendQueFalla();
  const conClave = { ...env, RESEND_API_KEY: 're_x' } as Env;
  const id = pedido('pagado');
  const fila = encolar('pago_aprobado', 'rebota@test.com', id);
  base.db.prepare('UPDATE email_saliente SET intentos = ? WHERE id = ?').run(MAX_INTENTOS_EMAIL - 1, fila);
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});

  await procesarCola(conClave, 8);
  expect(uno('SELECT estado FROM email_saliente WHERE id = ?', fila).estado).toBe('fallido');
  expect(alertasMandadas()).toEqual([{ to: DUENA, subject: 'Aviso de la tienda: Hay emails de la tienda que no salen' }]);
  // El registro lleva el número de pedido, para buscarlo en Workers Logs.
  expect(error).toHaveBeenCalledWith(expect.objectContaining({ evento: 'email_fallido', pedido: numeroPedido(id) }));

  // Otro email perdido enseguida: queda en los registros, pero no llega otro aviso hasta que pasen 3 horas.
  const otra = encolar('pago_aprobado', 'rebota@test.com', id);
  base.db.prepare('UPDATE email_saliente SET intentos = ? WHERE id = ?').run(MAX_INTENTOS_EMAIL - 1, otra);
  await procesarCola(conClave, 8);
  expect(alertasMandadas()).toHaveLength(1);
  base.db.exec("UPDATE cache_externa SET vence_en = '2020-01-01T00:00:00.000Z' WHERE clave = 'alerta:emails'");
  expect(await alertar(conClave, 'emails', 'Otra falla')).toBe(true);
  expect(alertasMandadas()).toHaveLength(2);
  error.mockRestore();
});

test('cola de emails: si un email de un pedido espera más de 2 horas, se avisa; el marketing que espera no cuenta', async () => {
  resendQueFalla();
  const conClave = { ...env, RESEND_API_KEY: 're_x' } as Env;
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  base.db.prepare("INSERT INTO email_saliente (destinatario, tipo, creado_en) VALUES ('ana@test.com', 'marketing_newsletter', ?)").run(hace(5));
  expect(await revisarAtrasados(conClave)).toBe(0);
  base.db.prepare("INSERT INTO email_saliente (destinatario, tipo, creado_en) VALUES ('ana@test.com', 'pago_aprobado', ?)").run(hace(3));
  expect(await revisarAtrasados(conClave)).toBe(1);
  expect(alertasMandadas()).toHaveLength(1);
  error.mockRestore();
});

test('tarea programada: un paso que falla le avisa a la dueña', async () => {
  resendQueFalla();
  const DB = { ...base.d1, prepare: (sql: string) => (sql.includes('FROM pedido p') ? { bind: () => { throw new Error('D1 caída'); } } : base.d1.prepare(sql)) };
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  await tarea.scheduled!({} as ScheduledController, { ...env, RESEND_API_KEY: 're_x', DB } as unknown as Env);
  expect(alertasMandadas()).toEqual([{ to: DUENA, subject: 'Aviso de la tienda: Falló la tarea automática de la tienda' }]);
  error.mockRestore();
});
