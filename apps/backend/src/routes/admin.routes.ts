import { Hono } from 'hono';
import type { AppEnv } from '../config';
import { login, logout, yo } from '../controllers/auth.controller';
import * as catalogo from '../controllers/catalogo-admin.controller';
import * as tienda from '../controllers/tienda-admin.controller';
import { agregarColor, agregarMarca, agregarMaterial, agregarTalle, cambiarColor, cambiarTalle, listar, ordenarColores, ordenarTalles } from '../controllers/opciones.controller';
import { limiteLogin, mismoOrigen, requiereSesion } from '../middlewares/acceso.middleware';

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use('*', mismoOrigen);
adminRoutes.post('/login', limiteLogin, login);

// Todo lo que sigue exige sesión vigente.
adminRoutes.use('*', requiereSesion);
adminRoutes.post('/logout', logout);
adminRoutes.get('/yo', yo);

// Talles y colores
adminRoutes.get('/opciones', listar);
adminRoutes.post('/talles', agregarTalle);
adminRoutes.put('/talles/orden', ordenarTalles);
adminRoutes.patch('/talles/:id', cambiarTalle);
adminRoutes.post('/colores', agregarColor);
adminRoutes.put('/colores/orden', ordenarColores);
adminRoutes.patch('/colores/:id', cambiarColor);
adminRoutes.post('/marcas', agregarMarca);
adminRoutes.post('/materiales', agregarMaterial);

// Catálogo
adminRoutes.get('/categorias', catalogo.listarCategorias);
adminRoutes.post('/categorias', catalogo.crearCategoria);
adminRoutes.put('/categorias/orden', catalogo.ordenarCategorias);
adminRoutes.patch('/categorias/:id', catalogo.editarCategoria);
adminRoutes.delete('/categorias/:id', catalogo.eliminarCategoria);
adminRoutes.post('/envios/precios/vista-previa', catalogo.vistaPreviaPrecios);
adminRoutes.post('/envios/precios/aplicar', catalogo.aplicarPrecios);
adminRoutes.get('/cabecera', catalogo.verCabecera);
adminRoutes.put('/cabecera', catalogo.guardarCabecera);
adminRoutes.delete('/cabecera', catalogo.restaurarCabecera);
adminRoutes.put('/cabecera/borrador', catalogo.guardarBorradorCabecera);
adminRoutes.delete('/cabecera/borrador', catalogo.descartarBorradorCabecera);
adminRoutes.post('/cabecera/publicar', catalogo.publicarCabecera);
adminRoutes.get('/portada', catalogo.verPortadas);
adminRoutes.put('/portada/borrador', catalogo.guardarBorradorPortada);
adminRoutes.post('/portada/imagen', catalogo.subirImagenDePortada);
adminRoutes.delete('/portada/borrador', catalogo.descartarBorradorPortada);
adminRoutes.post('/portada/publicar', catalogo.publicarPortada);
adminRoutes.post('/categorias/:id/imagen', catalogo.subirImagenCategoria);
adminRoutes.delete('/categorias/:id/imagen', catalogo.quitarImagenCategoria);
adminRoutes.post('/logo', catalogo.subirLogoTienda);
adminRoutes.delete('/logo', catalogo.quitarLogoTienda);
adminRoutes.post('/favicon', catalogo.subirFaviconTienda);
adminRoutes.delete('/favicon', catalogo.quitarFaviconTienda);
adminRoutes.get('/colecciones', catalogo.listarColecciones);
adminRoutes.post('/colecciones', catalogo.crearColeccion);
adminRoutes.patch('/colecciones/:id', catalogo.editarColeccion);
adminRoutes.delete('/colecciones/:id', catalogo.eliminarColeccion);
adminRoutes.post('/colecciones/:id/productos', catalogo.agregarAColeccion);
adminRoutes.delete('/colecciones/:id/productos/:productoId', catalogo.quitarDeColeccion);
adminRoutes.get('/productos', catalogo.listarProductos);
adminRoutes.post('/productos', catalogo.crearProducto);
adminRoutes.post('/productos/lote', catalogo.crearProductosEnLote);
adminRoutes.get('/productos/sugerencias', catalogo.sugerencias);
adminRoutes.get('/productos/conteos', catalogo.conteosProductos);
adminRoutes.get('/productos/exportar', catalogo.exportarStock);
adminRoutes.get('/productos/:id', catalogo.obtenerProducto);
adminRoutes.patch('/productos/:id', catalogo.editarProducto);
adminRoutes.delete('/productos/:id', catalogo.eliminarProducto);
adminRoutes.post('/productos/:id/duplicar', catalogo.duplicarProducto);
adminRoutes.post('/productos/:id/variantes', catalogo.crearVariante);
adminRoutes.post('/productos/:id/imagenes', catalogo.subirFoto);
adminRoutes.put('/productos/:id/imagenes/orden', catalogo.ordenarFotos);
adminRoutes.patch('/variantes/:id', catalogo.editarVariante);
adminRoutes.delete('/variantes/:id', catalogo.borrarVariante);
adminRoutes.post('/variantes/:id/stock', catalogo.moverStock);
adminRoutes.get('/variantes/:id/movimientos', catalogo.movimientosDeVariante);
adminRoutes.patch('/imagenes/:id', catalogo.editarFoto);
adminRoutes.put('/imagenes/:id/archivos', catalogo.reencuadrarFoto);
adminRoutes.get('/imagenes/:id/original', catalogo.originalDeFoto);
adminRoutes.delete('/imagenes/:id', catalogo.eliminarFoto);

