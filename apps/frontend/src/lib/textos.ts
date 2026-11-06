// Textos de las páginas de información y legales (Quiénes somos, Preguntas frecuentes, Cambios, Arrepentimiento,
// Contacto, Privacidad y Términos). Se editan en el panel (Textos de la tienda); lo que no se editó usa el texto de acá.
// El texto es plano con un formato mínimo, nunca HTML:
//   - una línea en blanco separa párrafos; "## Título" es un subtítulo; las líneas que empiezan con "- " son una lista;
//   - **negrita**, [texto](https://… o /ruta) para un link, y {{variable}} para un dato de Configuración;
//   - [COMPLETAR: …] o [CONTADOR: …] marcan algo pendiente: se ven resaltados y el panel avisa que faltan.
// Se usa en el servidor y en el panel; no importar nada que dependa de cloudflare:workers.
import type { Tienda } from './formato';

export type Pregunta = { pregunta: string; respuesta: string };

// ───────────── Variables ─────────────

// Cada variable con lo que ve la dueña en el panel y dónde se carga si falta. `opcional` = vacía no es un faltante
// (las frases que dependen de algo que puede estar apagado, como las cuotas).
type Variable = { descripcion: string; dondeSeCarga: string; valor: (t: Tienda) => string; opcional?: boolean };
// `comercio` puede faltar si la tienda se publica antes que el backend que lo manda: se toma como vacío.
const conArroba = (usuario: string) => (usuario ? `@${usuario.replace(/^@/, '')}` : '');
export const VARIABLES: Record<string, Variable> = {
  razon_social: { descripcion: 'Nombre y apellido o razón social', dondeSeCarga: 'Configuración › Datos del comercio', valor: (t) => t.comercio?.razonSocial ?? '' },
  cuit: { descripcion: 'CUIT', dondeSeCarga: 'Configuración › Datos del comercio', valor: (t) => t.comercio?.cuit ?? '' },
  condicion_fiscal: { descripcion: 'Condición fiscal', dondeSeCarga: 'Configuración › Datos del comercio', valor: (t) => t.comercio?.condicionFiscal ?? '' },
  domicilio: { descripcion: 'Domicilio del comercio', dondeSeCarga: 'Configuración › Datos del comercio', valor: (t) => t.comercio?.domicilio ?? '' },
  horario_atencion: { descripcion: 'Horario de consultas y reclamos', dondeSeCarga: 'Configuración › Datos del comercio', valor: (t) => t.comercio?.horarioAtencion ?? '' },
  responsable_atencion: { descripcion: 'Quién responde los reclamos', dondeSeCarga: 'Configuración › Datos del comercio', valor: (t) => t.comercio?.responsableAtencion ?? '' },
  email: { descripcion: 'Email de contacto', dondeSeCarga: 'Configuración › Tienda', valor: (t) => t.emailContacto },
  whatsapp: { descripcion: 'WhatsApp', dondeSeCarga: 'Configuración › Tienda', valor: (t) => t.whatsapp },
  instagram: { descripcion: 'Instagram', dondeSeCarga: 'Configuración › Tienda', valor: (t) => conArroba(t.instagram) },
  horas_reserva: { descripcion: 'Horas para transferir', dondeSeCarga: 'Configuración › Reserva de stock', valor: (t) => String(t.reservaTransferenciaHoras) },
  minutos_reserva: { descripcion: 'Minutos para pagar con Mercado Pago', dondeSeCarga: 'Configuración › Reserva de stock', valor: (t) => String(t.reservaMercadoPagoMinutos) },
  horario_retiro: { descripcion: 'Horario de retiro en el local', dondeSeCarga: 'Envíos › Retiro en persona', valor: (t) => t.retiro?.horario ?? '' },
  aviso_descuento: {
    descripcion: 'Frase del descuento por transferencia (vacía si no hay)',
    dondeSeCarga: 'Configuración › Pagos',
    opcional: true,
    valor: (t) => (t.descuentoTransferenciaPorcentaje > 0 ? `Si pagás por transferencia tenés un ${t.descuentoTransferenciaPorcentaje} % de descuento, que ya ves aplicado en el checkout.` : ''),
  },
  aviso_cuotas: {
    descripcion: 'Frase de las cuotas sin interés (vacía si están apagadas)',
    dondeSeCarga: 'Configuración › Pagos',
    opcional: true,
    valor: (t) => (t.cuotasSinInteres ? `Con tarjeta de crédito podés pagar en ${t.cuotasSinInteres.cantidad} cuotas sin interés.` : ''),
  },
};

