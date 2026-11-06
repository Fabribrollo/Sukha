// Plantillas de email editables desde el panel. Solo se edita el texto (asunto y cuerpo), nunca el HTML: el cuerpo es
// texto plano con párrafos separados por una línea en blanco y variables como {{nombre}}, que se reemplazan al enviar.
// Lo guardado vive en `configuracion` (clave plantillas_email); lo que no se editó usa el texto original de acá.
import { enPesos, escaparHtml as h } from '../utils/texto';
import type { Configuracion } from '../validations/tienda.validation';

export type Variable = { clave: string; descripcion: string; ejemplo: string };
type Definicion = { nombre: string; cuando: string; asunto: string; texto: string; variables: string[]; esMensaje?: boolean };

const VARIABLES: Record<string, Omit<Variable, 'clave'>> = {
  nombre: { descripcion: 'Nombre de la clienta', ejemplo: 'Ana' },
  numero: { descripcion: 'Número de pedido', ejemplo: 'SUK-0042' },
  total: { descripcion: 'Total del pedido', ejemplo: '$ 45.000,00' },
  link_seguimiento: { descripcion: 'Link para ver el pedido', ejemplo: 'ver mi pedido' },
  alias: { descripcion: 'Alias y titular para transferir', ejemplo: 'sukha.ropa (Sukhä SRL)' },
  horas_reserva: { descripcion: 'Horas de reserva por transferencia', ejemplo: '48' },
  minutos_reserva: { descripcion: 'Minutos de reserva con Mercado Pago', ejemplo: '30' },
  numero_seguimiento: { descripcion: 'Número de seguimiento del correo', ejemplo: 'CP123456789AR' },
  direccion_retiro: { descripcion: 'Dirección para retirar', ejemplo: 'Av. Colón 1234, Córdoba' },
  horario_retiro: { descripcion: 'Horario para retirar', ejemplo: 'Lunes a viernes de 10 a 18' },
  prendas: { descripcion: 'Prendas del carrito', ejemplo: 'Vestido Lino, Remera Básica' },
  link_carrito: { descripcion: 'Link que vuelve a armar el carrito', ejemplo: 'https://sukhaind.com.ar/recuperar/abc123' },
  codigo: { descripcion: 'Código de la solicitud de arrepentimiento', ejemplo: 'SUK-0042-A' },
};

