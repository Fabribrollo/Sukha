import { SIN_EMAIL } from '../compartido';
import type { DatosPedido, DatosVentaManual } from '../validations/tienda.validation';
import { cambiarEstado } from './estados.service';
import { productoVisibleSql } from './catalogo.service';
import { cargarPedido, crearPedido } from './pedidos.service';
import { precioVigenteSql } from './promociones.service';

// Ventas por WhatsApp o Instagram cargadas desde el panel. Usan la misma creación de pedido que la tienda (precios, stock,
// reserva y vencimiento); la clienta paga desde la página del pedido, con el link que le manda la dueña.

// Prendas que se pueden vender: variantes activas con stock de productos publicados (las mismas que acepta el pedido).
export async function prendasParaVender(d1: D1Database) {
  const { results } = await d1
    .prepare(
      `SELECT v.id, p.nombre, t.nombre AS talle, c.nombre AS color, v.sku, v.stock,
              ${precioVigenteSql('p')} AS precio_centavos,
              (SELECT clave FROM imagen WHERE producto_id = p.id ORDER BY orden, id LIMIT 1) AS foto
         FROM variante v
         JOIN producto p ON p.id = v.producto_id
         LEFT JOIN talle t ON t.id = v.talle_id
         LEFT JOIN color c ON c.id = v.color_id
        WHERE v.activa = 1 AND ${productoVisibleSql('p')} AND v.stock > 0
        ORDER BY p.nombre, t.orden, c.nombre`,
    )
    .all();
  return results;
}

export async function crearVentaManual(env: Env, d: DatosVentaManual, adminId: number) {
  // Sin email, uno inventado a partir del teléfono: la misma clienta queda en una sola ficha y no recibe emails.
  const email = d.email ?? `${d.telefono.replace(/\D/g, '')}${SIN_EMAIL}`;
  const datos: DatosPedido = {
    claveIdempotencia: d.claveIdempotencia,
    items: d.items,
    nombre: d.nombre,
    email,
    telefono: d.telefono,
    dni: '',
    entrega: d.entrega,
    metodoPago: d.metodoPago,
    cupon: null,
    aceptaNovedades: false,
    nota: null,
  };
  const { token } = await crearPedido(env, datos, 'panel', {
    canal: d.canal,
    adminId,
    envioCentavos: d.envioCentavos,
    descuentoCentavos: d.descuentoCentavos,
    notaInterna: d.notaInterna,
  });
  const pedido = await cargarPedido(env.DB, { token });
  if (!d.pagado || pedido.estado !== 'pendiente_pago') return pedido;
  return cambiarEstado(env, pedido, { a: 'pagado', adminId, nota: 'Pago registrado al cargar la venta.' });
}