// ───────────── Formato ─────────────

export type Parte = { texto: string; negrita?: boolean; href?: string; falta?: boolean };
export type Bloque = { tipo: 'titulo'; partes: Parte[] } | { tipo: 'lista'; items: Parte[][] } | { tipo: 'parrafo'; lineas: Parte[][] };

const MARCAS = /\{\{\s*([a-z_]+)\s*\}\}|\*\*(.+?)\*\*|\[([^\]\n]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)|\[((?:COMPLETAR|CONTADOR)[^\]\n]*)\]/g;

// Parte una línea en pedazos: texto suelto, negritas, links, variables y marcas de pendiente.
function partesDe(linea: string, tienda: Tienda): Parte[] {
  const partes: Parte[] = [];
  let desde = 0;
  for (const m of linea.matchAll(MARCAS)) {
    if (m.index > desde) partes.push({ texto: linea.slice(desde, m.index) });
    const [todo, variable, negrita, textoLink, href, pendiente] = m;
    if (variable !== undefined) {
      const v = VARIABLES[variable];
      const valor = v?.valor(tienda) ?? '';
      if (valor) partes.push({ texto: valor });
      else if (!v) partes.push({ texto: todo });
      else if (!v.opcional) partes.push({ texto: `[a completar: ${v.descripcion}]`, falta: true });
    } else if (negrita !== undefined) partes.push(...partesDe(negrita, tienda).map((p) => ({ ...p, negrita: true })));
    else if (href !== undefined) partes.push({ texto: textoLink, href });
    else partes.push({ texto: `[${pendiente}]`, falta: true });
    desde = m.index + todo.length;
  }
  if (desde < linea.length) partes.push({ texto: linea.slice(desde) });
  return partes;
}

const vacia = (partes: Parte[]) => partes.every((p) => !p.texto.trim());

export function bloquesDe(texto: unknown, tienda: Tienda): Bloque[] {
  if (typeof texto !== 'string') return [];
  const bloques: Bloque[] = [];
  for (const crudo of texto.split(/\r?\n\s*\r?\n/)) {
    const lineas = crudo.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    // "## Título" arriba de un párrafo, sin línea en blanco en el medio, también vale.
    while (lineas[0]?.startsWith('## ')) bloques.push({ tipo: 'titulo', partes: partesDe(lineas.shift()!.slice(3), tienda) });
    if (!lineas.length) continue;
    if (lineas.every((l) => l.startsWith('- '))) {
      const items = lineas.map((l) => partesDe(l.slice(2), tienda)).filter((p) => !vacia(p));
      if (items.length) bloques.push({ tipo: 'lista', items });
    } else {
      const conTexto = lineas.map((l) => partesDe(l, tienda)).filter((p) => !vacia(p));
      if (conTexto.length) bloques.push({ tipo: 'parrafo', lineas: conTexto });
    }
  }
  return bloques;
}

// Lo que falta completar en un texto: datos vacíos de Configuración y marcas [COMPLETAR]/[CONTADOR]. Para el panel.
export function faltantesDe(texto: unknown, tienda: Tienda): string[] {
  if (typeof texto !== 'string') return [];
  const faltan = new Set<string>();
  for (const m of texto.matchAll(MARCAS)) {
    const [, variable, negrita, , , pendiente] = m;
    if (variable !== undefined) {
      const v = VARIABLES[variable];
      if (v && !v.opcional && !v.valor(tienda)) faltan.add(`${v.descripcion} (en ${v.dondeSeCarga})`);
    } else if (negrita !== undefined) faltantesDe(negrita, tienda).forEach((f) => faltan.add(f));
    else if (pendiente !== undefined) faltan.add(pendiente.replace(/^(COMPLETAR|CONTADOR):?\s*/, (_, quien) => (quien === 'CONTADOR' ? 'Lo confirma el contador: ' : '')));
  }
  return [...faltan];
}

// ───────────── Preguntas frecuentes ─────────────

