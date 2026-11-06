import { Hono } from 'hono';
import type { AppEnv } from '../config';
import * as tienda from '../controllers/tienda.controller';
import { bodyLimit } from 'hono/body-limit';
import { MAX_BYTES_JSON } from '../config';
import { limiteCheckout, limitePedidos, limitePublico } from '../middlewares/acceso.middleware';

// Rutas públicas de la tienda.
export const tiendaRoutes = new Hono<AppEnv>();

// El aviso de Mercado Pago va primero y sin límite por IP: no se puede perder un aviso de pago.
tiendaRoutes.post('/webhooks/mercadopago', tienda.webhookMercadoPago);

tiendaRoutes.use('*', limitePublico, bodyLimit({ maxSize: MAX_BYTES_JSON }));

tiendaRoutes.get('/tienda', tienda.tienda);
tiendaRoutes.get('/portada', tienda.portada);
tiendaRoutes.get('/cabecera', tienda.cabecera);
tiendaRoutes.get('/redireccion', tienda.redireccion);
tiendaRoutes.get('/catalogo/filtros', tienda.filtros);
tiendaRoutes.get('/catalogo/productos', tienda.productos);
tiendaRoutes.get('/catalogo/sitemap', tienda.sitemap);
tiendaRoutes.get('/catalogo/productos/:slug', tienda.producto);

tiendaRoutes.get('/georef/localidades', tienda.georefLocalidades);
tiendaRoutes.get('/georef/calles', tienda.georefCalles);

tiendaRoutes.post('/envios/cotizar', tienda.cotizarEnvio);
tiendaRoutes.post('/carrito/validar', tienda.validarCarrito);

tiendaRoutes.post('/pedidos', limitePedidos, tienda.nuevoPedido);
tiendaRoutes.post('/pedidos/buscar', limiteCheckout, tienda.buscarPedido);
tiendaRoutes.get('/pedidos/:token', tienda.verSeguimiento);
tiendaRoutes.post('/pedidos/:token/pago', limiteCheckout, tienda.pagar);
tiendaRoutes.post('/pedidos/:token/solicitudes', limiteCheckout, tienda.nuevaSolicitud);

tiendaRoutes.post('/novedades', limiteCheckout, tienda.suscribirse);
tiendaRoutes.post('/carritos', limiteCheckout, tienda.avisarCarrito);
tiendaRoutes.get('/carritos/:codigo', limiteCheckout, tienda.verCarrito);
tiendaRoutes.post('/novedades/baja/:token', tienda.baja);
