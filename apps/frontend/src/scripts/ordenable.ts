// Ordenar arrastrando, para listas (categorías) y grillas (fotos). Usa SortableJS (MIT): se agarra el elemento entero,
// los demás se corren con animación, y funciona con mouse y con el dedo (mantener apretado un instante para no trabar el scroll).
// El botón de arrastre (`asa`) queda como indicador y para ordenar con el teclado (flechas).
// Los elementos de la lista llevan `data-id`; las listas anidadas (subcategorías) son otra instancia.
import Sortable from 'sortablejs';

type Opciones = { asa: string; guardar: (ids: number[]) => Promise<void> };

export function ordenable(lista: HTMLElement, { asa, guardar }: Opciones) {
  const ids = () => [...lista.children].map((h) => (h as HTMLElement).dataset.id!);
  lista.dataset.ordenable = '';
  // Las imágenes se arrastran con su elemento, no solas.
  for (const img of lista.querySelectorAll('img')) img.draggable = false;

  Sortable.create(lista, {
    animation: 200,
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    // Lo que tiene una acción propia (interruptores, lápiz, borrar, links) no arranca el arrastre.
    filter: `input, select, textarea, a, label, button:not(${asa})`,
    preventOnFilter: false,
    // Copia propia que sigue al puntero (igual en todos los navegadores) y estilos en panel.css.
    forceFallback: true,
    fallbackTolerance: 4,
    ghostClass: 'arrastre-fantasma',
    dragClass: 'arrastre-activo',
    fallbackClass: 'arrastre-activo',
    delay: 150,
    delayOnTouchOnly: true,
    touchStartThreshold: 6,
    onEnd: (e) => {
      if (e.oldIndex !== e.newIndex) void guardar(ids().map(Number));
    },
  });

  // Teclado: flechas sobre el botón de arrastre de cada elemento (solo los de esta lista, no los de listas anidadas).
  let pendiente: ReturnType<typeof setTimeout> | undefined;
  for (const boton of lista.querySelectorAll<HTMLElement>(asa)) {
    const item = boton.closest<HTMLElement>('[data-id]')!;
    if (item.parentElement !== lista) continue;
    boton.addEventListener('keydown', (e) => {
      const atras = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
      const adelante = e.key === 'ArrowDown' || e.key === 'ArrowRight';
      if (!atras && !adelante) return;
      e.preventDefault();
      const otro = atras ? item.previousElementSibling : item.nextElementSibling;
      if (!otro) return;
      const antes = ids();
      if (atras) lista.insertBefore(item, otro);
      else lista.insertBefore(otro, item);
      boton.focus();
      clearTimeout(pendiente);
      pendiente = setTimeout(() => ids().join() !== antes.join() && void guardar(ids().map(Number)), 600);
    });
  }
}
