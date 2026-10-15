import { z } from 'zod';
import { booleano, centavos, fechaIso, id, texto, textoOpcional } from './comunes';

// ───────────── Envíos ─────────────

export const NuevaZona = z.object({
  nombre: texto(60),
  transporte: z.enum(['correo_argentino', 'andreani']),
  modalidad: z.enum(['domicilio', 'sucursal']),
  precioCentavos: centavos,
  gratisDesdeCentavos: centavos.positive().nullish(),
  activa: booleano.optional(),
});
export const EdicionZona = NuevaZona.partial();

const cp = z.number().int().min(1000).max(9999);
export const NuevoRango = z
  .object({ cpDesde: cp, cpHasta: cp })
  .refine((r) => r.cpHasta >= r.cpDesde, { path: ['cpHasta'], message: 'tiene que ser mayor o igual a cpDesde' });

// ───────────── Cupones ─────────────

const camposCupon = {
  codigo: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, 'de 3 a 30 letras, números, guiones'),
  tipo: z.enum(['porcentaje', 'monto', 'envio_gratis']),
  // Porcentaje (1 a 100) o centavos, según el tipo; se ignora en envio_gratis.
  valor: z.number().int().nonnegative().default(0),
  minimoCentavos: centavos.default(0),
  usosMaximos: z.number().int().positive().nullish(),
  venceEn: fechaIso.nullish(),
  activo: booleano.optional(),
};
export const NuevoCupon = z
  .object(camposCupon)
  .refine((c) => c.tipo !== 'porcentaje' || (c.valor >= 1 && c.valor <= 100), { path: ['valor'], message: 'entre 1 y 100' })
  .refine((c) => c.tipo !== 'monto' || c.valor > 0, { path: ['valor'], message: 'tiene que ser mayor a 0' });
// El código y el tipo no se editan: los pedidos viejos los referencian.
export const EdicionCupon = z.object({
  minimoCentavos: centavos.optional(),
  usosMaximos: z.number().int().positive().nullable().optional(),
  venceEn: fechaIso.nullable().optional(),
  activo: booleano.optional(),
});

// ───────────── Configuración ─────────────

// Cada clave conocida con su regla y su valor por defecto.
export const CONFIGURACION = {
  reserva_mercado_pago_minutos: z.number().int().min(5).max(1440).default(30),
  reserva_transferencia_horas: z.number().int().min(1).max(240).default(48),
  descuento_transferencia_porcentaje: z.number().int().min(0).max(90).default(10),
  cuotas_sin_interes: z.boolean().default(false),
  // Cantidad de cuotas sin interés a mostrar cuando están activas.
  cuotas_cantidad: z.number().int().min(1).max(12).default(3),
  alias_transferencia: z.string().trim().max(60).default(''),
  titular_transferencia: z.string().trim().max(120).default(''),
  // Casilla que recibe los avisos de nueva venta, transferencias y post-venta. Vacío = sin avisos.
  email_avisos: z.union([z.email(), z.literal('')]).default(''),
  // Datos públicos del negocio para el contacto y el pie de la tienda.
  email_contacto: z.union([z.email(), z.literal('')]).default(''),
  datos_legales: z.string().trim().max(500).default(''),
  retiro_habilitado: z.boolean().default(false),
  retiro_direccion: z.string().trim().max(200).default(''),
  retiro_horario: z.string().trim().max(200).default(''),
  stock_bajo_umbral: z.number().int().min(0).max(1000).default(2),
  // Topes contra pedidos falsos que retienen stock sin pagar.
  max_unidades_por_pedido: z.number().int().min(1).max(200).default(10),
  max_pedidos_pendientes: z.number().int().min(1).max(50).default(3),
  // Portada y pie de la tienda.
  barra_anuncios: z.string().trim().max(200).default(''),
  whatsapp: z.string().trim().regex(/^\+?[0-9 ]{0,20}$/, 'solo números').default(''),
  instagram: z.string().trim().regex(/^[A-Za-z0-9._]{0,30}$/, 'solo el nombre de usuario, sin @').default(''),
  // Con este stock o menos, la ficha muestra "últimas unidades".
  ultimas_unidades_umbral: z.number().int().min(0).max(100).default(3),
} as const;
export type ClaveConfig = keyof typeof CONFIGURACION;
export type Configuracion = { [K in ClaveConfig]: z.infer<(typeof CONFIGURACION)[K]> };

// Textos y banners de la tienda que se editan desde el panel: claves libres "contenido_*" con cualquier JSON.
export const esClaveContenido = (clave: string) => /^contenido_[a-z0-9_]{1,40}$/.test(clave);

