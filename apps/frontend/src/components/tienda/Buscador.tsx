// Buscador de la cabecera. En escritorio es un campo con un desplegable de sugerencias; en el celular,
// un ícono que abre una capa a pantalla completa. Pide hasta 5 sugerencias a la API a partir de 2 letras.
import { Search, X } from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { pesos, precioFinal, urlFoto, type TarjetaDeProducto } from '../../lib/formato';

export default function Buscador() {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<TarjetaDeProducto[] | null>(null);
  const [activo, setActivo] = useState(-1);
  const campo = useRef<HTMLInputElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const buscado = texto.trim();

  // Sugerencias, con 250 ms de espera entre teclas; una búsqueda nueva descarta la anterior.
  useEffect(() => {
    if (buscado.length < 2) return setResultados(null);
    const control = new AbortController();
    const espera = setTimeout(async () => {
      try {
        const r = await fetch(`/api/catalogo/productos?q=${encodeURIComponent(buscado)}&limite=5`, { signal: control.signal });
        if (!r.ok) return;
        setResultados(((await r.json()) as { productos: TarjetaDeProducto[] }).productos);
        setActivo(-1);
      } catch {
        // cancelada por una búsqueda nueva, o sin conexión: se deja lo que había
      }
    }, 250);
    return () => {
      clearTimeout(espera);
      control.abort();
    };
  }, [buscado]);

  // Cierra al tocar afuera.
  useEffect(() => {
    const afuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', afuera);
    return () => document.removeEventListener('mousedown', afuera);
  }, []);

  // En el celular, la capa abierta bloquea el scroll de la página de atrás.
  useEffect(() => {
    document.body.classList.toggle('overflow-hidden', abierto && matchMedia('(max-width: 767px)').matches);
    return () => document.body.classList.remove('overflow-hidden');
  }, [abierto]);

  const abrir = () => {
    setAbierto(true);
    setTimeout(() => campo.current?.focus(), 0);
  };
  const cerrar = () => setAbierto(false);
  // Opciones navegables con teclado: los resultados y, al final, "Ver todos".
  const total = (resultados?.length ?? 0) + (resultados?.length ? 1 : 0);

  const teclas = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return cerrar();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!total) return;
      e.preventDefault();
      // Recorre -1 (el campo) hasta la última opción y vuelve al principio.
      setActivo((a) => ((a + 1 + (e.key === 'ArrowDown' ? 1 : -1) + total + 1) % (total + 1)) - 1);
    } else if (e.key === 'Enter' && activo >= 0 && resultados) {
      e.preventDefault();
      location.assign(activo < resultados.length ? `/producto/${resultados[activo].slug}` : `/buscar?q=${encodeURIComponent(buscado)}`);
    }
  };

  const panelVisible = abierto && buscado.length >= 2 && resultados !== null;

  return (
    <div ref={caja} class="relative">
      <button type="button" class="boton-icono md:hidden" onClick={abrir} title="Buscar" aria-label="Buscar">
        <Search class="size-5" aria-hidden="true" />
      </button>

      <div class={abierto ? 'fixed inset-0 z-50 flex flex-col bg-white p-4 md:static md:block md:p-0' : 'hidden md:block'}>
        <form action="/buscar" role="search" class="flex items-center gap-2">
          <div class="relative flex-1">
            <Search class="text-suave pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden="true" />
            <input
              ref={campo}
              type="search"
              name="q"
              value={texto}
              onInput={(e) => setTexto((e.target as HTMLInputElement).value)}
              onFocus={() => setAbierto(true)}
              onKeyDown={teclas}
              placeholder="¿Qué estás buscando?"
              aria-label="Buscar productos"
              role="combobox"
              aria-expanded={panelVisible}
              aria-controls="sugerencias"
              aria-activedescendant={activo >= 0 ? `sug-${activo}` : undefined}
              autocomplete="off"
              class="campo min-h-11 pl-10 md:w-72 lg:w-80"
            />
          </div>
          <button type="button" class="boton-icono md:hidden" onClick={cerrar} title="Cerrar búsqueda" aria-label="Cerrar búsqueda">
            <X class="size-5" aria-hidden="true" />
          </button>
        </form>

        {panelVisible && (
          <div id="sugerencias" role="listbox" class="border-linea mt-2 flex-1 overflow-y-auto bg-white md:absolute md:top-full md:right-0 md:mt-1 md:w-96 md:flex-none md:rounded-tienda md:border md:shadow-lg">
            {resultados!.length === 0 ? (
              <p class="text-suave p-4 text-sm">No encontramos productos para «{buscado}».</p>
            ) : (
              <>
                {resultados!.map((p, i) => (
                  <a
                    id={`sug-${i}`}
                    role="option"
                    aria-selected={activo === i}
                    href={`/producto/${p.slug}`}
                    class={`flex items-center gap-3 p-3 ${activo === i ? 'bg-gris' : 'hover:bg-gris'}`}
                  >
                    {p.foto ? (
                      <img src={urlFoto(p.foto, 'chico')} alt="" width="48" height="64" class="h-16 w-12 shrink-0 rounded-tienda object-cover" />
                    ) : (
                      <span class="foto-vacia h-16 w-12 shrink-0 rounded-tienda" />
                    )}
                    <span class="min-w-0">
                      <span class="block truncate text-sm font-medium">{p.nombre}</span>
                      <span class="text-suave block text-sm">{pesos(precioFinal(p))}</span>
                    </span>
                  </a>
                ))}
                <a
                  id={`sug-${resultados!.length}`}
                  role="option"
                  aria-selected={activo === resultados!.length}
                  href={`/buscar?q=${encodeURIComponent(buscado)}`}
                  class={`border-linea block border-t p-3 text-center text-sm font-semibold ${activo === resultados!.length ? 'bg-gris' : 'hover:bg-gris'}`}
                >
                  Ver todos los resultados
                </a>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
