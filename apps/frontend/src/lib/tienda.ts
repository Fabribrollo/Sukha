// Lado servidor de la tienda: pide los datos a la API por el binding interno (ver api.ts).
// Los tipos y las utilidades de formato viven en formato.ts, que también se usa en el navegador.
import { leerDelBorde } from './api';
import type { Filtros, Tienda } from './formato';

export * from './formato';

// Lecturas iguales para todas las visitas, en dos capas: la memoria del isolate (gratis, pero con poco tráfico casi siempre
// está vacía) y la caché del borde de Cloudflare (ver leerDelBorde), compartida por todas las visitas del mismo centro de
// datos. La memoria vence cuando vence la copia del borde, así un cambio del panel tarda como mucho `segundos` en verse.
// Si la renovación falla y había datos de antes, se siguen usando esos (un corte momentáneo del backend no se nota) y se
// vuelve a intentar a los 10 segundos. Si nunca hubo datos, falla y no queda guardado el error: el próximo pedido reintenta.
function compartido<T>(ruta: string, segundos: number) {
  let guardado: { vence: number; datos: Promise<T> } | null = null;
  return (request: Request) => {
    if (!guardado || guardado.vence < Date.now()) {
      const anterior = guardado?.datos;
      const nuevo = {
        vence: Date.now() + segundos * 1000,
        datos: leerDelBorde<T>(request, ruta, segundos).then(({ datos, pedidoEn }) => {
          nuevo.vence = pedidoEn + segundos * 1000;
          return datos;
        }),
      };
      nuevo.datos = nuevo.datos.catch((e) => {
        if (guardado === nuevo) guardado = anterior ? { vence: Date.now() + 10_000, datos: anterior } : null;
        if (!anterior) throw e;
        return anterior;
      });
      guardado = nuevo;
    }
    return guardado.datos;
  };
}

// Datos que necesitan la cabecera y el pie de todas las páginas (textos de la tienda y el menú de categorías).
// Se guardan un minuto: la base está lejos y así casi ninguna página los espera. Un cambio del panel se ve en la tienda
// en menos de un minuto.
const tienda = compartido<Tienda>('/api/tienda', 60);
const filtros = compartido<Filtros>('/api/catalogo/filtros', 60);
// Menú de la cabecera ya armado por el panel (Tienda → Cabecera). Si falla, la cabecera queda con lo básico.
export type EntradaMenu = {
  id: string;
  tipo: 'enlace' | 'panel' | 'colecciones';
  dispositivo: 'todos' | 'escritorio' | 'celular';
  texto: string;
  href: string;
  hijas?: { nombre: string; href: string }[];
  tarjetas?: { titulo: string; href: string; imagen: string | null }[];
};
export type MenuCabecera = { items: EntradaMenu[]; tarjetasMovil: { titulo: string; href: string; imagen: string | null }[] };
const cabecera = compartido<MenuCabecera>('/api/cabecera', 60);
export const datosDeLaTienda = (request: Request) =>
  Promise.all([tienda(request), filtros(request), cabecera(request).catch((): MenuCabecera => ({ items: [], tarjetasMovil: [] }))]).then(([tienda, filtros, menu]) => ({ tienda, filtros, menu }));

// La portada publicada se guarda 30 segundos. (La vista previa del borrador nunca pasa por acá.)
const portada = compartido<unknown>('/api/portada', 30);
export const portadaPublicada = <T>(request: Request) => portada(request) as Promise<T>;
