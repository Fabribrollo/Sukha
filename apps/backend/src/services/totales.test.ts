import { expect, test } from 'vitest';
import { type CuponAplicable, calcularTotales } from './totales';

const base = {
  lineas: [
    { precioCentavos: 2_000_000, cantidad: 2 }, // $40.000
    { precioCentavos: 1_500_050, cantidad: 1 }, // $15.000,50
  ],
  envioCentavos: 800_000,
  envioGratisDesdeCentavos: null,
  cupon: null,
  porcentajeTransferencia: 0,
};
const cupon = (c: Partial<CuponAplicable>): CuponAplicable => ({
  id: 1,
  codigo: 'HOLA',
  tipo: 'porcentaje',
  valor: 10,
  minimoCentavos: 0,
  ...c,
});

// La base exige: total = subtotal - descuento + envío, y descuento <= subtotal.
function cumpleReglasDeLaBase(t: ReturnType<typeof calcularTotales>) {
  expect(t.totalCentavos).toBe(t.subtotalCentavos - t.descuentoCentavos + t.envioCentavos);
  expect(t.descuentoCentavos).toBeLessThanOrEqual(t.subtotalCentavos);
  expect(t.descuentos.reduce((s, d) => s + d.montoCentavos, 0)).toBe(t.descuentoCentavos);
  for (const d of t.descuentos) expect(d.montoCentavos).toBeGreaterThan(0);
}

test('sin descuentos: subtotal más envío', () => {
  const t = calcularTotales(base);
  expect(t).toMatchObject({ subtotalCentavos: 5_500_050, descuentoCentavos: 0, envioCentavos: 800_000, totalCentavos: 6_300_050 });
  cumpleReglasDeLaBase(t);
});

test('envío gratis al superar el monto de la zona', () => {
  expect(calcularTotales({ ...base, envioGratisDesdeCentavos: 5_500_050 }).envioCentavos).toBe(0);
  expect(calcularTotales({ ...base, envioGratisDesdeCentavos: 5_500_051 }).envioCentavos).toBe(800_000);
});

test('cupón de porcentaje redondea a centavos enteros', () => {
  const t = calcularTotales({ ...base, cupon: cupon({ valor: 15 }) });
  expect(t.descuentoCentavos).toBe(825_008); // 15% de 5.500.050 = 825.007,5
  expect(Number.isInteger(t.totalCentavos)).toBe(true);
  cumpleReglasDeLaBase(t);
});

test('cupón de monto fijo nunca descuenta más que el subtotal', () => {
  const t = calcularTotales({ ...base, cupon: cupon({ tipo: 'monto', valor: 99_000_000 }) });
  expect(t.descuentoCentavos).toBe(5_500_050);
  expect(t.totalCentavos).toBe(800_000); // solo queda el envío
  cumpleReglasDeLaBase(t);
});

test('cupón bajo el monto mínimo no se aplica y avisa por qué', () => {
  const t = calcularTotales({ ...base, cupon: cupon({ minimoCentavos: 6_000_000 }) });
  expect(t.descuentos).toEqual([]);
  expect(t.cuponRechazado).toMatch(/mínimo/);
});

test('cupón de envío gratis descuenta exactamente el envío', () => {
  const t = calcularTotales({ ...base, cupon: cupon({ tipo: 'envio_gratis', valor: 0 }) });
  expect(t.descuentoCentavos).toBe(800_000);
  expect(t.totalCentavos).toBe(5_500_050);
  cumpleReglasDeLaBase(t);
  // Con retiro no hay envío que regalar.
  expect(calcularTotales({ ...base, envioCentavos: 0, cupon: cupon({ tipo: 'envio_gratis' }) }).cuponRechazado).toMatch(/envío gratis/);
});

test('transferencia: 10% sobre los productos después del cupón, sin tocar el envío', () => {
  const t = calcularTotales({ ...base, cupon: cupon({ tipo: 'monto', valor: 500_050 }), porcentajeTransferencia: 10 });
  expect(t.descuentos.map((d) => [d.tipo, d.montoCentavos])).toEqual([
    ['cupon', 500_050],
    ['transferencia', 500_000], // 10% de 5.000.000
  ]);
  expect(t.totalCentavos).toBe(5_500_050 - 1_000_050 + 800_000);
  cumpleReglasDeLaBase(t);
});

test('cupón del 100% más transferencia no deja descuento negativo ni total negativo', () => {
  const t = calcularTotales({ ...base, cupon: cupon({ valor: 100 }), porcentajeTransferencia: 10 });
  expect(t.descuentos).toHaveLength(1);
  expect(t.totalCentavos).toBe(800_000);
  cumpleReglasDeLaBase(t);
});

test('2x1: de cada dos prendas de la promoción sale gratis la más barata, y el cupón cuenta sobre lo que queda', () => {
  const combo = { id: 1, cada: 2 as const, nombre: '2x1 Verano' };
  const lineas = [
    { precioCentavos: 100_000, cantidad: 1, combo },
    { precioCentavos: 60_000, cantidad: 2, combo },
    { precioCentavos: 50_000, cantidad: 1 }, // fuera de la promoción
  ];
  // 3 prendas en la promoción: sale gratis 1 (la más barata, 600).
  const t = calcularTotales({ ...base, lineas, cupon: null, porcentajeTransferencia: 0 });
  expect(t.descuentos).toEqual([{ tipo: 'promo', cuponId: null, descripcion: 'Promo 2x1 Verano', montoCentavos: 60_000 }]);
  expect(t.subtotalCentavos).toBe(270_000);
  const conCupon = calcularTotales({ ...base, lineas, cupon: cupon({ valor: 10 }), porcentajeTransferencia: 0 });
  expect(conCupon.descuentoCentavos).toBe(60_000 + 21_000); // 10% de 2.100
  cumpleReglasDeLaBase(t);
});

test('3x2: con 5 prendas sale gratis 1; con 6, 2', () => {
  const combo = { id: 2, cada: 3 as const, nombre: '3x2' };
  const con = (n: number) => calcularTotales({ ...base, lineas: [{ precioCentavos: 100_000, cantidad: n, combo }], cupon: null, porcentajeTransferencia: 0 }).descuentoCentavos;
  expect([con(2), con(5), con(6)]).toEqual([0, 100_000, 200_000]);
});
