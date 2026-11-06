import { z } from 'zod';

// Tamaños de bulto: ambos correos piden peso y medidas del paquete. Para ropa alcanza con unos pocos tamaños fijos
// que se configuran en el panel; el bulto se elige según el peso total del carrito.
export const Bulto = z.object({
  nombre: z.string().trim().min(1).max(40),
  altoCm: z.number().int().min(1).max(150),
  anchoCm: z.number().int().min(1).max(150),
  largoCm: z.number().int().min(1).max(150),
  // Hasta cuánto pesa lo que entra en este bulto.
  pesoMaxGramos: z.number().int().min(1).max(25000),
});
export type Bulto = z.infer<typeof Bulto>;

// Valores de partida (medidas aproximadas para ropa); se ajustan pesando y midiendo prendas reales.
export const BULTOS_POR_DEFECTO: Bulto[] = [
  { nombre: 'Chico', altoCm: 5, anchoCm: 25, largoCm: 30, pesoMaxGramos: 500 },
  { nombre: 'Mediano', altoCm: 10, anchoCm: 30, largoCm: 35, pesoMaxGramos: 1500 },
  { nombre: 'Grande', altoCm: 20, anchoCm: 35, largoCm: 40, pesoMaxGramos: 5000 },
];

export type ItemConPeso = { pesoGramos: number | null; cantidad: number };

// Peso total del carrito; un producto sin peso cargado cuenta como `pesoPorDefecto`.
export const pesoTotal = (items: ItemConPeso[], pesoPorDefecto: number) =>
  items.reduce((suma, i) => suma + (i.pesoGramos ?? pesoPorDefecto) * i.cantidad, 0);

// El bulto más chico donde entra el peso. Si no entra en ninguno, el más grande (el correo cobra la diferencia real).
export function elegirBulto(items: ItemConPeso[], bultos: Bulto[], pesoPorDefecto: number) {
  const gramos = pesoTotal(items, pesoPorDefecto);
  const ordenados = [...bultos].sort((a, b) => a.pesoMaxGramos - b.pesoMaxGramos);
  const bulto = ordenados.find((b) => b.pesoMaxGramos >= gramos) ?? ordenados[ordenados.length - 1];
  return { bulto, gramos };
}
