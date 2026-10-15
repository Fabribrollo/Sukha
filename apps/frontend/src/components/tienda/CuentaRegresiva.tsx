// Cuánto falta para que venza la reserva de las prendas. Se dibuja solo en el navegador (depende de la hora de la clienta).
import { Clock } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';

const ZONA = 'America/Argentina/Cordoba';

export default function CuentaRegresiva({ vence }: { vence: string }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const cada = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(cada);
  }, []);

  const faltan = new Date(vence).getTime() - ahora;
  const hasta = new Date(vence).toLocaleString('es-AR', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  if (faltan <= 0) {
    return (
      <p class="text-oferta flex items-center gap-2 text-sm font-medium" role="status">
        <Clock class="size-4" aria-hidden="true" />
        La reserva venció. Si ya pagaste, escribinos y lo resolvemos.
      </p>
    );
  }
  const horas = Math.floor(faltan / 3_600_000);
  const minutos = Math.floor((faltan % 3_600_000) / 60_000);
  return (
    <p class="flex items-start gap-2 text-sm" role="timer">
      <Clock class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        Reservamos tus prendas hasta el {hasta}. <strong>Quedan {horas > 0 ? `${horas} h ` : ''}{minutos} min.</strong>
      </span>
    </p>
  );
}