const PEDIDO = ['nombre', 'numero', 'total', 'link_seguimiento'];
export const PLANTILLAS: Record<string, Definicion> = {
  pedido_recibido_transferencia: {
    nombre: 'Pedido recibido (transferencia)',
    cuando: 'Cuando hace un pedido para pagar por transferencia.',
    asunto: 'Recibimos tu pedido {{numero}}',
    texto:
      'Hola {{nombre}}, recibimos tu pedido {{numero}} por {{total}}.\n\nPara confirmarlo, transferí {{total}} al alias {{alias}} y envianos el comprobante indicando el número de pedido. Te reservamos las prendas por {{horas_reserva}} horas.\n\nPodés seguir tu pedido acá: {{link_seguimiento}}.',
    variables: [...PEDIDO, 'alias', 'horas_reserva'],
  },
  pedido_recibido_mercadopago: {
    nombre: 'Pedido recibido (Mercado Pago)',
    cuando: 'Cuando hace un pedido para pagar con Mercado Pago.',
    asunto: 'Recibimos tu pedido {{numero}}',
    texto:
      'Hola {{nombre}}, recibimos tu pedido {{numero}} por {{total}}.\n\nSi todavía no pagaste, podés hacerlo desde el seguimiento. Te reservamos las prendas por {{minutos_reserva}} minutos.\n\nPodés seguir tu pedido acá: {{link_seguimiento}}.',
    variables: [...PEDIDO, 'minutos_reserva'],
  },
  pago_aprobado: {
    nombre: 'Pago aprobado',
    cuando: 'Cuando se confirma el pago.',
    asunto: 'Pago aprobado: pedido {{numero}}',
    texto: 'Hola {{nombre}}, confirmamos el pago de tu pedido {{numero}}. Ya lo estamos preparando.\n\nSeguilo acá: {{link_seguimiento}}.',
    variables: PEDIDO,
  },
  pedido_enviado: {
    nombre: 'Pedido enviado',
    cuando: 'Cuando pasás el pedido a enviado.',
    asunto: 'Tu pedido {{numero}} está en camino',
    texto: 'Hola {{nombre}}, despachamos tu pedido {{numero}}.\n\nNúmero de seguimiento del correo: {{numero_seguimiento}}.\n\nMás detalle: {{link_seguimiento}}.',
    variables: [...PEDIDO, 'numero_seguimiento'],
  },
  listo_para_retirar: {
    nombre: 'Listo para retirar',
    cuando: 'Cuando el pedido está listo para retirar en el local.',
    asunto: 'Tu pedido {{numero}} está listo para retirar',
    texto: 'Hola {{nombre}}, tu pedido {{numero}} ya está listo.\n\nRetiralo en {{direccion_retiro}}. Horario: {{horario_retiro}}.',
    variables: [...PEDIDO, 'direccion_retiro', 'horario_retiro'],
  },
  pedido_cancelado: {
    nombre: 'Pedido cancelado',
    cuando: 'Cuando se cancela porque no llegó el pago a tiempo.',
    asunto: 'Tu pedido {{numero}} fue cancelado',
    texto: 'Hola {{nombre}}, tu pedido {{numero}} se canceló porque no recibimos el pago a tiempo y las prendas volvieron a estar disponibles.\n\nSi ya habías pagado, respondé este email y lo resolvemos.',
    variables: PEDIDO,
  },
  pedido_reembolsado: {
    nombre: 'Reembolso',
    cuando: 'Cuando registrás un reembolso.',
    asunto: 'Reembolso de tu pedido {{numero}}',
    texto: 'Hola {{nombre}}, registramos el reembolso de tu pedido {{numero}}. Puede tardar unos días en verse reflejado.',
    variables: PEDIDO,
  },
  // Obligatorio (Disp. 954/2025): la clienta recibe el código de su solicitud dentro de las 24 horas. Sale apenas la pide.
  arrepentimiento_recibido: {
    nombre: 'Arrepentimiento recibido',
    cuando: 'Cuando la clienta usa el botón de arrepentimiento.',
    asunto: 'Recibimos tu solicitud de arrepentimiento · Código {{codigo}}',
    texto:
      'Hola {{nombre}}: recibimos tu pedido de arrepentimiento de la compra {{numero}}. El código de tu solicitud es {{codigo}}; guardalo por si necesitás consultarnos.\n\nPara devolver la prenda, respondé este email o escribinos por WhatsApp y te pasamos los datos para mandarla por correo. Si estás en Neuquén, también podés traerla al local. El envío corre por nuestra cuenta.\n\nCuando la recibamos, te devolvemos {{total}} por el mismo medio de pago y te avisamos por este medio.',
    variables: ['nombre', 'numero', 'total', 'codigo'],
  },
  carrito_abandonado: {
    nombre: 'Carrito abandonado (email)',
    cuando: 'El que se abre en Gmail desde Carritos abandonados.',
    asunto: 'Tu carrito en Sukhä te espera',
    texto: 'Hola {{nombre}}! Vimos que dejaste en tu carrito {{prendas}}. Si querés terminar la compra, acá lo tenés listo: {{link_carrito}}\n\nCualquier duda, respondé este mensaje.\nSukhä',
    variables: ['nombre', 'prendas', 'link_carrito'],
    esMensaje: true,
  },
  carrito_whatsapp: {
    nombre: 'Carrito abandonado (WhatsApp)',
    cuando: 'El que se abre en WhatsApp desde Carritos abandonados.',
    asunto: '',
    texto: 'Hola {{nombre}}! Te escribimos de Sukhä: quedó tu carrito con {{prendas}}. Si querés, lo terminás acá: {{link_carrito}}',
    variables: ['nombre', 'prendas', 'link_carrito'],
    esMensaje: true,
  },
};
// Los pedidos recibidos se mandan con un solo tipo en la cola; la plantilla depende del medio de pago.
export const plantillaDelPedido = (tipo: string, metodoPago: string) => (tipo === 'pedido_recibido' ? `pedido_recibido_${metodoPago}` : tipo);