// En el panel se escriben como texto: la primera línea de cada bloque es la pregunta y las siguientes, la respuesta.
export const aPreguntas = (texto: string): Pregunta[] =>
  texto
    .split(/\r?\n\s*\r?\n/)
    .map((bloque) => bloque.trim())
    .filter(Boolean)
    .map((bloque) => {
      const [pregunta, ...resto] = bloque.split(/\r?\n/);
      return { pregunta: pregunta.trim(), respuesta: resto.join('\n').trim() };
    });
export const dePreguntas = (valor: unknown) =>
  Array.isArray(valor) ? valor.map((p: Pregunta) => `${p.pregunta}\n${p.respuesta}`).join('\n\n') : typeof valor === 'string' ? valor : '';

// ───────────── Textos originales ─────────────

const PREGUNTAS: Pregunta[] = [
  {
    pregunta: '¿Cómo compro?',
    respuesta:
      'Elegí la prenda, el talle y el color, agregala al carrito y completá tus datos y la forma de entrega. No hace falta crear una cuenta. Cuando terminás, te llega un email con el número de pedido y el enlace para seguirlo.',
  },
  {
    pregunta: '¿Cómo puedo pagar?',
    respuesta:
      'Con Mercado Pago (tarjetas de crédito y débito, dinero en cuenta y los demás medios que ofrece Mercado Pago, salvo pago en efectivo) o por transferencia bancaria. No aceptamos efectivo.\n{{aviso_descuento}}\n{{aviso_cuotas}}',
  },
  {
    pregunta: '¿Cuánto tiempo tengo para transferir?',
    respuesta:
      'Reservamos tu pedido durante {{horas_reserva}} horas. Los datos para transferir (alias, titular y monto) aparecen al terminar la compra y en el email del pedido. Mandanos el comprobante por WhatsApp con tu número de pedido. Si en ese plazo no recibimos el pago, el pedido se cancela solo y las prendas vuelven a estar disponibles.',
  },
  {
    pregunta: 'Pagué con Mercado Pago, ¿cuándo se confirma?',
    respuesta: 'Apenas Mercado Pago aprueba el pago, te llega un email de confirmación. Mientras pagás, reservamos las prendas durante {{minutos_reserva}} minutos.',
  },
  {
    pregunta: '¿Cómo se envían los pedidos?',
    respuesta: 'Enviamos a domicilio a todo el país por Correo Argentino o Andreani. También podés retirar sin costo en el local de {{domicilio}}.',
  },
  {
    pregunta: '¿Cuánto cuesta el envío y cuánto tarda?',
    respuesta:
      'El costo se calcula en el checkout según tu código postal y el peso del pedido. Despachamos en 1 a 3 días hábiles desde que se confirma el pago; después, el plazo depende del correo y de tu zona.',
  },
  {
    pregunta: '¿Cuándo puedo retirar en el local?',
    respuesta:
      'Cuando el pedido esté listo te avisamos por email. Podés retirarlo en este horario: {{horario_retiro}}. Traé tu DNI y el número de pedido. Si retira otra persona, avisanos antes por WhatsApp.',
  },
  {
    pregunta: '¿Cómo sigo mi pedido?',
    respuesta:
      'Con el enlace del email de confirmación o desde «Buscar mi pedido» con tu número de pedido y tu email. Cuando despachamos, te mandamos el número de seguimiento del correo.',
  },
  {
    pregunta: '¿Los talles son reales?',
    respuesta:
      'Cada prenda tiene su tabla de medidas. Te recomendamos medir una prenda parecida que te quede bien y compararla con la tabla. Si dudás entre dos talles, escribinos por WhatsApp y te ayudamos.',
  },
  { pregunta: '¿Puedo cambiar una prenda?', respuesta: 'Sí, tenés 30 días desde que la recibís. Mirá [Cambios y devoluciones](/cambios-y-devoluciones).' },
  {
    pregunta: 'Me arrepentí de la compra, ¿qué hago?',
    respuesta: 'Tenés 10 días corridos para arrepentirte, sin dar explicaciones. Usá el [Botón de arrepentimiento](/arrepentimiento) que está al pie de cada página.',
  },
  { pregunta: '¿Me dan factura?', respuesta: 'Sí. Somos monotributistas y emitimos factura C. Si necesitás que salga a nombre de tu CUIT, cargalo en el checkout.' },
  {
    pregunta: '¿Cómo me comunico con ustedes?',
    respuesta: 'Por WhatsApp al {{whatsapp}}, por email a {{email}} o en el local. Mirá [Contacto](/contacto) para los horarios.',
  },
];

