import { describe, expect, it } from 'vitest';
import { NOTA_CLIENTA_MAX, NuevoPedido } from './tienda.validation';

const pedido = {
  claveIdempotencia: 'abcdefghijklmnop',
  items: [{ varianteId: 1, cantidad: 1 }],
  nombre: 'Ana',
  email: 'ana@ejemplo.com',
  telefono: '351 5551234',
  dni: '30111222',
  entrega: { metodoEntrega: 'retiro' },
  metodoPago: 'transferencia',
};

describe('nota de la clienta en el checkout', () => {
  it('es opcional y queda null si viene vacía', () => {
    expect(NuevoPedido.parse(pedido).nota).toBeNull();
    expect(NuevoPedido.parse({ ...pedido, nota: '   ' }).nota).toBeNull();
  });
  it('se guarda sin espacios de más', () => {
    expect(NuevoPedido.parse({ ...pedido, nota: '  Es para regalo  ' }).nota).toBe('Es para regalo');
  });
  it('tiene tope de largo', () => {
    expect(NuevoPedido.safeParse({ ...pedido, nota: 'a'.repeat(NOTA_CLIENTA_MAX) }).success).toBe(true);
    expect(NuevoPedido.safeParse({ ...pedido, nota: 'a'.repeat(NOTA_CLIENTA_MAX + 1) }).success).toBe(false);
  });
  it('no se mezcla con el campo señuelo', () => {
    const d = NuevoPedido.parse({ ...pedido, nota: 'Timbre B', comentarioExtra: 'spam' });
    expect(d.nota).toBe('Timbre B');
    expect(d.comentarioExtra).toBe('spam');
  });
});
