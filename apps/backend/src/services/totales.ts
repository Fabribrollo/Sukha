// Cálculo de totales de un pedido. Función pura: todo en centavos enteros, nunca decimales.
// Es la única fuente del total; el carrito del navegador nunca se usa para cobrar.

// `combo`: la promoción 2x1 o 3x2 que alcanza a la prenda (`cada` = 2 o 3 unidades, una sale gratis).
export type LineaCarrito = { precioCentavos: number; cantidad: number; combo?: { id: number; cada: 2 | 3; nombre: string } | null };

export type CuponAplicable = {
  id: number;
  codigo: string;
  tipo: 'porcentaje' | 'monto' | 'envio_gratis';
  valor: number;
  minimoCentavos: number;
};

export type LineaDescuento = {
  tipo: 'cupon' | 'transferencia' | 'promo'; // promo: un 2x1 o 3x2, o un descuento a mano en una venta del panel
  cuponId: number | null;
  descripcion: string;
  montoCentavos: number;
};

export type Totales = {
  subtotalCentavos: number;
  descuentoCentavos: number;
  envioCentavos: number;
  totalCentavos: number;
  descuentos: LineaDescuento[];
  // Motivo por el que el cupón no se aplicó, si vino uno.
  cuponRechazado: string | null;
};

// Cada `cada` unidades de una misma promoción, la más barata sale gratis: se descuentan las `n / cada` unidades más baratas.
function descuentosPorCombo(lineas: LineaCarrito[]): LineaDescuento[] {
  const grupos = new Map<number, { cada: number; nombre: string; precios: number[] }>();
  for (const l of lineas) {
    if (!l.combo) continue;
    const g = grupos.get(l.combo.id) ?? { cada: l.combo.cada, nombre: l.combo.nombre, precios: [] };
    for (let i = 0; i < l.cantidad; i++) g.precios.push(l.precioCentavos);
    grupos.set(l.combo.id, g);
  }
  return [...grupos.values()].flatMap((g) => {
    const gratis = Math.floor(g.precios.length / g.cada);
    const monto = g.precios.sort((a, b) => a - b).slice(0, gratis).reduce((suma, p) => suma + p, 0);
    return monto > 0 ? [{ tipo: 'promo' as const, cuponId: null, descripcion: `Promo ${g.nombre}`, montoCentavos: monto }] : [];
  });
}

export function calcularTotales(entrada: {
  lineas: LineaCarrito[];
  // Costo de la zona elegida; 0 si es retiro.
  envioCentavos: number;
  // Monto desde el que la zona envía gratis, si tiene.
  envioGratisDesdeCentavos: number | null;
  cupon: CuponAplicable | null;
  // Porcentaje de descuento por transferencia; 0 si paga con Mercado Pago.
  porcentajeTransferencia: number;
}): Totales {
  const subtotal = entrada.lineas.reduce((suma, l) => suma + l.precioCentavos * l.cantidad, 0);
  const gratisPorMonto = entrada.envioGratisDesdeCentavos !== null && subtotal >= entrada.envioGratisDesdeCentavos;
  const envio = gratisPorMonto ? 0 : entrada.envioCentavos;

  // Primero las promociones; el cupón y la transferencia se calculan sobre lo que queda.
  const descuentos = descuentosPorCombo(entrada.lineas);
  let cuponRechazado: string | null = null;
  // Los descuentos nunca superan el subtotal: `disponible` es lo que queda por descontar.
  let disponible = subtotal - descuentos.reduce((suma, d) => suma + d.montoCentavos, 0);
  const sinCupon = disponible;

  const cupon = entrada.cupon;
  if (cupon) {
    let monto = 0;
    if (subtotal < cupon.minimoCentavos) {
      cuponRechazado = 'El pedido no llega al monto mínimo del cupón.';
    } else if (cupon.tipo === 'porcentaje') {
      monto = Math.round((disponible * cupon.valor) / 100);
    } else if (cupon.tipo === 'monto') {
      monto = cupon.valor;
    } else {
      // Envío gratis: el envío se cobra entero y se descuenta el mismo monto, así queda registrado cuánto costó la promo.
      monto = envio;
      if (monto === 0) cuponRechazado = 'Este pedido ya tiene envío gratis.';
    }
    monto = Math.min(monto, disponible);
    if (monto > 0) {
      descuentos.push({ tipo: 'cupon', cuponId: cupon.id, descripcion: `Cupón ${cupon.codigo}`, montoCentavos: monto });
      disponible -= monto;
    }
  }

  if (entrada.porcentajeTransferencia > 0) {
    // Se aplica sobre los productos ya descontado el cupón; el envío no entra.
    const base = cupon?.tipo === 'envio_gratis' ? sinCupon : disponible;
    const monto = Math.min(Math.round((base * entrada.porcentajeTransferencia) / 100), disponible);
    if (monto > 0) {
      descuentos.push({
        tipo: 'transferencia',
        cuponId: null,
        descripcion: `${entrada.porcentajeTransferencia}% por transferencia`,
        montoCentavos: monto,
      });
      disponible -= monto;
    }
  }

  const descuento = subtotal - disponible;
  return {
    subtotalCentavos: subtotal,
    descuentoCentavos: descuento,
    envioCentavos: envio,
    totalCentavos: subtotal - descuento + envio,
    descuentos,
    cuponRechazado,
  };
}
