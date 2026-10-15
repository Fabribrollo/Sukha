// Suscripción a novedades del pie. Usa POST /api/novedades e incluye el campo señuelo contra bots
// (`comentarioExtra`): va fuera de pantalla, no con display:none, y se manda tal cual.
import { useState } from 'preact/hooks';

export default function Newsletter() {
  const [email, setEmail] = useState('');
  const [senuelo, setSenuelo] = useState('');
  const [estado, setEstado] = useState<'listo' | 'enviando' | 'ok' | 'error'>('listo');
  const [mensaje, setMensaje] = useState('');

  const enviar = async (e: Event) => {
    e.preventDefault();
    setEstado('enviando');
    try {
      const r = await fetch('/api/novedades', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, comentarioExtra: senuelo }),
      });
      if (r.ok) return setEstado('ok');
      setMensaje(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No pudimos suscribirte. Probá de nuevo.');
    } catch {
      setMensaje('No pudimos conectarnos. Probá de nuevo.');
    }
    setEstado('error');
  };

  if (estado === 'ok') {
    return (
      <p class="text-sm font-semibold" role="status">
        ¡Listo! Ya estás suscripta.
      </p>
    );
  }

  return (
    <form onSubmit={enviar} class="space-y-2">
      <label for="news-email" class="sr-only">
        Tu email
      </label>
      <div class="flex gap-2">
        <input id="news-email" type="email" required autocomplete="email" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} placeholder="Tu email" class="campo min-h-11 flex-1" />
        <button class="boton boton-primario min-h-11 px-4" disabled={estado === 'enviando'}>
          {estado === 'enviando' ? 'Enviando…' : 'Suscribirme'}
        </button>
      </div>
      <input type="text" name="comentarioExtra" tabindex={-1} autocomplete="off" aria-hidden="true" value={senuelo} onInput={(e) => setSenuelo((e.target as HTMLInputElement).value)} style="position:absolute;left:-9999px;width:1px;height:1px" />
      {estado === 'error' && (
        <p class="text-oferta text-sm" role="alert">
          {mensaje}
        </p>
      )}
    </form>
  );
}
