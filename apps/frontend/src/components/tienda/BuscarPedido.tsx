// Formulario de número de pedido + email. Dos usos: encontrar el seguimiento ("buscar") o
// pedir el arrepentimiento de la compra ("arrepentimiento"); los dos empiezan igual.
import { CircleCheck } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';

type Reciente = { numero: string; token: string; fecha: string };

const pedirJson = async (ruta: string, cuerpo?: unknown) => {
  const r = await fetch(ruta, { method: 'POST', headers: { 'content-type': 'application/json' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const datos = (await r.json().catch(() => null)) as any;
  if (!r.ok) throw new Error(datos?.error ?? 'No pudimos completar la operación. Probá de nuevo en un momento.');
  return datos;
};

export default function BuscarPedido({ modo }: { modo: 'buscar' | 'arrepentimiento' }) {
  const [numero, setNumero] = useState('');
  const [email, setEmail] = useState('');
  const [motivo, setMotivo] = useState('');
  const [estado, setEstado] = useState<'libre' | 'enviando' | 'listo'>('libre');
  const [error, setError] = useState('');
  const [codigo, setCodigo] = useState<{ id: number; numero: string; codigo: string | null } | null>(null);
  const [recientes, setRecientes] = useState<Reciente[]>([]);

  useEffect(() => {
    try {
      setRecientes(JSON.parse(localStorage.getItem('sukha:ultimos-pedidos') ?? '[]'));
    } catch {
      /* sin almacenamiento: queda solo el formulario */
    }
  }, []);

  const enviar = async (e: Event) => {
    e.preventDefault();
    setError('');
    if (!numero.trim()) return setError('Escribí el número de tu pedido, por ejemplo SUK-0012.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError('Escribí el email con el que hiciste la compra.');
    setEstado('enviando');
    try {
      const { token } = await pedirJson('/api/pedidos/buscar', { numero: numero.trim(), email: email.trim() });
      if (modo === 'buscar') return location.assign(`/pedido/${token}`);
      const solicitud = await pedirJson(`/api/pedidos/${token}/solicitudes`, { tipo: 'arrepentimiento', motivo: motivo.trim() || null });
      setCodigo(solicitud);
      setEstado('listo');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos completar la operación.');
      setEstado('libre');
    }
  };

  if (estado === 'listo' && codigo) {
    return (
      <div class="border-linea rounded-tienda space-y-3 border p-6 text-center" role="status">
        <CircleCheck class="text-exito mx-auto size-10" aria-hidden="true" />
        <p class="text-lg font-semibold">Recibimos tu arrepentimiento</p>
        <p class="text-suave text-sm">Pedido {codigo.numero}. Guardá este código de tu solicitud:</p>
        <p class="text-2xl font-semibold tracking-wide">{codigo.codigo ?? `N.º ${codigo.id}`}</p>
        <p class="text-suave text-sm">Te lo mandamos también por email, con los pasos para devolvernos la prenda.</p>
      </div>
    );
  }

  return (
    <div class="space-y-8">
      {modo === 'buscar' && recientes.length > 0 && (
        <section aria-labelledby="recientes">
          <h2 id="recientes" class="mb-3 text-base">
            Tus pedidos recientes en este dispositivo
          </h2>
          <ul class="divide-linea border-linea rounded-tienda divide-y border">
            {recientes.map((r) => (
              <li key={r.token}>
                <a href={`/pedido/${r.token}`} class="flex min-h-12 items-center justify-between px-4 text-sm hover:bg-gris">
                  <span class="font-medium">{r.numero}</span>
                  <span class="text-suave">{new Date(r.fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form onSubmit={enviar} class="space-y-4" noValidate>
        <div>
          <label for="numero" class="etiqueta">
            Número de pedido
          </label>
          <input id="numero" value={numero} onInput={(e) => setNumero((e.target as HTMLInputElement).value)} placeholder="SUK-0012" autoComplete="off" class="campo" aria-invalid={error ? true : undefined} />
        </div>
        <div>
          <label for="email-pedido" class="etiqueta">
            Email de la compra
          </label>
          <input id="email-pedido" type="email" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} autoComplete="email" class="campo" aria-invalid={error ? true : undefined} />
        </div>
        {modo === 'arrepentimiento' && (
          <div>
            <label for="motivo-arr" class="etiqueta">
              Motivo (opcional)
            </label>
            <textarea id="motivo-arr" value={motivo} onInput={(e) => setMotivo((e.target as HTMLTextAreaElement).value)} maxLength={1000} rows={3} class="campo min-h-24 py-3" />
          </div>
        )}
        {error && (
          <p class="text-oferta text-sm" role="alert">
            {error}
          </p>
        )}
        <button class="boton boton-primario w-full" disabled={estado === 'enviando'}>
          {estado === 'enviando' ? 'Un momento…' : modo === 'buscar' ? 'Buscar mi pedido' : 'Arrepentirme de mi compra'}
        </button>
      </form>
    </div>
  );
}
