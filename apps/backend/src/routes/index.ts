import { Hono } from 'hono';
import type { AppEnv } from '../config';
import { salud } from '../controllers/publico.controller';
import { adminRoutes } from './admin.routes';
import { tiendaRoutes } from './tienda.routes';

export const routes = new Hono<AppEnv>();

routes.get('/health', salud);
routes.route('/admin', adminRoutes);
routes.route('/', tiendaRoutes);