// Redirecciones
adminRoutes.get('/redirecciones', catalogo.verRedirecciones);
adminRoutes.post('/redirecciones', catalogo.agregarRedireccion);
adminRoutes.delete('/redirecciones/:id', catalogo.quitarRedireccion);

// Banners de la portada
adminRoutes.get('/banners', catalogo.listarBanners);
adminRoutes.post('/banners', catalogo.crearBanner);
adminRoutes.patch('/banners/:id', catalogo.editarBanner);
adminRoutes.delete('/banners/:id', catalogo.eliminarBanner);

// Envíos
adminRoutes.get('/zonas', tienda.listarZonas);
adminRoutes.post('/zonas', tienda.crearZona);
adminRoutes.patch('/zonas/:id', tienda.editarZona);
adminRoutes.post('/zonas/:id/rangos', tienda.agregarRango);
adminRoutes.delete('/rangos/:id', tienda.eliminarRango);

// Promociones
adminRoutes.get('/promociones', tienda.listarPromociones);
adminRoutes.post('/promociones', tienda.crearPromocion);
adminRoutes.patch('/promociones/:id', tienda.editarPromocion);

// Cupones
adminRoutes.get('/cupones', tienda.listarCupones);
adminRoutes.post('/cupones', tienda.crearCupon);
adminRoutes.patch('/cupones/:id', tienda.editarCupon);

// Configuración y textos de la tienda
adminRoutes.get('/configuracion', tienda.verConfiguracion);
adminRoutes.put('/configuracion/:clave', tienda.guardarClave);

// Pedidos y post-venta
adminRoutes.get('/pedidos', tienda.listarPedidos);
adminRoutes.get('/pedidos/exportar', tienda.exportarPedidos);
adminRoutes.get('/pedidos/prendas', tienda.prendasParaVender);
adminRoutes.post('/pedidos', tienda.crearVentaManual);
adminRoutes.get('/pedidos/conteos', tienda.conteosPedidos);
adminRoutes.get('/pedidos/:id', tienda.verPedido);
adminRoutes.patch('/pedidos/:id', tienda.editarPedido);
adminRoutes.post('/pedidos/:id/estado', tienda.cambiarEstado);
adminRoutes.get('/solicitudes', tienda.listarSolicitudes);
adminRoutes.patch('/solicitudes/:id', tienda.editarSolicitud);

// Reportes y clientas
adminRoutes.get('/resumen', tienda.verResumen);
adminRoutes.get('/reportes', tienda.verReporte);
adminRoutes.get('/carritos', tienda.listarCarritos);
adminRoutes.get('/plantillas', tienda.listarPlantillas);
adminRoutes.put('/plantillas/:tipo', tienda.guardarPlantilla);
adminRoutes.delete('/plantillas/:tipo', tienda.restaurarPlantilla);
adminRoutes.post('/plantillas/:tipo/vista-previa', tienda.vistaPreviaPlantilla);
adminRoutes.post('/plantillas/:tipo/prueba', tienda.probarPlantilla);
adminRoutes.patch('/carritos/:id', tienda.marcarCarrito);
adminRoutes.get('/reportes/exportar', tienda.exportarReporte);
adminRoutes.get('/clientas', tienda.listarClientas);
adminRoutes.get('/clientas/exportar', tienda.exportarClientas);
