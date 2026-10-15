// Pedido de cambio o devolución desde el seguimiento de la compra.
import { Undo2 } from 'lucide-preact';
import { useState } from 'preact/hooks';
import Dialogo from './Dialogo';

type Item = { id: number; nombre: string; talle: string | null; color: string | null; cantidad: number };

export default function SolicitudPostventa({ token, items }: { token: string; items: Item[] }) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<'cambio' | 'devolucion'>('cambio');
  // Cantidad que se incluye de cada prenda (0 = no entra en la solicitud). Por defecto, todo el pedido.
  const [cantidades, setCantidades] = useState<Record<number, number>>(() => Object.fromEntries(items.map((i) => [i.id, i.cantidad])));
  const [motivo, setMotivo] = useState('');
  const [estado, setEstado] = useState<'libre' | 'enviando' | 'listo'>('libre');
  const [error, setError] = useState('');

  const elegidos = items.filter((i) => cantidades[i.id] > 0);

  const enviar = async (e: Event) => {
    e.preventDefault();
    if (!elegidos.length) return setError('Elegí al menos una prenda.');
    setEstado('enviando');
    setError('');
    try {
      const r = await fetch(`/api/pedidos/${token}/solicitudes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tipo, motivo: motivo.trim() || null, items: elegidos.map((i) => ({ pedidoItemId: i.id, cantidad: cantidades[i.id] })) }),
      });
      const cuerpo = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) throw new Error(cuerpo?.error ?? 'No pudimos enviar tu solicitud. Probá de nuevo.');
      setEstado('listo');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos enviar tu solicitud.');
      setEstado('libre');
    }
  };

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} class="boton boton-secundario">
        <Undo2 class="size-4" aria-hidden="true" />
        Solicitar un cambio o devolución
      </button>
      <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} titulo="Cambio o devolución">
        {estado === 'listo' ? (
          <div class="space-y-3 text-center" role="status">
            <p class="text-lg font-semibold">Recibimos tu solicitud</p>
            <p class="text-suave text-sm">Te vamos a contactar por email para coordinar los pasos.</p>
            <button type="button" onClick={() => setAbierto(false)} class="boton boton-primario w-full">
              Listo
            </button>
          </div>
        ) : (
          <form onSubmit={enviar} class="space-y-5">
            <fieldset>
              <legend class="etiqueta">¿Qué querés hacer?</legend>
              <div class="grid grid-cols-2 gap-2">
                {(['cambio', 'devolucion'] as const).map((t) => (
                  <label key={t} class={`rounded-tienda flex min-h-12 cursor-pointer items-center justify-center border text-sm font-medium ${tipo === t ? 'border-texto bg-gris' : 'border-linea'}`}>
                    <input type="radio" name="tipo" checked={tipo === t} onChange={() => setTipo(t)} class="sr-only" />
                    {t === 'cambio' ? 'Cambio' : 'Devolución'}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend class="etiqueta">Prendas</legend>
              <ul class="space-y-2">
                {items.map((i) => (
                  <li key={i.id} class="flex items-center justify-between gap-3 text-sm">
                    <label class="flex min-w-0 flex-1 items-center gap-3">
                      <input type="checkbox" checked={cantidades[i.id] > 0} onChange={(e) => setCantidades((c) => ({ ...c, [i.id]: (e.target as HTMLInputElement).checked ? i.cantidad : 0 }))} class="size-5 shrink-0 rounded" />
                      <span class="min-w-0">
                        <span class="block truncate font-medium">{i.nombre}</span>
                        <span class="text-suave block text-xs">{[i.talle && `Talle ${i.talle}`, i.color].filter(Boolean).join(' · ')}</span>
                      </span>
                    </label>
                    {i.cantidad > 1 && cantidades[i.id] > 0 && (
                      <select aria-label={`Cantidad de ${i.nombre}`} value={cantidades[i.id]} onChange={(e) => setCantidades((c) => ({ ...c, [i.id]: Number((e.target as HTMLSelectElement).value) }))} class="campo min-h-10 w-20 py-0 text-sm">
                        {Array.from({ length: i.cantidad }, (_, n) => n + 1).map((n) => (
                          <option value={n}>{n}</option>
                        ))}
                      </select>
                    )}
                  </li>
                ))}
              </ul>
            </fieldset>

            <div>
              <label for="motivo" class="etiqueta">
                Contanos qué pasó (opcional)
              </label>
              <textarea id="motivo" value={motivo} onInput={(e) => setMotivo((e.target as HTMLTextAreaElement).value)} maxLength={1000} rows={3} class="campo min-h-24 py-3" />
            </div>

            {error && (
              <p class="text-oferta text-sm" role="alert">
                {error}
              </p>
            )}
            <button class="boton boton-primario w-full" disabled={estado === 'enviando'}>
              {estado === 'enviando' ? 'Enviando…' : 'Enviar solicitud'}
            </button>
          </form>
        )}
      </Dialogo>
    </>
  );
}
