import { z } from 'zod';

// Menú de la cabecera de la tienda (guardado como JSON en `configuracion`, clave «cabecera»). Es una lista ordenada de entradas:
// enlaces sueltos, categorías (con panel expandible de subcategorías y tarjetas con foto) y el panel de colecciones.
// Sin nada guardado, la tienda arma el menú sola con las categorías y colecciones visibles.
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(120);
const texto = (max: number) => z.string().trim().max(max).default('');
// Ruta de la tienda ("/categoria/vestidos") o https a otro sitio; vacío = sin enlace.
const enlace = z.string().trim().max(200).regex(/^(\/(?!\/)[^\s\\]*|https:\/\/[^\s]+)?$/, 'tiene que ser una ruta de la tienda (con /) o una dirección https').default('');
// Foto subida desde el panel (clave en KV, la misma que usa la portada); vacío = la de la categoría o colección.
const imagen = z.string().trim().max(80).regex(/^(portada\/[a-z0-9-]+)?$/).default('');
const base = {
  id: z.string().regex(/^[a-z0-9]{4,16}$/),
  visible: z.boolean().default(true),
  // En qué pantallas aparece la entrada.
  dispositivo: z.enum(['todos', 'escritorio', 'celular']).default('todos'),
};
// Una tarjeta con foto de un panel: a dónde lleva, su título (vacío = el nombre del destino) y su foto.
export const TarjetaMenu = z.object({ enlace, titulo: texto(40), imagen });

export const EntradaMenu = z.discriminatedUnion('tipo', [
  z.object({ ...base, tipo: z.literal('enlace'), texto: z.string().trim().min(1).max(30), enlace }),
  z.object({
    ...base,
    tipo: z.literal('categoria'),
    slug,
    // Vacío = el nombre de la categoría.
    texto: texto(30),
    // Subcategorías que se listan y en qué orden; vacío = todas, en el orden de siempre.
    subcategorias: z.array(slug).max(30).default([]),
    // Hasta dos tarjetas con foto; vacío = las dos primeras subcategorías que tengan foto.
    tarjetas: z.array(TarjetaMenu).max(2).default([]),
  }),
  z.object({
    ...base,
    tipo: z.literal('colecciones'),
    texto: z.string().trim().min(1).max(30).default('Colecciones'),
    // Colecciones que se muestran y en qué orden; vacío = todas.
    colecciones: z.array(slug).max(12).default([]),
    // Foto de cada colección (por slug); sin una, se usa la de su primer producto.
    imagenes: z.record(slug, imagen).default({}),
  }),
]);

export const Cabecera = z
  .object({
    version: z.literal(1).default(1),
    items: z.array(EntradaMenu).max(14),
    // Las dos tarjetas de la pantalla principal del menú del celular; vacío = las primeras subcategorías con foto.
    tarjetasMovil: z.array(TarjetaMenu).max(2).default([]),
  })
  .refine((c) => new Set(c.items.map((i) => i.id)).size === c.items.length, { message: 'hay entradas con el mismo id', path: ['items'] });
export type Cabecera = z.infer<typeof Cabecera>;
