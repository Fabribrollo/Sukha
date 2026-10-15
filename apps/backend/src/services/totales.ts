// Cálculo de totales de un pedido. Función pura: todo en centavos enteros, nunca decimales.
// Es la única fuente del total; el carrito del navegador nunca se usa para cobrar.

export type LineaCarrito = { precioCentavos: number; cantidad: number };

export type CuponAplicable = {
  id: number;
  codigo: string;
  tipo: 'porcentaje' | 'monto' | 'envio_gratis';
  valor: number;
  minimoCentavos: number;
};

export type LineaDescuento = {
  tipo: 'cupon' | 'transferencia';
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

  const descuentos: LineaDescuento[] = [];
  let cuponRechazado: string | null = null;
  // Los descuentos nunca superan el subtotal: `disponible` es lo que queda por descontar.
  let disponible = subtotal;

  const cupon = entrada.cupon;
  if (cupon) {
    let monto = 0;
    if (subtotal < cupon.minimoCentavos) {
      cuponRechazado = 'El pedido no llega al monto mínimo del cupón.';
    } else if (cupon.tipo === 'porcentaje') {
      monto = Math.round((subtotal * cupon.valor) / 100);
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
    const base = cupon?.tipo === 'envio_gratis' ? subtotal : disponible;
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
