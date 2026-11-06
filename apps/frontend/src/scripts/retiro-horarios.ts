// Ventana de horarios del retiro: cada día se abre o se cierra y puede tener hasta 3 franjas (horario cortado).
const ventana = document.querySelector<HTMLDialogElement>('#retiro-modal');

if (ventana) {
  const MAX_FRANJAS = 3;

  for (const fila of ventana.querySelectorAll<HTMLElement>('[data-dia]')) {
    const dia = fila.dataset.dia!;
    const abre = fila.querySelector<HTMLInputElement>(`input[name=abre_${dia}]`)!;
    const lista = fila.querySelector<HTMLElement>('[data-franjas]')!;
    const agregar = fila.querySelector<HTMLButtonElement>('[data-agregar-franja]')!;

    const franjas = () => [...lista.querySelectorAll<HTMLElement>('[data-franja]')];
    const refrescar = () => {
      const abierto = abre.checked;
      lista.hidden = !abierto;
      agregar.hidden = !abierto || franjas().length >= MAX_FRANJAS;
      for (const input of lista.querySelectorAll('input')) (input as HTMLInputElement).disabled = !abierto;
      for (const quitar of lista.querySelectorAll<HTMLButtonElement>('[data-quitar-franja]')) quitar.hidden = franjas().length <= 1;
      fila.querySelector('[data-cerrado]')!.toggleAttribute('hidden', abierto);
    };

    abre.addEventListener('change', () => {
      // Al abrir un día sin franjas, se ofrece una de ejemplo.
      if (abre.checked && franjas().length === 0) agregar.click();
      refrescar();
    });
    agregar.addEventListener('click', () => {
      const molde = ventana.querySelector<HTMLTemplateElement>('#franja-molde')!;
      const nueva = molde.content.firstElementChild!.cloneNode(true) as HTMLElement;
      for (const input of nueva.querySelectorAll<HTMLInputElement>('input')) input.name = `${input.dataset.campo}_${dia}`;
      lista.append(nueva);
      refrescar();
    });
    lista.addEventListener('click', (e) => {
      const quitar = (e.target as HTMLElement).closest('[data-quitar-franja]');
      if (!quitar) return;
      quitar.closest('[data-franja]')!.remove();
      refrescar();
    });
    refrescar();
  }

  for (const abrir of document.querySelectorAll('[data-abrir-retiro]')) abrir.addEventListener('click', () => ventana.showModal());
  for (const cerrar of ventana.querySelectorAll('[data-cerrar]')) cerrar.addEventListener('click', () => ventana.close());
  ventana.addEventListener('click', (e) => e.target === ventana && ventana.close());
}
