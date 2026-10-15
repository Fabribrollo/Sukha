// "Pagar ahora": pide un link de pago nuevo a Mercado Pago (mientras dure la reserva) y lleva a la clienta ahí.
import { CreditCard } from 'lucide-preact';
import { useState } from 'preact/hooks';

export default function PagarAhora({ token }: { token: string }) {
  const [estado, setEstado] = useState<'libre' | 'cargando' | 'error'>('libre');
  const [error, setError] = useState('');

  const pagar = async () => {
    setEstado('cargando');
    try {
      const r = await fetch(`/api/pedidos/${token}/pago`, { method: 'POST' });
      const cuerpo = (await r.json().catch(() => null)) as { urlPago?: string; error?: string } | null;
      if (!r.ok || !cuerpo?.urlPago) throw new Error(cuerpo?.error ?? 'No pudimos abrir el pago. Probá de nuevo en un momento.');
      location.assign(cuerpo.urlPago);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos abrir el pago.');
      setEstado('error');
    }
  };

  return (
    <div>
      <button type="button" onClick={pagar} disabled={estado === 'cargando'} class="boton boton-primario w-full sm:w-auto">
        <CreditCard class="size-5" aria-hidden="true" />
        {estado === 'cargando' ? 'Abriendo Mercado Pago…' : 'Pagar ahora'}
      </button>
      {estado === 'error' && (
        <p class="text-oferta mt-2 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
