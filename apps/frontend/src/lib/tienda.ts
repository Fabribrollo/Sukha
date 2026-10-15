// Lado servidor de la tienda: pide los datos a la API por el binding interno (ver api.ts).
// Los tipos y las utilidades de formato viven en formato.ts, que también se usa en el navegador.
import { leer } from './api';
import type { Filtros, Tienda } from './formato';

export * from './formato';

// Datos que necesitan la cabecera y el pie de todas las páginas. Se piden una sola vez por visita:
// el layout y la página que lo usa comparten la misma respuesta.
const pedidos = new WeakMap<Request, Promise<{ tienda: Tienda; filtros: Filtros }>>();
export function datosDeLaTienda(request: Request) {
  let datos = pedidos.get(request);
  if (!datos) {
    datos = Promise.all([leer<Tienda>(request, '/api/tienda'), leer<Filtros>(request, '/api/catalogo/filtros')]).then(([tienda, filtros]) => ({ tienda, filtros }));
    pedidos.set(request, datos);
  }
  return datos;
}
