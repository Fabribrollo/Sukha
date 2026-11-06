// Bolsa del carrito en la cabecera, con la cantidad de prendas. Al tocarla abre el carrito lateral.
import { useStore } from '@nanostores/preact';
import { ShoppingBag } from 'lucide-preact';
import { cantidadTotal, carritoAbierto } from '../../lib/carrito';

export default function ContadorCarrito() {
  const cantidad = useStore(cantidadTotal);
  return (
    <button
      type="button"
      class="hover:bg-gris inline-flex h-11 min-w-11 cursor-pointer items-center justify-center gap-2 px-2.5 text-sm transition"
      onClick={() => carritoAbierto.set(true)}
      title="Carrito"
      aria-label={cantidad ? `Carrito, ${cantidad} ${cantidad === 1 ? 'prenda' : 'prendas'}` : 'Carrito vacío'}
    >
      <ShoppingBag class="size-5" aria-hidden="true" />
      {cantidad > 0 && (
        <span class="max-md:hidden" aria-hidden="true">
          {cantidad}
        </span>
      )}
    </button>
  );
}
