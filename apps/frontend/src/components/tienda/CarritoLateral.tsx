// Carrito lateral: se abre desde la derecha al agregar una prenda o tocar la bolsa de la cabecera.
// Usa el <dialog> nativo (atrapa el foco, se cierra con Escape y al tocar afuera).
import { useStore } from '@nanostores/preact';
import { CircleAlert, ShoppingBag, X } from 'lucide-preact';
import { useEffect, useRef } from 'preact/hooks';
import { avisos, carritoAbierto } from '../../lib/carrito';
import { pesos } from '../../lib/formato';
import { useValidacion } from '../../lib/useValidacion';
import LineasCarrito from './LineasCarrito';

export default function CarritoLateral({ maxPorPedido }: { maxPorPedido: number }) {
  const abierto = useStore(carritoAbierto);
  const nota = useStore(avisos);
  const ref = useRef<HTMLDialogElement>(null);
  const { lineas, datos, cargando, error, reintentar } = useValidacion(abierto);
  const cantidad = lineas.reduce((s, l) => s + l.cantidad, 0);
  const mensajes = Object.values(nota);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
    // Mientras está abierto, la página de atrás no se mueve.
    document.body.classList.toggle('overflow-hidden', abierto);
    return () => document.body.classList.remove('overflow-hidden');
  }, [abierto]);

  // Subtotal: el del servidor; mientras responde, la cuenta local solo como referencia (se ve atenuada).
  const subtotalLocal = lineas.reduce((s, l) => s + l.precioCentavos * l.cantidad, 0);
  const subtotal = datos?.subtotalCentavos ?? subtotalLocal;

  return (
    <dialog
      ref={ref}
      onClose={() => carritoAbierto.set(false)}
      onClick={(e) => e.target === ref.current && carritoAbierto.set(false)}
      aria-label="Tu carrito"
      class="m-0 ml-auto h-dvh max-h-none w-full max-w-md p-0 backdrop:bg-black/50"
    >
      <div class="flex h-full flex-col bg-white">
        <header class="border-linea flex h-16 shrink-0 items-center justify-between border-b px-4">
          <h2 class="text-lg font-semibold">Tu carrito{cantidad > 0 && ` (${cantidad})`}</h2>
          <button type="button" onClick={() => carritoAbierto.set(false)} class="boton-icono" title="Cerrar carrito" aria-label="Cerrar carrito">
            <X class="size-5" aria-hidden="true" />
          </button>
        </header>

        {mensajes.length > 0 && (
          <div class="bg-aviso-fondo text-aviso mx-4 mt-4 rounded-tienda p-3 text-sm" role="alert">
            <ul class="space-y-1">
              {mensajes.map((m) => (
                <li class="flex gap-2">
                  <CircleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {m}
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => avisos.set({})} class="mt-2 text-xs font-semibold underline">
              Entendido
            </button>
          </div>
        )}

        {lineas.length === 0 ? (
          <div class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <span class="foto-vacia size-16 rounded-full">
              <ShoppingBag class="size-7" aria-hidden="true" />
            </span>
            <p class="text-lg font-semibold">Tu carrito está vacío</p>
            <a href="/productos" class="boton boton-primario mt-2">
              Ver productos
            </a>
          </div>
        ) : (
          <>
            <div class="flex-1 overflow-y-auto px-4">
              <LineasCarrito lineas={lineas} datos={datos} maxPorPedido={maxPorPedido} />
              {error && (
                <p class="text-oferta mb-4 text-sm" role="alert">
                  {error}{' '}
                  <button type="button" onClick={reintentar} class="font-semibold underline">
                    Reintentar
                  </button>
                </p>
              )}
            </div>
            <footer class="border-linea shrink-0 space-y-3 border-t p-4">
              <p class="flex items-baseline justify-between text-base">
                <span>Subtotal</span>
                <span class={`text-lg font-semibold tabular-nums ${cargando && !datos ? 'text-suave animate-pulse' : ''}`}>{pesos(subtotal)}</span>
              </p>
              <p class="text-suave text-xs">El envío y los descuentos se calculan al finalizar la compra.</p>
              <a href="/checkout" class="boton boton-primario w-full">
                Iniciar compra
              </a>
              <a href="/carrito" class="boton boton-secundario w-full">
                Ver carrito
              </a>
            </footer>
          </>
        )}
      </div>
    </dialog>
  );
}
