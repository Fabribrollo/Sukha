// "Calculá el envío": la clienta escribe su código postal y ve las opciones y sus precios.
// Se usa en la ficha del producto y en el carrito. Recuerda el código postal para el carrito y el checkout.
import { Home, MapPin, Store, Truck } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { pesos, type Tienda } from '../../lib/formato';
import type { OpcionEnvio } from '../../lib/carrito';

export const CLAVE_CP = 'sukha:cp';
export const NOMBRES_CORREO: Record<string, string> = { correo_argentino: 'Correo Argentino', andreani: 'Andreani' };

interface Props {
  tienda: Pick<Tienda, 'retiro'>;
  // Monto de la compra, para mostrar "Gratis" cuando llega al mínimo de la zona.
  subtotalCentavos: number;
  // Si se pasa, al elegir una opción se avisa a quien la usa (el carrito la necesita para calcular el total).
  alElegir?: (opcion: OpcionEnvio | null, codigoPostal: string) => void;
  // Para elegir una opción (carrito y checkout) o solo informar (ficha).
  elegible?: boolean;
  elegida?: number | null;
}

// Guarda y lee el código postal sin romper si el navegador no deja usar localStorage.
export const cpGuardado = () => {
  try {
    return localStorage.getItem(CLAVE_CP) ?? '';
  } catch {
    return '';
  }
};
export const guardarCp = (cp: string) => {
  try {
    localStorage.setItem(CLAVE_CP, cp);
  } catch {
    /* sin almacenamiento: se pide de nuevo la próxima vez */
  }
};

export default function CotizadorEnvio({ tienda, subtotalCentavos, alElegir, elegible = false, elegida = null }: Props) {
  const [cp, setCp] = useState('');
  const [opciones, setOpciones] = useState<OpcionEnvio[] | null>(null);
  const [estado, setEstado] = useState<'libre' | 'buscando' | 'error'>('libre');
  const [error, setError] = useState('');

  const calcular = async (codigo: string) => {
    const limpio = codigo.trim().toUpperCase();
    if (!/^[A-Z]?\d{4}[A-Z]{0,3}$/.test(limpio)) {
      setError('Escribí los 4 números de tu código postal.');
      return setEstado('error');
    }
    setEstado('buscando');
    try {
      const r = await fetch('/api/envios/cotizar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codigoPostal: limpio }) });
      const cuerpo = (await r.json()) as any;
      if (!r.ok) throw new Error(cuerpo?.error ?? 'No pudimos calcular el envío.');
      guardarCp(limpio);
      setOpciones(cuerpo as OpcionEnvio[]);
      setEstado('libre');
      if (alElegir) {
        const lista = cuerpo as OpcionEnvio[];
        // Si la opción elegida sigue disponible para este código postal, se conserva; si no, se elige la más barata.
        alElegir(lista.find((o) => o.zonaEnvioId === elegida) ?? lista[0] ?? null, limpio);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos calcular el envío.');
      setEstado('error');
    }
  };

  // Si ya había un código postal guardado, se calcula al abrir la página.
  useEffect(() => {
    const guardado = cpGuardado();
    if (guardado) {
      setCp(guardado);
      void calcular(guardado);
    }
  }, []);

  const gratis = (o: OpcionEnvio) => o.gratisDesdeCentavos !== null && subtotalCentavos >= o.gratisDesdeCentavos;

  return (
    <section aria-labelledby="envio-titulo" class="border-linea rounded-tienda border p-4">
      <h3 id="envio-titulo" class="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Truck class="size-5" aria-hidden="true" />
        Calculá el envío
      </h3>
      <form
        class="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void calcular(cp);
        }}
      >
        <label class="sr-only" for="cp-envio">
          Código postal
        </label>
        <input id="cp-envio" value={cp} onInput={(e) => setCp((e.target as HTMLInputElement).value)} inputMode="numeric" autoComplete="postal-code" placeholder="Tu código postal" maxLength={8} class="campo min-h-11 flex-1" />
        <button class="boton boton-secundario min-h-11 px-4" disabled={estado === 'buscando'}>
          {estado === 'buscando' ? 'Calculando…' : 'Calcular'}
        </button>
      </form>
      <a href="https://www.correoargentino.com.ar/formularios/cpa" target="_blank" rel="noopener" class="text-suave mt-2 inline-block text-xs underline">
        No sé mi código postal
      </a>

      {estado === 'error' && (
        <p class="text-oferta mt-3 text-sm" role="alert">
          {error}
        </p>
      )}

      {opciones && (
        <ul class="mt-3 space-y-2" aria-live="polite">
          {opciones.length === 0 && !tienda.retiro && <li class="text-suave text-sm">Todavía no enviamos a ese código postal. Escribinos y lo vemos.</li>}
          {opciones.map((o) => {
            const Icono = o.modalidad === 'sucursal' ? MapPin : Home;
            const contenido = (
              <>
                <Icono class="text-suave size-5 shrink-0" aria-hidden="true" />
                <span class="min-w-0 flex-1 text-sm">
                  <span class="block font-medium">{NOMBRES_CORREO[o.transporte]}</span>
                  <span class="text-suave block text-xs">{o.modalidad === 'sucursal' ? 'A sucursal' : 'A domicilio'} · {o.nombre}</span>
                </span>
                <span class={`text-sm font-semibold ${gratis(o) || o.precioCentavos === 0 ? 'text-exito' : ''}`}>{gratis(o) || o.precioCentavos === 0 ? 'Gratis' : pesos(o.precioCentavos)}</span>
              </>
            );
            return elegible ? (
              <li>
                <label class={`rounded-tienda flex min-h-12 cursor-pointer items-center gap-3 border p-3 ${elegida === o.zonaEnvioId ? 'border-texto bg-gris' : 'border-linea'}`}>
                  <input type="radio" name="opcion-envio" checked={elegida === o.zonaEnvioId} onChange={() => alElegir?.(o, cp.trim().toUpperCase())} class="size-4" />
                  {contenido}
                </label>
              </li>
            ) : (
              <li class="flex items-center gap-3">{contenido}</li>
            );
          })}
          {tienda.retiro && (
            <li class="flex items-center gap-3">
              <Store class="text-suave size-5 shrink-0" aria-hidden="true" />
              <span class="min-w-0 flex-1 text-sm">
                <span class="block font-medium">Retiro en persona</span>
                <span class="text-suave block text-xs">{tienda.retiro.direccion}</span>
              </span>
              <span class="text-exito text-sm font-semibold">Gratis</span>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
