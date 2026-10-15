import { expect, test } from 'vitest';
import { armarEmail } from './emails.service';
import { TRANSICIONES, motivoBloqueo } from './estados.service';
import { firmaValida } from './pagos.service';

const secreto = 'clave-de-prueba';
async function firmar(id: string, solicitud: string, ts: string, clave = secreto) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('HMAC', k, enc.encode(`id:${id};request-id:${solicitud};ts:${ts};`));
  return `ts=${ts},v1=${[...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

test('webhook: solo pasa la firma hecha con la clave secreta sobre ese mismo aviso', async () => {
  const firma = await firmar('12345', 'req-1', '1700000000');
  expect(await firmaValida(secreto, firma, 'req-1', '12345')).toBe(true);
  expect(await firmaValida(secreto, firma, 'req-1', '99999')).toBe(false); // otro pago
  expect(await firmaValida(secreto, firma, 'req-2', '12345')).toBe(false); // otra solicitud
  expect(await firmaValida(secreto, await firmar('12345', 'req-1', '1700000000', 'otra-clave'), 'req-1', '12345')).toBe(false);
  expect(await firmaValida(secreto, undefined, 'req-1', '12345')).toBe(false);
  expect(await firmaValida(secreto, 'basura', 'req-1', '12345')).toBe(false);
});

test('estados: antes del pago solo se cancela; reembolsado es final', () => {
  expect(TRANSICIONES.pendiente_pago).toEqual(['pagado', 'cancelado']);
  expect(TRANSICIONES.reembolsado).toEqual([]);
  expect(motivoBloqueo('pendiente_pago', 'enviado', 'domicilio', 'AR1')).toMatch(/no puede pasar/);
  expect(motivoBloqueo('en_preparacion', 'enviado', 'domicilio', null)).toMatch(/seguimiento/);
  expect(motivoBloqueo('en_preparacion', 'enviado', 'retiro', 'AR1')).toMatch(/retiro/);
  expect(motivoBloqueo('en_preparacion', 'listo_para_retirar', 'sucursal', null)).toMatch(/envío/);
  expect(motivoBloqueo('en_preparacion', 'enviado', 'sucursal', 'AR1')).toBeNull();
  expect(motivoBloqueo('en_preparacion', 'listo_para_retirar', 'retiro', null)).toBeNull();
});

test('emails: los datos que escribe la clienta no pueden inyectar HTML', () => {
  const pedido = {
    id: 7,
    numero: 'SUK-0007',
    token_seguimiento: 'abc',
    nombre: '<script>alert(1)</script>',
    metodo_pago: 'transferencia',
    total_centavos: 1_234_500,
    numero_seguimiento: null,
    items: [{ cantidad: 2, nombre_producto: 'Remera <b>', talle: 'M', color: null }],
  } as any;
  const config = { alias_transferencia: 'sukha.alias', titular_transferencia: '', reserva_transferencia_horas: 48 } as any;
  const email = armarEmail('pedido_recibido', pedido, config, 'https://sukhaind.com.ar')!;
  expect(email.asunto).toBe('Recibimos tu pedido SUK-0007');
  expect(email.html).not.toContain('<script>');
  expect(email.html).toContain('&lt;script&gt;');
  expect(email.html).toContain('Remera &lt;b&gt;');
  expect(email.html).toContain('sukha.alias');
  expect(email.html).toContain('https://sukhaind.com.ar/pedido/abc');
  expect(armarEmail('tipo_que_no_existe', pedido, config, '')).toBeNull();
});
