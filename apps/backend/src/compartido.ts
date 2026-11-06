// Tipos de las respuestas públicas de la API y reglas que también usa la tienda (apps/frontend los importa desde acá).
// Así, si cambia una respuesta, el backend no compila hasta que el tipo cambie, y la tienda se entera al compilar.
// Este archivo no importa nada: la tienda lo puede usar en el servidor y en el navegador sin arrastrar código del backend.

// ───────────── Pedidos ─────────────
export type EstadoPedido =
  | 'pendiente_pago'
  | 'pagado'
  | 'en_preparacion'
  | 'enviado'
  | 'listo_para_retirar'
  | 'entregado'
  | 'cancelado'
  | 'reembolsado'
  | 'a_revisar';
export type MetodoEntrega = 'domicilio' | 'sucursal' | 'retiro';
export type MetodoPago = 'mercadopago' | 'transferencia';
// Por dónde llegó el pedido: la tienda o una venta cargada a mano en el panel.
export type CanalPedido = 'web' | 'whatsapp' | 'instagram' | 'otro';
// Una venta manual sin email guarda uno inventado con este final (el dominio .invalid no existe): no se le mandan emails.
export const SIN_EMAIL = '@sin-email.invalid';
export const sinEmail = (email: string) => email.endsWith(SIN_EMAIL);

// Máquina de estados del pedido. Antes del pago la única salida es cancelar; después solo avanza o se reembolsa.
// "a_revisar" es para pagos que llegaron y no se pudieron aplicar solos (reserva vencida sin stock, monto distinto):
// un pedido en ese estado nunca tiene stock reservado. El panel la usa para ofrecer los botones; el backend, para decidir.
export const TRANSICIONES: Record<EstadoPedido, EstadoPedido[]> = {
  pendiente_pago: ['pagado', 'cancelado'],
  pagado: ['en_preparacion', 'reembolsado'],
  en_preparacion: ['enviado', 'listo_para_retirar', 'reembolsado'],
  enviado: ['entregado', 'reembolsado'],
  listo_para_retirar: ['entregado', 'reembolsado'],
  entregado: ['reembolsado'],
  cancelado: ['pagado', 'a_revisar'],
  a_revisar: ['pagado', 'reembolsado', 'cancelado'],
  reembolsado: [],
};

// GET /api/pedidos/:token: lo que ve la clienta en la página de seguimiento (sin notas internas ni datos de pago).
export type Seguimiento = {
  numero: string;
  estado: EstadoPedido;
  creadoEn: string;
  nombre: string;
  metodoEntrega: MetodoEntrega;
  numeroSeguimiento: string | null;
  metodoPago: MetodoPago;
  subtotalCentavos: number;
  descuentoCentavos: number;
  envioCentavos: number;
  totalCentavos: number;
  reservaVenceEn: string | null;
  items: { id: number; nombre: string; talle: string | null; color: string | null; precioUnitarioCentavos: number; cantidad: number }[];
  descuentos: { descripcion: string; montoCentavos: number }[];
  historial: { estado: EstadoPedido; fecha: string }[];
  transferencia: { alias: string; titular: string; montoCentavos: number } | null;
  retiro: { direccion: string; horario: string } | null;
};

// ───────────── Catálogo ─────────────
// Textos para buscadores cargados en el panel (vacíos = se arman solos).
export type Seo = { titulo: string | null; descripcion: string | null };

// GET /api/catalogo/filtros
export type Filtros = {
  // Categorías principales con sus subcategorías (solo las visibles). `imagen` es la clave de la foto de la categoría.
  categorias: { nombre: string; slug: string; imagen?: string | null; seo?: Seo; hijas: { nombre: string; slug: string; imagen?: string | null; seo?: Seo }[] }[];
  colecciones: { nombre: string; slug: string; imagen?: string | null; seoTitulo?: string | null; seoDescripcion?: string | null }[];
  talles: { id: number; nombre: string; orden: number }[];
  colores: { id: number; nombre: string; hex: string | null }[];
  precio: { min: number; max: number };
};