// ───────────── Carrito y checkout ─────────────

const items = z
  .array(z.object({ varianteId: id, cantidad: z.number().int().min(1).max(20) }))
  .min(1)
  .max(30)
  .refine((lista) => new Set(lista.map((i) => i.varianteId)).size === lista.length, 'hay variantes repetidas');

const codigoPostal = z.string().trim().toUpperCase().regex(/^[A-Z]?\d{4}[A-Z]{0,3}$/, 'código postal inválido');
const cuponOpcional = z.string().trim().toUpperCase().max(30).nullish().transform((v) => v || null);

export const CotizarEnvio = z.object({ codigoPostal });

export const ValidarCarrito = z.object({
  items,
  cupon: cuponOpcional,
  zonaEnvioId: id.nullish(),
  codigoPostal: codigoPostal.nullish(),
  metodoPago: z.enum(['mercadopago', 'transferencia']).default('mercadopago'),
});

// Campo señuelo (honeypot): en el formulario va oculto, así que una persona nunca lo completa.
// Los bots que rellenan todos los campos sí, y ese pedido se descarta.
const senuelo = z.string().max(500).optional();

const contacto = {
  nombre: texto(120),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  telefono: z.string().trim().regex(/^[0-9+() -]{6,25}$/, 'teléfono inválido'),
  dni: z.string().trim().regex(/^\d{7,8}$/, 'DNI de 7 u 8 números'),
};

const entrega = z.discriminatedUnion('metodoEntrega', [
  z.object({
    metodoEntrega: z.literal('domicilio'),
    zonaEnvioId: id,
    calle: texto(120),
    altura: texto(20),
    pisoDepto: textoOpcional(40),
    localidad: texto(80),
    provincia: texto(60),
    codigoPostal,
    indicaciones: textoOpcional(300),
  }),
  z.object({
    metodoEntrega: z.literal('sucursal'),
    zonaEnvioId: id,
    sucursalCorreo: texto(120),
    localidad: textoOpcional(80),
    provincia: texto(60),
    codigoPostal,
  }),
  z.object({ metodoEntrega: z.literal('retiro') }),
]);

export const NuevoPedido = z.object({
  // La genera el navegador una vez por intento de compra: un doble clic no crea dos pedidos.
  claveIdempotencia: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  items,
  ...contacto,
  entrega,
  metodoPago: z.enum(['mercadopago', 'transferencia']),
  cupon: cuponOpcional,
  aceptaNovedades: z.boolean().default(false),
  comentarioExtra: senuelo,
  // Solo si pide factura con CUIT.
  cuit: z.string().trim().regex(/^\d{11}$/, 'CUIT de 11 números').nullish(),
  condicionIva: z.enum(['consumidor_final', 'monotributo', 'responsable_inscripto', 'exento']).nullish(),
});
export type DatosPedido = z.infer<typeof NuevoPedido>;

export const Suscripcion = z.object({ email: contacto.email, comentarioExtra: senuelo });

// Para encontrar un pedido sin el link: número ("SUK-0012" o "12") y el email de la compra.
export const BuscarPedido = z.object({ numero: z.string().trim().min(1).max(20), email: contacto.email });

// ───────────── Pedidos en el panel y post-venta ─────────────

export const CambioEstado = z.object({
  estado: z.enum([
    'pagado',
    'en_preparacion',
    'enviado',
    'listo_para_retirar',
    'entregado',
    'cancelado',
    'reembolsado',
    'a_revisar',
  ]),
  nota: textoOpcional(500),
  // Obligatorio al pasar a "enviado".
  numeroSeguimiento: textoOpcional(80),
  // En un reembolso: si las prendas vuelven al stock.
  devolverStock: z.boolean().default(false),
});

export const EdicionPedido = z.object({
  numeroSeguimiento: textoOpcional(80).optional(),
  facturaNumero: textoOpcional(40).optional(),
});

export const NuevaSolicitud = z.object({
  tipo: z.enum(['arrepentimiento', 'cambio', 'devolucion']),
  motivo: textoOpcional(1000),
  // Vacío = todo el pedido.
  items: z.array(z.object({ pedidoItemId: id, cantidad: z.number().int().positive() })).max(30).default([]),
});

export const EdicionSolicitud = z.object({
  estado: z.enum(['abierta', 'aprobada', 'rechazada', 'resuelta']).optional(),
  reembolsoCentavos: centavos.positive().nullable().optional(),
});
