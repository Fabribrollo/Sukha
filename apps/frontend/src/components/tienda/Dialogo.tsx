// Ventana modal con el <dialog> nativo: atrapa el foco, se cierra con Escape y al tocar afuera.
import { X } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

interface Props {
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  // Más ancho, para fotos y tablas.
  ancho?: boolean;
  children: ComponentChildren;
}

export default function Dialogo({ abierto, alCerrar, titulo, ancho = false, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      onClose={alCerrar}
      onClick={(e) => e.target === ref.current && alCerrar()}
      aria-label={titulo}
      class={`rounded-tienda m-auto max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto p-0 backdrop:bg-black/60 ${ancho ? 'max-w-3xl' : 'max-w-lg'}`}
    >
      <div class="border-linea sticky top-0 flex items-center justify-between border-b bg-white px-5 py-3">
        <h2 class="text-base font-semibold">{titulo}</h2>
        <button type="button" onClick={alCerrar} class="boton-icono" title="Cerrar" aria-label="Cerrar">
          <X class="size-5" aria-hidden="true" />
        </button>
      </div>
      <div class="p-5">{children}</div>
    </dialog>
  );
}
