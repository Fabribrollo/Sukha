import { z } from 'zod';
import { booleano, centavos, fechaIso, id, slug, texto, textoOpcional } from './comunes';

// Textos para buscadores: vacíos se arman solos.
const seo = { seoTitulo: textoOpcional(70).optional(), seoDescripcion: textoOpcional(200).optional() };

export const NuevaCategoria = z.object({
  nombre: texto(60),
  slug: slug.optional(),
  ...seo,
  // Tabla de medidas de ese tipo de prenda; se guarda como JSON.
  guiaTalles: z.unknown().optional(),
  orden: z.number().int().optional(),
  activa: booleano.optional(),
  // Categoría de la que cuelga (null = categoría principal). Solo hay un nivel de subcategorías.
  padreId: id.nullable().optional(),
});
export const EdicionCategoria = NuevaCategoria.partial();
// Ids de categorías hermanas en el orden nuevo (todas principales, o todas hijas del mismo padre).
export const OrdenCategorias = z.object({ ids: z.array(id).min(1).max(200) });

export const NuevaColeccion = z.object({ nombre: texto(60), slug: slug.optional(), activa: booleano.optional(), ...seo });
export const EdicionColeccion = NuevaColeccion.partial();

export const NuevoProducto = z
  .object({
    categoriaId: id,
    nombre: texto(120),
    slug: slug.optional(),
    descripcion: textoOpcional(5000),
    materialIds: z.array(id).max(10).optional(),
    marcaId: id.nullish(),
    cuidados: textoOpcional(500),
    precioCentavos: centavos.positive(),
    precioOfertaCentavos: centavos.positive().nullish(),
    pesoGramos: z.number().int().positive().nullish(),
    // Aparece en la sección de destacados de la portada.
    destacado: booleano.optional(),
    coleccionIds: z.array(id).max(20).optional(),
  })
  .refine((p) => p.precioOfertaCentavos == null || p.precioOfertaCentavos < p.precioCentavos, {
    path: ['precioOfertaCentavos'],
    message: 'el precio de oferta tiene que ser menor al precio',
  });

// Carga rápida: varios productos con sus variantes, todo en un solo pedido. Nacen como borrador.
const VarianteDeLote = z.object({ talleId: id.nullish(), colorId: id.nullish(), stock: z.number().int().min(0).max(100000) });
const ProductoDeLote = z.object({
  nombre: texto(120),
  categoriaId: id,
  marcaId: id.nullish(),
  materialIds: z.array(id).max(10).optional(),
  coleccionIds: z.array(id).max(20).optional(),
  precioCentavos: centavos.positive(),
  pesoGramos: z.number().int().positive().nullish(),
  variantes: z.array(VarianteDeLote).min(1).max(40),
});
export const NuevoLote = z
  .object({ productos: z.array(ProductoDeLote).min(1).max(60) })
  .refine((l) => l.productos.reduce((n, p) => n + p.variantes.length, 0) <= 600, { path: ['productos'], message: 'son demasiadas variantes en un solo lote (máximo 600)' })
  .refine(
    (l) => l.productos.every((p) => new Set(p.variantes.map((v) => `${v.talleId ?? 0}-${v.colorId ?? 0}`)).size === p.variantes.length),
    { path: ['productos'], message: 'hay un producto con la misma combinación de talle y color repetida' },
  );

export const EdicionProducto = z.object({
  categoriaId: id.optional(),
  nombre: texto(120).optional(),
  slug: slug.optional(),
  descripcion: textoOpcional(5000).optional(),
  materialIds: z.array(id).max(10).optional(),
  marcaId: id.nullable().optional(),
  cuidados: textoOpcional(500).optional(),
  precioCentavos: centavos.positive().optional(),
  precioOfertaCentavos: centavos.positive().nullable().optional(),
  pesoGramos: z.number().int().positive().nullable().optional(),
  destacado: booleano.optional(),
  coleccionIds: z.array(id).max(20).optional(),
  estado: z.enum(['borrador', 'publicado', 'oculto']).optional(),
  ...seo,
  // Foto para compartir en redes: la clave de una de sus fotos (null = la primera).
  seoImagen: z.string().regex(/^productos\/\d+\/[0-9a-f-]{36}$/).nullable().optional(),
});

// Redirección cargada a mano: direcciones internas de la tienda (no del panel ni de la API).
const rutaDeTienda = z
  .string()
  .trim()
  .max(300)
  .transform((r) => (r.length > 1 ? r.replace(/\/+$/, '') : r))
  .refine((r) => /^\/(?!\/)[^\s?#]*$/.test(r) && !/^\/(api|admin)(\/|$)/.test(r), 'tiene que ser una dirección de la tienda que empiece con /');
export const NuevaRedireccion = z.object({ desde: rutaDeTienda, hacia: rutaDeTienda, tipo: z.union([z.literal(301), z.literal(302)]).default(301) });

export const NuevaVariante = z.object({
  talleId: id.nullish(),
  colorId: id.nullish(),
  sku: texto(40).optional(),
  stock: z.number().int().nonnegative().default(0),
});
export const EdicionVariante = z.object({ sku: texto(40).optional(), activa: booleano.optional() });

// carga y venta_local van en positivo (unidades que entran o que se vendieron en el local);
// ajuste lleva signo: -1 corrige de más, +1 corrige de menos.
export const MovimientoStock = z
  .object({
    tipo: z.enum(['carga', 'ajuste', 'venta_local']),
    cantidad: z.number().int().refine((n) => n !== 0, 'no puede ser 0'),
    nota: textoOpcional(200),
  })
  .refine((m) => m.tipo === 'ajuste' || m.cantidad > 0, { path: ['cantidad'], message: 'tiene que ser positiva' });

export const OrdenImagenes = z.object({ ids: z.array(id).min(1).max(50) });
// Se acepta un producto o varios a la vez (el panel agrega de a muchos).
export const ProductosDeColeccion = z.object({ productoIds: z.array(id).min(1).max(500) });

export const EdicionImagen = z.object({
  orden: z.number().int().optional(),
  textoAlternativo: textoOpcional(200).optional(),
  colorId: id.nullable().optional(),
});

// Solo rutas internas de la tienda ("/categoria/vestidos"): un banner no puede mandar a otro sitio.
const enlaceInterno = z
  .string()
  .trim()
  .max(200)
  .regex(/^\/(?!\/)[^\s\\]*$/, 'tiene que ser una ruta interna que empiece con /')
  .nullable();
const vigencia = (b: { desde?: string | null; hasta?: string | null }) => !b.desde || !b.hasta || b.desde < b.hasta;

export const DatosBanner = z
  .object({
    textoAlternativo: textoOpcional(200),
    enlace: enlaceInterno.optional(),
    desde: fechaIso.nullish(),
    hasta: fechaIso.nullish(),
  })
  .refine(vigencia, { path: ['hasta'], message: 'tiene que ser posterior a "desde"' });

export const EdicionBanner = z
  .object({
    textoAlternativo: textoOpcional(200).optional(),
    enlace: enlaceInterno.optional(),
    orden: z.number().int().optional(),
    activo: booleano.optional(),
    desde: fechaIso.nullable().optional(),
    hasta: fechaIso.nullable().optional(),
  })
  .refine(vigencia, { path: ['hasta'], message: 'tiene que ser posterior a "desde"' });