const QUIENES_SOMOS = `Sukhä es una marca de ropa femenina para mujeres adultas. Tenemos local en {{domicilio}}, y vendemos online a todo el país.

[COMPLETAR: una o dos frases sobre la historia o el estilo de la marca. Por ejemplo: «Elegimos cada prenda pensando en que la uses mucho: telas lindas, cortes cómodos y talles reales».]

Podés comprar acá, pasar por el local o escribirnos por WhatsApp si tenés dudas con un talle.`;

const CAMBIOS = `## Cambios

- Tenés 30 días corridos desde que recibís el pedido para pedir un cambio de talle, color o prenda.
- La prenda tiene que estar sin uso, sin lavar y con su etiqueta.
- Para pedirlo, escribinos por WhatsApp o email con tu número de pedido.
- Podés traer la prenda al local de {{domicilio}}, o mandarla por correo. Te pasamos los datos para el envío.
- El envío del cambio por talle, color o gusto lo pagás vos (ida y vuelta). En el local el cambio no tiene costo.
- Si la prenda llegó con una falla o no es la que pediste, la cambiamos sin costo y nos hacemos cargo del envío.
- Los cambios dependen del stock. Si no hay el talle o color que buscás, podés elegir otra prenda o te devolvemos el dinero por el mismo medio de pago.
- Si la prenda nueva cuesta más, pagás la diferencia. Si cuesta menos, te devolvemos la diferencia o te la dejamos a favor, como prefieras.

## Prendas con falla

Si encontrás una falla, avisanos con una foto. Las prendas tienen la garantía que fija la ley, también después de los 30 días del cambio.

## Devolución del dinero

Si te arrepentís dentro de los 10 días, usá el [Botón de arrepentimiento](/arrepentimiento). Fuera de ese caso, devolvemos el dinero cuando no hay stock para hacer el cambio o cuando la prenda tiene una falla que no podemos resolver. El reintegro se hace por el mismo medio de pago: en Mercado Pago lo ves en tu cuenta o tarjeta según los plazos de tu banco, y por transferencia lo mandamos a la cuenta que nos indiques a tu nombre.`;

const ARREPENTIMIENTO = `Si compraste en esta tienda, tenés derecho a arrepentirte de la compra dentro de los 10 días corridos desde que recibiste el producto o desde que hiciste la compra, lo que pase último. No tenés que dar explicaciones ni crear una cuenta.

Completá el formulario con tu número de pedido y tu email. Dentro de las 24 horas te mandamos por email el código de tu solicitud y te explicamos cómo devolvernos la prenda.

- La prenda tiene que volver en el mismo estado en que la recibiste, sin uso y con su etiqueta.
- El costo de la devolución lo paga la tienda. Si estás en Neuquén, también podés traerla al local.
- Te devolvemos el total que pagaste, envío incluido, por el mismo medio de pago, apenas recibimos la prenda.

Si tenés dudas, escribinos por WhatsApp al {{whatsapp}} o a {{email}}, {{horario_atencion}}.`;

const CONTACTO = `## Consultas y reclamos

Atendemos consultas y reclamos por WhatsApp y por email, {{horario_atencion}}. La responsable de atención es {{responsable_atencion}}. Te respondemos dentro de las 24 horas hábiles. Si tu reclamo es por una compra, incluí el número de pedido.

Si no resolvemos tu reclamo, podés acudir a [Defensa de las y los consumidores](https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario) o a la oficina de Protección al Consumidor de Neuquén [CONTADOR: dirección y contacto vigentes].`;