export type TarjetaDeProducto = {
  id: number;
  nombre: string;
  slug: string;
  precioCentavos: number;
  precioOfertaCentavos: number | null;
  categoria: string;
  foto: string | null;
  disponible: number;
  // Cuándo se cargó y cuántas unidades quedan en total: la tienda arma las etiquetas «Nuevo» y «Últimas unidades».
  creadoEn: string;
  unidades: number;
  // Promoción 2x1 o 3x2 vigente.
  combo: '2x1' | '3x2' | null;
  // Códigos hex de los colores de sus variantes, separados por coma (null = sin colores).
  colores?: string | null;
};

// GET /api/catalogo/productos
export type Listado = { productos: TarjetaDeProducto[]; total: number; pagina: number; porPagina: number };

export type VarianteDeProducto = { id: number; talle: string | null; color: string | null; colorId: number | null; hex: string | null; stock: number };
export type FotoDeProducto = { clave: string; colorId: number | null; textoAlternativo: string | null };

// GET /api/catalogo/productos/:slug
export type FichaDeProducto = {
  id: number;
  nombre: string;
  slug: string;
  descripcion: string | null;
  material: string | null;
  cuidados: string | null;
  seoTitulo?: string | null;
  seoDescripcion?: string | null;
  seoImagen?: string | null;
  precioCentavos: number;
  precioOfertaCentavos: number | null;
  combo: '2x1' | '3x2' | null;
  categoria: string;
  categoriaSlug: string;
  // Categoría principal, si la del producto es una subcategoría.
  categoriaPadre: { nombre: string; slug: string } | null;
  // Texto (o, en datos viejos, un objeto) con las medidas de la categoría.
  guiaTalles: unknown;
  variantes: VarianteDeProducto[];
  imagenes: FotoDeProducto[];
  relacionados: TarjetaDeProducto[];
};

// ───────────── WhatsApp a la clienta (panel) ─────────────
// Celulares de Argentina para wa.me: 549 + característica + número (10 cifras), sin 0 ni 15. Acepta lo que escriba la
// clienta («0351 15-555-1234», «+54 9 11 …»). Si no da 10 cifras devuelve null: mejor sin botón que escribirle a otra persona.
export function telefonoWhatsapp(telefono: string | null | undefined) {
  // Las características argentinas empiezan con 1, 2 o 3: un 9 adelante es el de celular.
  let n = String(telefono ?? '').replace(/\D/g, '').replace(/^54/, '').replace(/^9/, '').replace(/^0/, '');
  if (n.length === 12) n = n.replace(/^(\d{2,4})15/, '$1');
  return n.length === 10 ? `549${n}` : null;
}

export type DatosWhatsapp = {
  tienda: string;
  nombre: string;
  numero: string;
  estado: EstadoPedido;
  linkSeguimiento: string;
  numeroSeguimiento: string | null;
  transporte: string | null; // nombre para mostrar («Correo Argentino»)
  retiro: { direccion: string; horario: string };
};

// Texto según el estado del pedido (null si el estado no tiene uno propio) y uno genérico para cualquier momento.
export function textosWhatsapp(p: DatosWhatsapp) {
  const hola = `¡Hola ${p.nombre.trim().split(/\s+/)[0]}! Te escribimos de ${p.tienda}`;
  const porEstado: Partial<Record<EstadoPedido, string>> = {
    pagado: `${hola}. Ya recibimos el pago de tu pedido ${p.numero} y lo estamos preparando. Te avisamos cuando esté listo.`,
    enviado: [
      `${hola}. Tu pedido ${p.numero} ya salió${p.transporte ? ` por ${p.transporte}` : ''}.`,
      p.numeroSeguimiento && `Número de seguimiento: ${p.numeroSeguimiento}.`,
      `Lo podés seguir acá: ${p.linkSeguimiento}`,
    ]
      .filter(Boolean)
      .join(' '),
    listo_para_retirar: [
      `${hola}. Tu pedido ${p.numero} ya está listo para retirar${p.retiro.direccion ? ` en ${p.retiro.direccion}` : ''}.`,
      p.retiro.horario && `Horarios: ${p.retiro.horario}.`,
    ]
      .filter(Boolean)
      .join(' '),
  };
  porEstado.en_preparacion = porEstado.pagado;
  return { estado: porEstado[p.estado] ?? null, generico: `${hola} por tu pedido ${p.numero}. ` };
}
