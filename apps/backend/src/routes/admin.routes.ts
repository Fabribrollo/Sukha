import { Hono } from 'hono';
import type { AppEnv } from '../config';
import { login, logout, yo } from '../controllers/auth.controller';
import * as catalogo from '../controllers/catalogo-admin.controller';
import * as tienda from '../controllers/tienda-admin.controller';
import { agregarColor, agregarTalle, listar } from '../controllers/opciones.controller';
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
adminRoutes.post('/colores', agregarColor);

// Catálogo
adminRoutes.get('/categorias', catalogo.listarCategorias);
adminRoutes.post('/categorias', catalogo.crearCategoria);
adminRoutes.put('/categorias/orden', catalogo.ordenarCategorias);
adminRoutes.patch('/categorias/:id', catalogo.editarCategoria);
adminRoutes.get('/colecciones', catalogo.listarColecciones);
adminRoutes.post('/colecciones', catalogo.crearColeccion);
adminRoutes.patch('/colecciones/:id', catalogo.editarColeccion);
adminRoutes.post('/colecciones/:id/productos', catalogo.agregarAColeccion);
adminRoutes.delete('/colecciones/:id/productos/:productoId', catalogo.quitarDeColeccion);
adminRoutes.get('/productos', catalogo.listarProductos);
adminRoutes.post('/productos', catalogo.crearProducto);
adminRoutes.get('/productos/sugerencias', catalogo.sugerencias);
adminRoutes.get('/productos/:id', catalogo.obtenerProducto);
adminRoutes.patch('/productos/:id', catalogo.editarProducto);
adminRoutes.delete('/productos/:id', catalogo.eliminarProducto);
adminRoutes.post('/productos/:id/duplicar', catalogo.duplicarProducto);
adminRoutes.post('/productos/:id/variantes', catalogo.crearVariante);
adminRoutes.post('/productos/:id/imagenes', catalogo.subirFoto);
adminRoutes.put('/productos/:id/imagenes/orden', catalogo.ordenarFotos);
adminRoutes.patch('/variantes/:id', catalogo.editarVariante);
adminRoutes.post('/variantes/:id/stock', catalogo.moverStock);
adminRoutes.get('/variantes/:id/movimientos', catalogo.movimientosDeVariante);
adminRoutes.patch('/imagenes/:id', catalogo.editarFoto);
adminRoutes.delete('/imagenes/:id', catalogo.eliminarFoto);

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
adminRoutes.get('/pedidos/:id', tienda.verPedido);
adminRoutes.patch('/pedidos/:id', tienda.editarPedido);
adminRoutes.post('/pedidos/:id/estado', tienda.cambiarEstado);
adminRoutes.get('/solicitudes', tienda.listarSolicitudes);
adminRoutes.patch('/solicitudes/:id', tienda.editarSolicitud);

// Reportes y clientas
adminRoutes.get('/resumen', tienda.verResumen);
adminRoutes.get('/clientas', tienda.listarClientas);
adminRoutes.get('/clientas/exportar', tienda.exportarClientas);
