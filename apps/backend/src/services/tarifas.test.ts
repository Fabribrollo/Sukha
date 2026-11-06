import { describe, expect, it } from 'vitest';
import { ZONAS_REFERENCIA, conMargen, consultarPrecios } from './tarifas.service';

describe('tarifas de Shipy', () => {
  it('suma el margen y redondea hacia arriba a múltiplos de 100 pesos, en centavos', () => {
    expect(conMargen(11080, 10, 100)).toBe(1_220_000); // 12.188 → 12.200
    expect(conMargen(6088, 10, 100)).toBe(670_000); // 6.696,8 → 6.700
  });

  it('el precio de cada zona es el más alto entre sus códigos postales', async () => {
    const precios: Record<string, number> = { '1100': 9000, '1425': 11000 };
    const falso = (async (url: string) => {
      const cp = new URL(url).searchParams.get('cpDestino')!;
      const p = precios[cp] ?? 5000;
      return new Response(JSON.stringify({ quote: { andreaniDomicilioPublico: p, andreaniSucursalPublico: p / 2, correoDomicilioPublico: p, correoSucursalPublico: p / 2 } }));
    }) as unknown as typeof fetch;
    const filas = await consultarPrecios(falso, { origen: 8300, pesoGramos: 1000, margen: 0, redondeo: 100 }, 0);
    expect(filas).toHaveLength(ZONAS_REFERENCIA.length * 4);
    const caba = filas.filter((f) => f.zona === 'CABA');
    expect(caba.find((f) => f.transporte === 'andreani' && f.modalidad === 'domicilio')!.centavos).toBe(1_100_000);
    expect(caba.find((f) => f.transporte === 'correo_argentino' && f.modalidad === 'sucursal')!.centavos).toBe(550_000);
  });

  it('si Shipy cambia el formato, falla sin devolver precios inventados', async () => {
    const roto = (async () => new Response(JSON.stringify({ quote: null }))) as unknown as typeof fetch;
    await expect(consultarPrecios(roto, { origen: 8300, pesoGramos: 1000, margen: 10, redondeo: 100 }, 0)).rejects.toThrow(/Shipy/);
  });

  it('se consultan pocos códigos postales (el plan gratuito limita los pedidos externos por consulta)', () => {
    expect(ZONAS_REFERENCIA.reduce((s, z) => s + z.muestras.length, 0)).toBeLessThanOrEqual(40);
  });
});
