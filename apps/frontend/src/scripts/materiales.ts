// Materiales de un producto: se eligen con el mismo selector con buscador que talles y colores (y se agrega uno nuevo
// escribiéndolo). Cada material elegido queda como una etiqueta con su ×, y viaja en el formulario como name="material".
//   <fieldset data-materiales> con [data-elegidos] (etiquetas) y un <select data-combo data-crear="/api/admin/materiales">
import { mejorar } from './combo';

export const etiquetaMaterial = (id: string, nombre: string, campo = 'material') =>
  `<span data-chip="${id}" class="inline-flex min-h-9 items-center gap-1 rounded-lg border border-gray-300 bg-gray-50 pr-1 pl-3 text-sm text-gray-700">${nombre.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)}<input type="hidden" name="${campo}" value="${id}" /><button type="button" data-quitar-chip class="btn-icono size-7" title="Quitar" aria-label="Quitar ${nombre.replace(/"/g, '')}">×</button></span>`;

for (const caja of document.querySelectorAll<HTMLElement>('[data-materiales]')) {
  const elegidos = caja.querySelector<HTMLElement>('[data-elegidos]')!;
  const select = caja.querySelector<HTMLSelectElement>('select')!;
  mejorar(select);
  select.addEventListener('change', () => {
    const op = select.selectedOptions[0];
    if (op && op.value && !elegidos.querySelector(`[data-chip="${op.value}"]`)) elegidos.insertAdjacentHTML('beforeend', etiquetaMaterial(op.value, op.text));
    // Vuelve al vacío para elegir el siguiente.
    select.value = '';
  });
  elegidos.addEventListener('click', (e) => (e.target as HTMLElement).closest('[data-quitar-chip]')?.closest('[data-chip]')?.remove());
}
