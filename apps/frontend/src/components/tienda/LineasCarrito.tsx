// Lista de prendas del carrito, con foto, talle, color, cantidad y botón para quitar.
// La usan el carrito lateral y la página del carrito. Los precios son los que devolvió el servidor, si ya respondió.
import { Minus, Plus, Trash2 } from 'lucide-preact';
import { cambiarCantidad, quitar, type Linea, type Validacion } from '../../lib/carrito';
import { pesos, urlFoto } from '../../lib/formato';

interface Props {
  lineas: Linea[];
  datos: Validacion | null;
  maxPorPedido: number;
}

export default function LineasCarrito({ lineas, datos, maxPorPedido }: Props) {
  const total = lineas.reduce((s, l) => s + l.cantidad, 0);
  return (
    <ul class="divide-linea divide-y">
      {lineas.map((l) => {
        // El precio del servidor manda; mientras no responde, se muestra el que se guardó.
        const precio = datos?.lineas.find((v) => v.varianteId === l.varianteId)?.precioCentavos ?? l.precioCentavos;
        const detalle = [l.talle && `Talle ${l.talle}`, l.color].filter(Boolean).join(' · ');
        return (
          <li key={l.varianteId} class="flex gap-3 py-4">
            <a href={`/producto/${l.slug}`} class="shrink-0">
              {l.foto ? <img src={urlFoto(l.foto, 'chico')} alt="" width={72} height={96} loading="lazy" class="rounded-tienda h-24 w-[72px] object-cover" /> : <span class="foto-vacia rounded-tienda block h-24 w-[72px]" />}
            </a>
            <div class="flex min-w-0 flex-1 flex-col">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <a href={`/producto/${l.slug}`} class="line-clamp-2 text-sm leading-5 font-medium hover:underline">
                    {l.nombre}
                  </a>
                  {detalle && <p class="text-suave mt-0.5 text-xs">{detalle}</p>}
                </div>
                <button type="button" onClick={() => quitar(l.varianteId)} class="boton-icono -mt-2 -mr-2 size-9 shrink-0" title={`Quitar ${l.nombre}`} aria-label={`Quitar ${l.nombre}`}>
                  <Trash2 class="size-4" aria-hidden="true" />
                </button>
              </div>
              <div class="mt-auto flex items-end justify-between gap-2 pt-2">
                <div class="border-linea rounded-tienda flex items-center border" role="group" aria-label={`Cantidad de ${l.nombre}`}>
                  <button type="button" class="boton-icono size-9" onClick={() => cambiarCantidad(l.varianteId, l.cantidad - 1)} title="Una menos" aria-label="Una menos">
                    <Minus class="size-3.5" aria-hidden="true" />
                  </button>
                  <span class="w-8 text-center text-sm tabular-nums" aria-live="polite">
                    {l.cantidad}
                  </span>
                  <button type="button" class="boton-icono size-9" onClick={() => cambiarCantidad(l.varianteId, l.cantidad + 1)} disabled={total >= maxPorPedido} title={total >= maxPorPedido ? `Máximo ${maxPorPedido} prendas por pedido` : 'Una más'} aria-label="Una más">
                    <Plus class="size-3.5" aria-hidden="true" />
                  </button>
                </div>
                <p class="text-right">
                  <span class="block text-sm font-semibold tabular-nums">{pesos(precio * l.cantidad)}</span>
                  {l.cantidad > 1 && <span class="text-suave block text-xs tabular-nums">{pesos(precio)} c/u</span>}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
