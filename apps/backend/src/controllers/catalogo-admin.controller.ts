import type { Context } from 'hono';
import { type AppEnv, conectar } from '../config';
import * as catalogo from '../services/catalogo-admin.service';
import { editarImagen, eliminarImagen, ordenarImagenes, subirImagen } from '../services/imagenes.service';
import * as portada from '../services/portada.service';
import { ErrorApp } from '../utils/errores';
import { cuerpo, idDe } from '../utils/http';
import * as v from '../validations/catalogo.validation';

type C = Context<AppEnv>;

export const listarCategorias = async (c: C) => c.json(await catalogo.listarCategorias(conectar(c.env)));
export const crearCategoria = async (c: C) =>
  c.json(await catalogo.crearCategoria(conectar(c.env), await cuerpo(c, v.NuevaCategoria)), 201);
export const ordenarCategorias = async (c: C) =>
  c.json(await catalogo.ordenarCategorias(conectar(c.env), (await cuerpo(c, v.OrdenCategorias)).ids));
export const editarCategoria = async (c: C) =>
  c.json(await catalogo.editarCategoria(conectar(c.env), idDe(c), await cuerpo(c, v.EdicionCategoria)));

export const listarColecciones = async (c: C) => c.json(await catalogo.listarColecciones(conectar(c.env)));
export const crearColeccion = async (c: C) =>
  c.json(await catalogo.crearColeccion(conectar(c.env), await cuerpo(c, v.NuevaColeccion)), 201);
export const editarColeccion = async (c: C) =>
  c.json(await catalogo.editarColeccion(conectar(c.env), idDe(c), await cuerpo(c, v.EdicionColeccion)));

export const listarProductos = async (c: C) =>
  c.json(await catalogo.listarProductos(conectar(c.env), { estado: c.req.query('estado'), q: c.req.query('q') }));
export const obtenerProducto = async (c: C) => c.json(await catalogo.obtenerProducto(conectar(c.env), idDe(c)));
export const crearProducto = async (c: C) =>
  c.json(await catalogo.crearProducto(conectar(c.env), await cuerpo(c, v.NuevoProducto)), 201);
export const editarProducto = async (c: C) =>
  c.json(await catalogo.editarProducto(conectar(c.env), idDe(c), await cuerpo(c, v.EdicionProducto)));
export const sugerencias = async (c: C) => c.json(await catalogo.sugerencias(c.env.DB));
export const eliminarProducto = async (c: C) => c.json({ resultado: await catalogo.eliminarProducto(c.env.DB, c.env.IMAGENES, idDe(c)) });
export const duplicarProducto = async (c: C) => c.json(await catalogo.duplicarProducto(conectar(c.env), idDe(c)), 201);

export const crearVariante = async (c: C) =>
  c.json(
    await catalogo.crearVariante(c.env.DB, conectar(c.env), c.var.adminId, idDe(c), await cuerpo(c, v.NuevaVariante)),
    201,
  );
export const editarVariante = async (c: C) =>
  c.json(await catalogo.editarVariante(conectar(c.env), idDe(c), await cuerpo(c, v.EdicionVariante)));
export const moverStock = async (c: C) =>
  c.json(await catalogo.moverStock(c.env.DB, c.var.adminId, idDe(c), await cuerpo(c, v.MovimientoStock)));
export const movimientosDeVariante = async (c: C) => c.json(await catalogo.movimientosDeVariante(c.env.DB, idDe(c)));

// La foto llega como formulario con tres archivos (chico, mediano, grande) y, opcionales, colorId y textoAlternativo.
export async function subirFoto(c: C) {
  const form = await c.req.formData().catch(() => null);
  if (!form) throw new ErrorApp(400, 'Se esperaba un formulario con los archivos de la foto.');
  const colorId = Number(form.get('colorId')) || null;
  const textoAlternativo = String(form.get('textoAlternativo') ?? '').trim().slice(0, 200) || null;
  return c.json(await subirImagen(c.env.IMAGENES, conectar(c.env), idDe(c), form, { colorId, textoAlternativo }), 201);
}
export const ordenarFotos = async (c: C) =>
  c.json(await ordenarImagenes(conectar(c.env), idDe(c), (await cuerpo(c, v.OrdenImagenes)).ids));
export const agregarAColeccion = async (c: C) =>
  c.json(await catalogo.agregarProductosAColeccion(conectar(c.env), idDe(c), (await cuerpo(c, v.ProductosDeColeccion)).productoIds));
export const quitarDeColeccion = async (c: C) =>
  c.json(await catalogo.quitarProductoDeColeccion(conectar(c.env), idDe(c), idDe(c, 'productoId')));
export const editarFoto = async (c: C) =>
  c.json(await editarImagen(conectar(c.env), idDe(c), await cuerpo(c, v.EdicionImagen)));
export async function eliminarFoto(c: C) {
  await eliminarImagen(c.env.IMAGENES, conectar(c.env), idDe(c));
  return c.json({ ok: true });
}

// ───────────── Banners de la portada ─────────────
export const listarBanners = async (c: C) => c.json(await portada.listarBanners(conectar(c.env)));

// Formulario con el archivo "escritorio" (y opcional "movil") más enlace, textoAlternativo, desde y hasta.
export async function crearBanner(c: C) {
  const form = await c.req.formData().catch(() => null);
  if (!form) throw new ErrorApp(400, 'Se esperaba un formulario con la imagen del banner.');
  const campo = (nombre: string) => String(form.get(nombre) ?? '').trim() || null;
  const datos = v.DatosBanner.safeParse({
    textoAlternativo: campo('textoAlternativo'),
    enlace: campo('enlace'),
    desde: campo('desde'),
    hasta: campo('hasta'),
  });
  if (!datos.success) throw new ErrorApp(400, `${datos.error.issues[0].path.join('.')}: ${datos.error.issues[0].message}`);
  return c.json(await portada.crearBanner(c.env.IMAGENES, conectar(c.env), form, datos.data), 201);
}
export const editarBanner = async (c: C) =>
  c.json(await portada.editarBanner(conectar(c.env), idDe(c), await cuerpo(c, v.EdicionBanner)));
export async function eliminarBanner(c: C) {
  await portada.eliminarBanner(c.env.IMAGENES, conectar(c.env), idDe(c));
  return c.json({ ok: true });
}