const PRIVACIDAD = `Última actualización: [COMPLETAR: fecha de publicación].

## Quién es responsable de tus datos

{{razon_social}}, CUIT {{cuit}}, con domicilio en {{domicilio}}, es responsable de la base de datos de la tienda Sukhä. Para cualquier consulta sobre tus datos escribinos a {{email}}.

## Qué datos pedimos y para qué

- **Cuando comprás:** nombre, DNI, email, teléfono y, si elegís envío a domicilio, la dirección. Los usamos para preparar y enviar tu pedido, emitir la factura, avisarte cómo va y atender cambios, arrepentimientos o reclamos. Si pedís factura a nombre de tu CUIT, también guardamos el CUIT y tu condición frente al IVA.
- **Cuando empezás una compra y no la terminás:** si ya cargaste tu email en el checkout, guardamos el email, las prendas del carrito y el total (y tu nombre y teléfono si ya los habías cargado). Podemos escribirte una vez por email o WhatsApp para ayudarte a terminar la compra. Estos datos se borran a los 30 días.
- **Cuando te suscribís a novedades:** tu email, para mandarte lanzamientos y promociones. Es opcional y podés darte de baja cuando quieras con el enlace que está al pie de cada email.
- **Para proteger la tienda:** guardamos una huella cifrada de la dirección IP desde la que se hace un pedido (nunca la IP completa), para frenar pedidos falsos que retienen stock.

No te pedimos datos sensibles y no usamos tus datos para otra cosa que lo que dice esta política.

## Con quién los compartimos

No vendemos ni alquilamos tus datos. Solo los compartimos con los servicios que hacen falta para completar tu compra:

- Mercado Pago, para procesar el pago. Los datos de tu tarjeta los carga Mercado Pago; nosotros nunca los vemos.
- Correo Argentino o Andreani, para el envío (nombre, teléfono y dirección).
- Cloudflare, donde están alojadas la tienda y la base de datos, y Resend, que envía los emails de la tienda. Pueden guardar datos en servidores fuera de Argentina, con las medidas de seguridad que ofrecen.
- ARCA (ex AFIP), para emitir la factura, y las autoridades que lo pidan según la ley.

## Cuánto tiempo los guardamos

Los datos de los pedidos, el tiempo que exigen las normas fiscales y contables. Los carritos sin terminar, 30 días. El email de novedades, hasta que te des de baja.

## Cookies

La tienda usa solo las cookies y el almacenamiento del navegador necesarios para que funcione: el carrito y, para quien administra la tienda, la sesión del panel. No usamos cookies de publicidad.

## Tus derechos

Podés pedir acceso a tus datos, corregirlos, actualizarlos o pedir que los borremos escribiendo a {{email}} desde el email con el que compraste. Te respondemos dentro de los plazos de la Ley 25.326: 10 días corridos para el acceso y 5 días hábiles para la corrección o el borrado. No podemos borrar los datos que la ley nos obliga a guardar, como los de las facturas.

El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley Nº 25.326. La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley Nº 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.

## Seguridad

La tienda funciona con conexión cifrada (HTTPS), el acceso al panel está protegido con contraseña y bloqueo por intentos fallidos, y solo la administración de Sukhä puede ver los pedidos.

## Cambios en esta política

Si cambiamos esta política, publicamos la versión nueva en esta página con su fecha.`;

