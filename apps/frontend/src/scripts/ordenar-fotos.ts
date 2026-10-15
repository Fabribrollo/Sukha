// Ordenar las fotos de un producto arrastrándolas. La primera es la que se ve en las tarjetas de la tienda.
import { ordenable } from './ordenable';

const grilla = document.querySelector<HTMLElement>('[data-fotos]');
const estado = document.querySelector<HTMLElement>('[data-estado-fotos]');
const avisar = (texto: string, error = false) => {
  if (!estado) return;
  estado.textContent = texto;
  estado.classList.toggle('text-error-600', error);
  estado.classList.toggle('text-gray-500', !error);
};

if (grilla) {
  const insignia = () => {
    // La insignia "Principal" va con la primera foto: al reordenar hay que moverla.
    const marca = grilla.querySelector<HTMLElement>('[data-principal]');
    if (marca) grilla.firstElementChild?.append(marca);
  };
  ordenable(grilla, {
    asa: '[data-asa]',
    guardar: async (ids) => {
      insignia();
      try {
        avisar('Guardando…');
        const r = await fetch(grilla.dataset.fotos!, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) });
        if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No se pudo guardar.');
        avisar('Orden guardado.');
      } catch (e) {
        avisar((e instanceof Error ? e.message : 'No se pudo guardar') + ' Recargá la página.', true);
      }
    },
  });
}
