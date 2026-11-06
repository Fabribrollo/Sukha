import { describe, expect, it } from 'vitest';
import { telefonoWhatsapp, textosWhatsapp, type DatosWhatsapp } from './compartido';

describe('teléfono para WhatsApp', () => {
  it('normaliza las formas en que se escribe un celular argentino', () => {
    for (const t of ['0351 15-555-1234', '351 5551234', '+54 9 351 555 1234', '54 351 555-1234', '(0351) 155551234'])
      expect(telefonoWhatsapp(t)).toBe('5493515551234');
    expect(telefonoWhatsapp('11 15 1234-5678')).toBe('5491112345678');
    expect(telefonoWhatsapp('2944 15 123456')).toBe('5492944123456');
  });
  it('no inventa números', () => {
    expect(telefonoWhatsapp('')).toBeNull();
    expect(telefonoWhatsapp(null)).toBeNull();
    expect(telefonoWhatsapp('4555123')).toBeNull();
  });
});

describe('textos de WhatsApp según el estado', () => {
  const base: DatosWhatsapp = {
    tienda: 'Sukhä',
    nombre: 'Ana María López',
    numero: 'SUK-0012',
    estado: 'pagado',
    linkSeguimiento: 'https://sukhaind.com.ar/pedido/abc',
    numeroSeguimiento: null,
    transporte: null,
    retiro: { direccion: 'San Martín 123', horario: 'Lunes a viernes de 9 a 13' },
  };
  it('pagado y en preparación avisan que se está preparando', () => {
    const t = textosWhatsapp(base);
    expect(t.estado).toContain('¡Hola Ana!');
    expect(t.estado).toContain('SUK-0012');
    expect(textosWhatsapp({ ...base, estado: 'en_preparacion' }).estado).toBe(t.estado);
  });
  it('enviado lleva transportista, seguimiento y link', () => {
    const t = textosWhatsapp({ ...base, estado: 'enviado', numeroSeguimiento: 'CA123', transporte: 'Correo Argentino' }).estado!;
    expect(t).toContain('por Correo Argentino');
    expect(t).toContain('CA123');
    expect(t).toContain(base.linkSeguimiento);
  });
  it('listo para retirar lleva dirección y horarios', () => {
    const t = textosWhatsapp({ ...base, estado: 'listo_para_retirar' }).estado!;
    expect(t).toContain('San Martín 123');
    expect(t).toContain('Lunes a viernes de 9 a 13');
    expect(textosWhatsapp({ ...base, estado: 'listo_para_retirar', retiro: { direccion: '', horario: '' } }).estado).not.toContain('Horarios');
  });
  it('los demás estados solo tienen el genérico', () => {
    const t = textosWhatsapp({ ...base, estado: 'entregado' });
    expect(t.estado).toBeNull();
    expect(t.generico).toContain('SUK-0012');
  });
});