const TERMINOS = `Última actualización: [COMPLETAR: fecha de publicación].

## 1. Quiénes somos

Esta tienda online es de {{razon_social}}, CUIT {{cuit}}, {{condicion_fiscal}}, con domicilio en {{domicilio}}, y contacto en {{email}} y por WhatsApp al {{whatsapp}}. Al comprar aceptás estos términos. Para todo lo que no esté acá rigen la Ley 24.240 de Defensa del Consumidor y el Código Civil y Comercial.

## 2. Productos y fotos

Mostramos cada prenda con sus fotos, medidas, materiales y precio. Los colores pueden verse un poco distintos según la pantalla. Si la prenda que recibís no coincide con la descripción, la cambiamos o te devolvemos el dinero sin costo.

## 3. Precios

Los precios están en pesos argentinos y son finales: incluyen los impuestos. El costo de envío se suma aparte y lo ves antes de pagar. Las promociones y cupones valen por el plazo y las condiciones que se indiquen en cada caso; un cupón no se puede canjear por dinero.

## 4. Stock y reserva

El stock es compartido con el local. Al confirmar el pedido reservamos las prendas: {{minutos_reserva}} minutos si pagás con Mercado Pago y {{horas_reserva}} horas si elegís transferencia. Si el pago no llega en ese plazo, el pedido se cancela solo y te avisamos por email. Si por un error no tenemos una prenda que ya pagaste, te avisamos enseguida y elegís entre otra prenda o la devolución total de lo pagado.

## 5. Pago

Aceptamos Mercado Pago y transferencia bancaria. No aceptamos efectivo. El pedido se confirma cuando el pago está acreditado. Los pagos con Mercado Pago se rigen también por sus propias condiciones.

## 6. Envío y retiro

Enviamos a domicilio a todo el país por Correo Argentino o Andreani, o podés retirar en el local de {{domicilio}}. Despachamos dentro de los 1 a 3 días hábiles desde la confirmación del pago; el plazo de entrega lo fija el correo y es estimado. Te mandamos el número de seguimiento al despachar. Si el paquete se pierde o llega dañado, nos ocupamos del reclamo con el correo y te reenviamos la prenda o te devolvemos el dinero. Revisá que la dirección esté completa: si el correo no puede entregar por un dato equivocado, coordinamos con vos un nuevo envío.

## 7. Factura

Emitimos factura C por cada compra y te la mandamos por email. Si la necesitás a nombre de tu CUIT, cargalo en el checkout.

## 8. Cambios y devoluciones

Tenés 30 días para cambiar una prenda, según la política de [Cambios y devoluciones](/cambios-y-devoluciones). Las prendas tienen la garantía legal por fallas.

## 9. Derecho de arrepentimiento

Podés arrepentirte de la compra dentro de los 10 días corridos desde que recibiste el producto o desde la compra, lo que pase último, sin dar explicaciones y sin costo, con el [Botón de arrepentimiento](/arrepentimiento) que está al pie de cada página. Dentro de las 24 horas te mandamos el código de la solicitud. La prenda tiene que volver en el mismo estado en que la recibiste. Te devolvemos el total pagado por el mismo medio de pago.

## 10. Consultas y reclamos

Atendemos por WhatsApp y email, {{horario_atencion}}. También podés reclamar ante Defensa del Consumidor desde el enlace del pie, en la jurisdicción de tu domicilio.

## 11. Datos personales

Tratamos tus datos según nuestra [Política de privacidad](/privacidad) y la Ley 25.326.

## 12. Cambios en estos términos

Podemos actualizar estos términos. Los cambios no afectan las compras ya hechas: cada compra se rige por los términos vigentes el día en que la hiciste.`;

// Cada texto editable: clave en la configuración, nombre en el panel y página donde se ve.
export const TEXTOS = [
  { clave: 'contenido_quienes_somos', nombre: 'Quiénes somos', ruta: '/quienes-somos', original: QUIENES_SOMOS },
  { clave: 'contenido_preguntas_frecuentes', nombre: 'Preguntas frecuentes', ruta: '/preguntas-frecuentes', original: PREGUNTAS },
  { clave: 'contenido_politica_cambios', nombre: 'Cambios y devoluciones', ruta: '/cambios-y-devoluciones', original: CAMBIOS },
  { clave: 'contenido_arrepentimiento', nombre: 'Botón de arrepentimiento', ruta: '/arrepentimiento', original: ARREPENTIMIENTO },
  { clave: 'contenido_contacto', nombre: 'Contacto: consultas y reclamos', ruta: '/contacto', original: CONTACTO },
  { clave: 'contenido_privacidad', nombre: 'Política de privacidad', ruta: '/privacidad', original: PRIVACIDAD },
  { clave: 'contenido_terminos', nombre: 'Términos y condiciones', ruta: '/terminos', original: TERMINOS },
] as const;
export type ClaveTexto = (typeof TEXTOS)[number]['clave'];

// El texto que se publica: lo guardado en el panel o, si no hay nada (o se borró todo), el original.
export function textoDe(clave: 'contenido_preguntas_frecuentes', contenido: Record<string, unknown>): Pregunta[];
export function textoDe(clave: ClaveTexto, contenido: Record<string, unknown>): string;
export function textoDe(clave: ClaveTexto, contenido: Record<string, unknown>): string | Pregunta[] {
  const guardado = contenido[clave];
  const original = TEXTOS.find((t) => t.clave === clave)!.original;
  if (clave === 'contenido_preguntas_frecuentes') {
    // Se guardan como lista; antes se guardaban como texto (una pregunta por bloque), y eso se sigue leyendo.
    const lista = (Array.isArray(guardado) ? (guardado as Pregunta[]) : typeof guardado === 'string' ? aPreguntas(guardado) : []).filter((q) => q?.pregunta && q?.respuesta);
    return lista.length ? lista : (original as Pregunta[]);
  }
  return typeof guardado === 'string' && guardado.trim() ? guardado : (original as string);
}
