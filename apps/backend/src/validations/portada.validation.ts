import { z } from 'zod';

// Portada de la tienda como lista ordenada de secciones (guardada como JSON en `configuracion`).
// Reglas: máximo 20 secciones, textos como texto plano (nunca HTML) y enlaces solo internos (se arman en la tienda desde slugs).
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(120);
// Los títulos van sin punto final.
const titulo = z.string().trim().max(80).transform((t) => t.replace(/\.+$/, ''));
// Enlace de un botón: ruta de la tienda ("/coleccion/verano") o https a otro sitio (mapas, redes). Vacío = sin botón.
const enlace = z.string().trim().max(200).regex(/^(\/(?!\/)[^\s\\]*|https:\/\/[^\s]+)?$/, 'tiene que ser una ruta de la tienda (con /) o una dirección https').default('');
// Foto subida desde el editor: clave del archivo en KV (vacío = sin foto).
const imagen = z.string().trim().max(80).regex(/^(portada\/[a-z0-9-]+)?$/).default('');
const texto = (max: number) => z.string().trim().max(max).default('');
// dispositivo: en qué pantallas se muestra la sección (el diseño del celular y el de la computadora no siempre son el mismo).
const base = { id: z.string().regex(/^[a-z0-9]{4,16}$/), visible: z.boolean().default(true), dispositivo: z.enum(['todos', 'escritorio', 'celular']).default('todos') };

// De dónde salen los productos de una sección.
export const FuenteProductos = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('destacados') }),
  z.object({ tipo: z.literal('nuevos') }),
  z.object({ tipo: z.literal('ofertas') }),
  z.object({ tipo: z.literal('coleccion'), slug }),
  z.object({ tipo: z.literal('categoria'), slug }),
  z.object({ tipo: z.literal('seleccion'), ids: z.array(z.number().int().positive()).max(24) }),
]);

export const Seccion = z.discriminatedUnion('tipo', [
  z.object({ ...base, tipo: z.literal('carrusel') }),
  z.object({
    ...base,
    tipo: z.literal('categorias'),
    titulo,
    columnas: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(6)]).default(3),
    conFoto: z.boolean().default(true),
    // Vacío = todas las categorías principales visibles.
    categorias: z.array(slug).max(24).default([]),
    // Título distinto en la portada para una categoría (no cambia su nombre en el resto de la tienda).
    titulos: z.record(slug, z.string().trim().max(40)).default({}),
    // Enlace «Ver todo →» a la derecha del título.
    verTodos: z.boolean().default(false),
  }),
  z.object({
    ...base,
    tipo: z.literal('productos'),
    titulo,
    fuente: FuenteProductos,
    cantidad: z.union([z.literal(3), z.literal(6), z.literal(9), z.literal(12)]).default(6),
    verTodos: z.boolean().default(true),
  }),
  // Piezas fijas del diseño: cada una con sus textos y su foto editables.
  // tono: color del texto sobre la foto (oscuro para fotos claras, claro para fotos oscuras).
  z.object({ ...base, tipo: z.literal('campana'), imagen, etiqueta: texto(40), titulo, boton: texto(30), enlace, tono: z.enum(['oscuro', 'claro']).default('oscuro') }),
  // Hero «Moda real»: en escritorio dos looks a la vez que rotan, con un enlace a la categoría de cada uno abajo (Costados 3);
  // en el celular, la tapa con el primer look y un botón (Premium 2). Las fotos van recortadas, sin fondo.
  z.object({
    ...base,
    tipo: z.literal('hero'),
    titulo,
    etiqueta: texto(40),
    producto: texto(60),
    boton: texto(30),
    enlace,
    looks: z.array(z.object({ imagen, descripcion: texto(120), categoria: texto(40), enlace })).min(1).max(3),
  }),
  z.object({ ...base, tipo: z.literal('coleccion'), imagen, etiqueta: texto(40), titulo, parrafo: texto(300), boton: texto(30), enlace }),
  z.object({ ...base, tipo: z.literal('columnas'), items: z.array(z.object({ titulo: texto(40), texto: texto(200) })).min(1).max(3) }),
  z.object({ ...base, tipo: z.literal('local'), imagen, etiqueta: texto(40), titulo, parrafo: texto(300), boton: texto(30), enlace, boton2: texto(30), enlace2: enlace,
    // Mapa del local: lugar, zoom y texto de la etiqueta (sin lugar, se usa la foto o queda el cuadro vacío).
    lat: z.number().min(-90).max(90).nullable().default(null),
    lng: z.number().min(-180).max(180).nullable().default(null),
    zoom: z.number().int().min(10).max(19).default(16),
    etiquetaMapa: texto(40),
  }),
  // Banda de color con una fila de prendas de una categoría (por ejemplo «Explorá · Chalecos»).
  z.object({ ...base, tipo: z.literal('banda'), etiqueta: texto(40), titulo, categoria: slug.or(z.literal('')).default(''), cantidad: z.union([z.literal(3), z.literal(6), z.literal(9)]).default(6), boton: texto(40) }),
  z.object({ ...base, tipo: z.literal('beneficios') }),
  z.object({ ...base, tipo: z.literal('texto'), titulo, parrafo: z.string().trim().max(600) }),
  z.object({ ...base, tipo: z.literal('newsletter') }),
  z.object({ ...base, tipo: z.literal('separador') }),
]);
export type Seccion = z.infer<typeof Seccion>;

export const Portada = z
  .object({ version: z.literal(1).default(1), secciones: z.array(Seccion).max(20) })
  .refine((p) => new Set(p.secciones.map((s) => s.id)).size === p.secciones.length, { message: 'hay secciones con el mismo id', path: ['secciones'] });
export type Portada = z.infer<typeof Portada>;

// El diseño de hoy: sin portada guardada, la tienda se ve así.
export const PORTADA_POR_DEFECTO: Portada = {
  version: 1,
  secciones: [
    { id: 'carrusel', tipo: 'carrusel', visible: true, dispositivo: 'todos' as const },
    { id: 'categorias', tipo: 'categorias', visible: true, dispositivo: 'todos' as const, titulo: 'Categorías', columnas: 3, conFoto: true, categorias: [], titulos: {}, verTodos: false },
    { id: 'nuevos', tipo: 'productos', visible: true, dispositivo: 'todos' as const, titulo: 'Lo nuevo', fuente: { tipo: 'nuevos' }, cantidad: 6, verTodos: true },
    { id: 'beneficios', tipo: 'beneficios', visible: true, dispositivo: 'todos' as const },
    { id: 'newsletter', tipo: 'newsletter', visible: true, dispositivo: 'todos' as const },
  ],
};
