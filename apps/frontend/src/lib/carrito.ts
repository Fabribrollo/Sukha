// Estado del carrito: vive en el navegador (localStorage) y se comparte entre las islas y entre pestañas.
// Lo guardado acá es solo para mostrar al instante. Los totales y la disponibilidad siempre salen del servidor
// (POST /api/carrito/validar): nunca se cobra ni se decide stock con estos números.
import { persistentAtom } from '@nanostores/persistent';
import { atom, computed } from 'nanostores';

export type Linea = {
  varianteId: number;
  cantidad: number;
  // Copia para mostrar mientras el servidor responde.
  nombre: string;
  slug: string;
  talle: string | null;
  color: string | null;
  foto: string | null;
  precioCentavos: number;
};

const decodificar = (texto: string): Linea[] => {
  try {
    const valor = JSON.parse(texto);
    return Array.isArray(valor) ? valor.filter((l) => Number.isInteger(l?.varianteId) && Number.isInteger(l?.cantidad) && l.cantidad > 0) : [];
  } catch {
    return [];
  }
};

// persistentAtom ya sincroniza entre pestañas con el evento "storage".
export const carrito = persistentAtom<Linea[]>('sukha:carrito', [], { encode: JSON.stringify, decode: decodificar });

// Si el carrito lateral está abierto.
export const carritoAbierto = atom(false);

export const cantidadTotal = computed(carrito, (lineas) => lineas.reduce((suma, l) => suma + l.cantidad, 0));

// Avisos que quedan después de ajustar el carrito con lo que dijo el servidor (uno por prenda, con su nombre).
export const avisos = atom<Record<number, string>>({});

export const enCarrito = (varianteId: number) => carrito.get().find((l) => l.varianteId === varianteId)?.cantidad ?? 0;

// Suma una prenda sin pasar el stock de esa variante ni el máximo de prendas por pedido.
// Devuelve cuántas se agregaron de verdad y, si fueron menos de las pedidas, por qué.
export function agregar(linea: Omit<Linea, 'cantidad'>, cantidad: number, limites: { stock: number; maxPorPedido: number }) {
  const actuales = carrito.get();
  const yaEnCarrito = enCarrito(linea.varianteId);
  const totalActual = actuales.reduce((suma, l) => suma + l.cantidad, 0);
  const lugarPorStock = limites.stock - yaEnCarrito;
  const lugarPorPedido = limites.maxPorPedido - totalActual;
  const agregadas = Math.max(0, Math.min(cantidad, lugarPorStock, lugarPorPedido));
  if (agregadas > 0) {
    const resto = actuales.filter((l) => l.varianteId !== linea.varianteId);
    const existente = actuales.find((l) => l.varianteId === linea.varianteId);
    // Las demás líneas conservan su lugar; la que ya estaba se actualiza en su posición.
    carrito.set(existente ? actuales.map((l) => (l.varianteId === linea.varianteId ? { ...l, ...linea, cantidad: l.cantidad + agregadas } : l)) : [...resto, { ...linea, cantidad: agregadas }]);
  }
  let motivo: string | undefined;
  if (agregadas < cantidad) {
    motivo = lugarPorStock <= 0
      ? `Ya tenés en el carrito todas las unidades disponibles (${limites.stock}).`
      : lugarPorPedido <= 0
        ? `Un pedido puede tener hasta ${limites.maxPorPedido} prendas.`
        : `Solo pudimos agregar ${agregadas}: ${lugarPorStock < lugarPorPedido ? `quedan ${limites.stock}` : `el máximo por pedido es ${limites.maxPorPedido}`}.`;
  }
  return { agregadas, motivo };
}

// Cambia la cantidad de una línea. Con 0 o menos, la quita.
export function cambiarCantidad(varianteId: number, cantidad: number) {
  if (cantidad <= 0) return quitar(varianteId);
  carrito.set(carrito.get().map((l) => (l.varianteId === varianteId ? { ...l, cantidad } : l)));
}

export function quitar(varianteId: number) {
  carrito.set(carrito.get().filter((l) => l.varianteId !== varianteId));
  const { [varianteId]: _, ...resto } = avisos.get();
  avisos.set(resto);
}

export function vaciar() {
  carrito.set([]);
  avisos.set({});
}

// ───────────── Validación con el servidor ─────────────
export type LineaValidada = { varianteId: number; sku: string; nombre: string; talle: string | null; color: string | null; precioCentavos: number; cantidad: number };
export type OpcionEnvio = { zonaEnvioId: number; nombre: string; transporte: 'correo_argentino' | 'andreani'; modalidad: 'domicilio' | 'sucursal'; precioCentavos: number; gratisDesdeCentavos: number | null };
export type Validacion = {
  lineas: LineaValidada[];
  problemas: { varianteId: number; motivo: string; disponible: number }[];
  subtotalCentavos: number;
  descuentoCentavos: number;
  envioCentavos: number;
  totalCentavos: number;
  descuentos: { tipo: 'cupon' | 'transferencia'; descripcion: string; montoCentavos: number }[];
  cuponRechazado: string | null;
  envio: OpcionEnvio | null;
};

export type ParametrosValidacion = {
  cupon?: string | null;
  zonaEnvioId?: number | null;
  codigoPostal?: string | null;
  metodoPago?: 'mercadopago' | 'transferencia';
};

// Pide al servidor el total real. Devuelve null si el carrito está vacío; lanza un Error con el mensaje de la API si algo falla.
export async function validar(parametros: ParametrosValidacion = {}): Promise<Validacion | null> {
  const lineas = carrito.get();
  if (!lineas.length) return null;
  const r = await fetch('/api/carrito/validar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items: lineas.map((l) => ({ varianteId: l.varianteId, cantidad: l.cantidad })), ...parametros }),
  });
  const cuerpo = (await r.json().catch(() => null)) as any;
  if (!r.ok) throw new Error(cuerpo?.error ?? 'No pudimos revisar tu carrito. Probá de nuevo.');
  return cuerpo as Validacion;
}

// Deja el carrito como lo permite el servidor: saca lo que ya no está, baja lo que no alcanza y anota un aviso por prenda
// (con su nombre, porque la línea puede haber desaparecido). Devuelve true si cambió algo y conviene volver a validar.
export function ajustarSegun(problemas: Validacion['problemas']) {
  if (!problemas.length) return false;
  const nuevosAvisos: Record<number, string> = {};
  let lineas = carrito.get();
  for (const p of problemas) {
    const nombre = lineas.find((l) => l.varianteId === p.varianteId)?.nombre ?? 'Una prenda';
    nuevosAvisos[p.varianteId] = p.disponible > 0 ? `${nombre}: quedan ${p.disponible}. Ajustamos la cantidad.` : `${nombre}: ya no está disponible. La sacamos del carrito.`;
    lineas = p.disponible > 0 ? lineas.map((l) => (l.varianteId === p.varianteId ? { ...l, cantidad: p.disponible } : l)) : lineas.filter((l) => l.varianteId !== p.varianteId);
  }
  carrito.set(lineas);
  avisos.set({ ...avisos.get(), ...nuevosAvisos });
  return true;
}