export type Guardadas = Partial<Record<string, { asunto: string; texto: string }>>;
export const textoDe = (tipo: string, guardadas: Guardadas | undefined) => guardadas?.[tipo] ?? { asunto: PLANTILLAS[tipo].asunto, texto: PLANTILLAS[tipo].texto };

// Valores de las variables. En HTML se escapan; los links van como enlaces.
export type Valores = Record<string, { texto: string; url?: string }>;
const reemplazar = (plantilla: string, valores: Valores, html: boolean) =>
  plantilla.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (todo, clave: string) => {
    const v = valores[clave];
    if (!v) return html ? h(todo) : todo;
    if (!html) return v.url ?? v.texto;
    return v.url ? `<a href="${h(v.url)}">${h(v.texto)}</a>` : `<strong>${h(v.texto)}</strong>`;
  });

export const asuntoCon = (asunto: string, valores: Valores) => reemplazar(asunto, valores, false);
export const textoCon = (texto: string, valores: Valores) => reemplazar(texto, valores, false);
// Párrafos separados por una línea en blanco; un salto simple es un <br>. El texto se escapa antes de los enlaces.
export function htmlDe(texto: string, valores: Valores) {
  return texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.split('\n').map((linea) => reemplazar(h(linea), valores, true)).join('<br>')}</p>`)
    .join('');
}

// Código de la solicitud de arrepentimiento: el número de pedido con una "A", así se encuentra fácil en el panel.
export const codigoArrepentimiento = (numero: string) => `${numero}-A`;

// Valores a partir de un pedido real.
export function valoresDelPedido(p: { nombre: string; numero: string; total_centavos: number; token_seguimiento: string; numero_seguimiento: string | null }, c: Configuracion, sitio: string): Valores {
  return {
    nombre: { texto: p.nombre },
    numero: { texto: p.numero },
    total: { texto: enPesos(p.total_centavos) },
    link_seguimiento: { texto: 'ver mi pedido', url: `${sitio}/pedido/${p.token_seguimiento}` },
    alias: { texto: `${c.alias_transferencia}${c.titular_transferencia ? ` (${c.titular_transferencia})` : ''}` },
    horas_reserva: { texto: String(c.reserva_transferencia_horas) },
    minutos_reserva: { texto: String(c.reserva_mercado_pago_minutos) },
    numero_seguimiento: { texto: p.numero_seguimiento ?? '' },
    direccion_retiro: { texto: c.retiro_direccion },
    horario_retiro: { texto: c.retiro_horario },
    codigo: { texto: codigoArrepentimiento(p.numero) },
  };
}

// Valores de ejemplo, para la vista previa y la prueba.
export const valoresDeEjemplo = (): Valores =>
  Object.fromEntries(Object.entries(VARIABLES).map(([k, v]) => [k, { texto: v.ejemplo, url: k.startsWith('link_') ? 'https://sukhaind.com.ar' : undefined }]));

export const variablesDe = (tipo: string): Variable[] => PLANTILLAS[tipo].variables.map((clave) => ({ clave, ...VARIABLES[clave] }));

// ───────────── Panel ─────────────
export const listarPlantillas = (guardadas: Guardadas) =>
  Object.entries(PLANTILLAS).map(([tipo, d]) => ({
    tipo,
    nombre: d.nombre,
    cuando: d.cuando,
    esMensaje: d.esMensaje ?? false,
    ...textoDe(tipo, guardadas),
    original: { asunto: d.asunto, texto: d.texto },
    modificada: Boolean(guardadas[tipo]),
    variables: variablesDe(tipo),
  }));
