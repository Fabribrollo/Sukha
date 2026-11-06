// Campo de texto con sugerencias (combobox accesible): se escribe, aparece una lista y se elige con el mouse, el dedo o
// las flechas y Enter. Es solo una ayuda: siempre se puede dejar lo que se escribió. Si la búsqueda falla, no pasa nada.
import { useEffect, useRef, useState } from 'preact/hooks';

export type Sugerencia = { texto: string; detalle?: string };

interface Props {
  id: string;
  value: string;
  onInput: (valor: string) => void;
  // Busca sugerencias para lo escrito. Se llama con una pausa y solo desde 3 letras.
  buscar: (texto: string, senal: AbortSignal) => Promise<Sugerencia[]>;
  alElegir?: (indice: number) => void;
  // Se llama al terminar cada búsqueda: con la cantidad de sugerencias, o con null si la búsqueda falló.
  alBuscar?: (cantidad: number | null) => void;
  // Atributos del <input> (aria-invalid, autocomplete, onBlur…).
  entrada?: Record<string, unknown>;
}

export default function Autocompletar({ id, value, onInput, buscar, alElegir, alBuscar, entrada = {} }: Props) {
  const [lista, setLista] = useState<Sugerencia[]>([]);
  const [abierta, setAbierta] = useState(false);
  const [activa, setActiva] = useState(-1);
  // Después de elegir una sugerencia no se vuelve a buscar con el texto elegido.
  const elegida = useRef<string | null>(null);

  useEffect(() => {
    if (value === elegida.current || value.trim().length < 3) {
      setLista([]);
      return;
    }
    const control = new AbortController();
    const espera = setTimeout(async () => {
      try {
        const r = await buscar(value, control.signal);
        if (!control.signal.aborted) {
          setLista(r);
          setActiva(-1);
          setAbierta(r.length > 0);
          alBuscar?.(r.length);
        }
      } catch (e) {
        /* sin sugerencias: se sigue escribiendo a mano */
        if ((e as Error).name !== 'AbortError') alBuscar?.(null);
      }
    }, 300);
    return () => {
      clearTimeout(espera);
      control.abort();
    };
  }, [value]);

  const elegir = (i: number) => {
    const s = lista[i];
    if (!s) return;
    elegida.current = s.texto;
    onInput(s.texto);
    setAbierta(false);
    setLista([]);
    alElegir?.(i);
  };

  const teclas = (e: KeyboardEvent) => {
    if (!abierta || !lista.length) return;
    if (e.key === 'ArrowDown') (e.preventDefault(), setActiva((a) => (a + 1) % lista.length));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setActiva((a) => (a <= 0 ? lista.length - 1 : a - 1)));
    else if (e.key === 'Enter' && activa >= 0) (e.preventDefault(), elegir(activa));
    else if (e.key === 'Escape') setAbierta(false);
  };

  return (
    <div class="relative">
      <input
        {...entrada}
        id={id}
        value={value}
        onInput={(e) => {
          elegida.current = null;
          onInput((e.target as HTMLInputElement).value);
        }}
        onKeyDown={teclas}
        onBlur={(e) => {
          setAbierta(false);
          (entrada.onBlur as ((e: FocusEvent) => void) | undefined)?.(e);
        }}
        onFocus={() => lista.length > 0 && setAbierta(true)}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={abierta}
        aria-controls={`${id}-lista`}
        aria-activedescendant={activa >= 0 ? `${id}-op-${activa}` : undefined}
        class="campo"
      />
      {abierta && lista.length > 0 && (
        <ul id={`${id}-lista`} role="listbox" class="border-linea rounded-tienda absolute top-full right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto border bg-fondo py-1">
          {lista.map((s, i) => (
            <li
              key={`${s.texto}-${s.detalle ?? ''}`}
              id={`${id}-op-${i}`}
              role="option"
              aria-selected={i === activa}
              // mousedown (no click): el campo no pierde el foco antes de elegir.
              onMouseDown={(e) => (e.preventDefault(), elegir(i))}
              class={`flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 text-sm ${i === activa ? 'bg-gris' : ''}`}
            >
              <span>{s.texto}</span>
              {s.detalle && <span class="text-suave text-xs">{s.detalle}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
