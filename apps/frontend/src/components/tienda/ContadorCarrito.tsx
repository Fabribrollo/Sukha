// Bolsa del carrito en la cabecera, con la cantidad de prendas. Al tocarla abre el carrito lateral.
import { useStore } from '@nanostores/preact';
import { ShoppingBag } from 'lucide-preact';
import { cantidadTotal, carritoAbierto } from '../../lib/carrito';

export default function ContadorCarrito() {
  const cantidad = useStore(cantidadTotal);
  return (
    <button
      type="button"
      class="boton-icono"
      onClick={() => carritoAbierto.set(true)}
      title="Carrito"
      aria-label={cantidad ? `Carrito, ${cantidad} ${cantidad === 1 ? 'prenda' : 'prendas'}` : 'Carrito vacío'}
    >
      <ShoppingBag class="size-6" aria-hidden="true" />
      {cantidad > 0 && (
        <span class="bg-primario text-primario-texto absolute top-1 right-0.5 flex min-w-5 items-center justify-center rounded-full px-1 text-[11px] leading-5 font-semibold" aria-hidden="true">
          {cantidad}
        </span>
      )}
    </button>
  );
}
