// Panel de categorías: ordenar arrastrando, ocultar/mostrar con el interruptor y editar en una ventana.
// Sin JavaScript la página sigue funcionando: el orden no se puede cambiar, pero se ve y se edita todo con los formularios.

import { ordenable } from './ordenable';

const estado = document.querySelector<HTMLElement>('[data-estado-categorias]');
const avisar = (texto: string, error = false) => {
  if (!estado) return;
  estado.textContent = texto;
  estado.classList.toggle('text-error-600', error);
  estado.classList.toggle('text-gray-500', !error);
};

async function pedir(ruta: string, metodo: 'PUT' | 'PATCH', cuerpo: unknown) {
  const r = await fetch(ruta, { method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
  if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No se pudo guardar.');
}

// ───────────── Orden ─────────────
// La lista de principales y la de subcategorías de cada una se ordenan por separado.
for (const lista of document.querySelectorAll<HTMLElement>('[data-lista]')) {
  ordenable(lista, {
    asa: '[data-asa]',
    guardar: async (ids) => {
      try {
        avisar('Guardando…');
        await pedir('/api/admin/categorias/orden', 'PUT', { ids });
        avisar('Orden guardado.');
      } catch (e) {
        avisar((e instanceof Error ? e.message : 'No se pudo guardar') + ' Recargá la página.', true);
      }
    },
  });
}

// ───────────── Visibilidad ─────────────
for (const casilla of document.querySelectorAll<HTMLInputElement>('input[data-activa]')) {
  casilla.addEventListener('change', async () => {
    const item = casilla.closest<HTMLElement>('li[data-id]')!;
    const visible = casilla.checked;
    item.dataset.oculta = String(!visible);
    try {
      await pedir(`/api/admin/categorias/${item.dataset.id}`, 'PATCH', { activa: visible });
      avisar(visible ? 'Categoría visible en la tienda.' : 'Categoría oculta de la tienda.');
    } catch (e) {
      casilla.checked = !visible;
      item.dataset.oculta = String(visible);
      avisar(e instanceof Error ? e.message : 'No se pudo guardar.', true);
    }
  });
}

// ───────────── Editar ─────────────
const ventana = document.querySelector<HTMLDialogElement>('#editar-categoria');
if (ventana) {
  const form = ventana.querySelector('form')!;
  const campo = (nombre: string) => form.elements.namedItem(nombre) as HTMLInputElement;
  for (const boton of document.querySelectorAll<HTMLButtonElement>('[data-editar]')) {
    boton.addEventListener('click', () => {
      const c = JSON.parse(boton.dataset.editar!) as { id: number; nombre: string; padreId: number | null; guia: string; activa: boolean; tieneHijas: boolean };
      campo('id').value = String(c.id);
      campo('nombre').value = c.nombre;
      campo('guiaTalles').value = c.guia;
      campo('activa').checked = c.activa;
      const padre = campo('padreId') as unknown as HTMLSelectElement;
      padre.value = c.padreId ? String(c.padreId) : '';
      // No puede colgar de sí misma ni, si ya tiene subcategorías, pasar a ser subcategoría.
      for (const o of padre.options) o.hidden = o.value === String(c.id);
      padre.disabled = c.tieneHijas;
      ventana.querySelector('[data-aviso-hijas]')?.classList.toggle('hidden', !c.tieneHijas);
      ventana.showModal();
    });
  }
  ventana.querySelector('[data-cerrar]')?.addEventListener('click', () => ventana.close());
  ventana.addEventListener('click', (e) => e.target === ventana && ventana.close());
}
