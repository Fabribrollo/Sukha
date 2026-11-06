import { z } from 'zod';
import { BULTOS_POR_DEFECTO, Bulto } from '../services/bultos';
import { Portada } from './portada.validation';
import { Cabecera } from './cabecera.validation';
import { booleano, centavos, fechaIso, id, texto, textoOpcional } from './comunes';

// ───────────── Envíos ─────────────

// Precios de los tramos de más peso (hasta 3, 5 y 10 kg); el de hasta 1 kg es `precioCentavos`.
const Escalon = z.object({ hastaGramos: z.union([z.literal(3000), z.literal(5000), z.literal(10000)]), precioCentavos: centavos });

export const NuevaZona = z.object({
  escalones: z.array(Escalon).max(3).optional(),
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

// ───────────── Promociones ─────────────

const camposPromocion = {
  nombre: texto(60),
  tipo: z.enum(['liquidacion', '2x1', '3x2']),
  // Solo la liquidación lleva porcentaje.
  porcentaje: z.number().int().min(1).max(90).nullish(),
  categoriaId: id.nullish(),
  coleccionId: id.nullish(),
  desde: fechaIso.nullish(),
  hasta: fechaIso.nullish(),
  activa: booleano.optional(),
};
export const NuevaPromocion = z
  .object(camposPromocion)
  .refine((p) => (p.categoriaId == null) !== (p.coleccionId == null), { path: ['categoriaId'], message: 'elegí una categoría o una colección' })
  .refine((p) => p.tipo !== 'liquidacion' || p.porcentaje != null, { path: ['porcentaje'], message: 'poné el porcentaje de descuento' })
  .refine((p) => !p.desde || !p.hasta || p.hasta > p.desde, { path: ['hasta'], message: 'tiene que ser posterior al inicio' });
// El tipo y el alcance no se editan: se crea otra promoción.
export const EdicionPromocion = z.object({
  nombre: camposPromocion.nombre.optional(),
  porcentaje: z.number().int().min(1).max(90).optional(),
  desde: fechaIso.nullable().optional(),
  hasta: fechaIso.nullable().optional(),
  activa: booleano.optional(),
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
  // Datos del comercio que exige la ley (Res. 270/2020): van al pie y se usan en los textos legales con {{variables}}.
  razon_social: z.string().trim().max(120).default(''),
  cuit: z.string().trim().regex(/^(\d{2}-?\d{8}-?\d)?$/, 'once números, con o sin guiones').default(''),
  condicion_fiscal: z.string().trim().max(60).default('Monotributista'),
  domicilio_comercial: z.string().trim().max(200).default('Juan Bautista Alberdi 129, Neuquén'),
  // Canal de consultas y reclamos (Disp. 954/2025): horario y quién responde.
  horario_atencion: z.string().trim().max(200).default(''),
  responsable_atencion: z.string().trim().max(120).default('la administración de Sukhä'),
  // Link del QR de Data Fiscal que da ARCA (formulario 960). Vacío = no se muestra.
  data_fiscal_url: z.union([z.url({ protocol: /^https?$/, hostname: /(^|\.)(afip|arca)\.gob\.ar$/ }), z.literal('')]).default(''),
  retiro_habilitado: z.boolean().default(false),
  retiro_direccion: z.string().trim().max(200).default(''),
  // Horarios del retiro día por día; cada día puede tener hasta 3 franjas (horario cortado). Los días sin entrada están cerrados.
  retiro_horarios: z.partialRecord(z.enum(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']), z.array(z.object({ desde: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), hasta: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) })).max(3)).default({}),
  retiro_horario: z.string().trim().max(200).default(''),
  stock_bajo_umbral: z.number().int().min(0).max(1000).default(2),
  // Topes contra pedidos falsos que retienen stock sin pagar.
  max_unidades_por_pedido: z.number().int().min(1).max(200).default(10),
  max_pedidos_pendientes: z.number().int().min(1).max(50).default(3),
  // Envíos: código postal de donde sale la mercadería, peso de los productos sin peso cargado y tamaños de bulto.
  cp_origen: z.string().trim().max(8).default(''),
  peso_defecto_gramos: z.number().int().min(1).max(25000).default(300),
  bultos: z.array(Bulto).min(1).max(8).default(BULTOS_POR_DEFECTO),
  // Portada de la tienda: lista de secciones publicada (null = el diseño de siempre) y el borrador en edición.
  portada_secciones: Portada.nullable().default(null),
  portada_borrador: Portada.nullable().default(null),
  // Menú de la cabecera (null = el que arma la tienda sola con las categorías y colecciones).
  cabecera: Cabecera.nullable().default(null),
  // Textos editados de las plantillas de email (por tipo); lo que no está usa el texto original.
  plantillas_email: z
    .record(z.string().max(40), z.object({ asunto: z.string().trim().max(150), texto: z.string().trim().min(1).max(3000) }))
    .default({}),
  // Logo de la tienda: clave del archivo en KV (vacío = se usa el nombre en texto).
  logo_clave: z.string().trim().max(80).default(''),
  // Favicon (el iconito de la pestaña) y nombre de la tienda en el título de cada página.
  favicon_clave: z.string().trim().max(80).default(''),
  titulo_tienda: z.string().trim().min(1).max(60).default('Sukhä'),
  // Portada y pie de la tienda.
  barra_anuncios: z.string().trim().max(200).default(''),
  // Modo vacaciones: la tienda se ve, pero no toma pedidos. El mensaje sale en un cartel arriba de todo.
  vacaciones_activo: z.boolean().default(false),
  vacaciones_mensaje: z.string().trim().max(200).default(''),
  // Estadísticas de visitas sin cookies (Cloudflare Web Analytics): el código del sitio. Vacío = sin estadísticas.
  analytics_token: z.string().trim().regex(/^[a-f0-9]{32}$/i, '32 letras y números, como lo da Cloudflare').or(z.literal('')).default(''),
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

// Con `items`, el precio de Correo Argentino puede ser el real del carrito (si MiCorreo está configurado).
// Datos para actualizar los precios de las zonas desde la calculadora de Shipy.
export const ActualizarPrecios = z.object({
  origen: z.number().int().min(1000).max(9999),
  // Uno de los tramos de peso: se consulta y se aplica de a uno.
  pesoGramos: z.union([z.literal(1000), z.literal(3000), z.literal(5000), z.literal(10000)]),
  // Andreani de Shipy es la tarifa pública (más baja que la oficial): por defecto solo se actualiza Correo.
  incluirAndreani: z.boolean().default(false),
  margen: z.number().min(0).max(100),
  redondeo: z.number().int().min(1).max(10000).default(100),
});

export const CotizarEnvio = z.object({ codigoPostal, items: z.array(z.object({ varianteId: id, cantidad: z.number().int().min(1).max(20) })).max(30).optional() });

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
export const NOTA_CLIENTA_MAX = 300;

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
  // Nota para la tienda («es para regalo»): se ve en el panel y en el remito. No es el señuelo de abajo.
  nota: textoOpcional(NOTA_CLIENTA_MAX),
  comentarioExtra: senuelo,
  // Solo si pide factura con CUIT.
  cuit: z.string().trim().regex(/^\d{11}$/, 'CUIT de 11 números').nullish(),
  condicionIva: z.enum(['consumidor_final', 'monotributo', 'responsable_inscripto', 'exento']).nullish(),
});
export type DatosPedido = z.infer<typeof NuevoPedido>;

export const Suscripcion = z.object({ email: contacto.email, comentarioExtra: senuelo });

// Carrito abandonado: lo manda el checkout al seguir de un paso. Nombre y teléfono llegan recién en el paso 2.
export const CarritoAbandonado = z.object({
  email: contacto.email,
  nombre: contacto.nombre.nullish(),
  telefono: contacto.telefono.nullish().catch(null),
  items,
  comentarioExtra: senuelo,
});
export const TextoPlantilla = z.object({ asunto: z.string().trim().max(150), texto: z.string().trim().min(1, 'el texto no puede quedar vacío').max(3000) });
export const EstadoCarrito = z.object({ estado: z.enum(['sin_contactar', 'contactada']) });

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
  // En un reembolso: si la plata se devuelve desde acá, por Mercado Pago.
  devolverPlata: z.boolean().default(false),
});

export const EdicionPedido = z.object({
  numeroSeguimiento: textoOpcional(80).optional(),
  facturaNumero: textoOpcional(40).optional(),
  notaInterna: textoOpcional(1000).optional(),
});

// Venta cargada a mano (WhatsApp, Instagram): como un pedido de la tienda, pero sin DNI ni señuelo, con el email opcional
// y con el envío y un descuento que se pueden poner a mano. `pagado`: ya pagó (transferencia o efectivo en el local).
export const NuevaVentaManual = z
  .object({
    claveIdempotencia: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
    canal: z.enum(['whatsapp', 'instagram', 'otro']),
    items,
    nombre: contacto.nombre,
    telefono: contacto.telefono,
    email: contacto.email.nullish(),
    entrega,
    envioCentavos: centavos.nullish(),
    descuentoCentavos: centavos.nullish(),
    metodoPago: z.enum(['mercadopago', 'transferencia']),
    pagado: z.boolean().default(false),
    notaInterna: textoOpcional(1000),
  })
  .refine((d) => !d.pagado || d.metodoPago === 'transferencia', { path: ['pagado'], message: 'solo con transferencia o efectivo' });
export type DatosVentaManual = z.infer<typeof NuevaVentaManual>;

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
