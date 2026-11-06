// Panel de categorías: ocultar/mostrar con el interruptor y editar en una ventana. El orden del menú se define en Tienda → Cabecera.

import { recortar } from './recorte';
import { aWebp } from './webp';

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
  // Borrar: dos toques; si tiene productos o subcategorías, el servidor lo explica y no se borra.
  const borrar = ventana.querySelector<HTMLButtonElement>('[data-borrar]')!;
  const confirmar = ventana.querySelector<HTMLButtonElement>('[data-borrar-confirmar]')!;
  const errorBorrar = ventana.querySelector<HTMLElement>('[data-borrar-error]')!;
  borrar.addEventListener('click', () => ((borrar.hidden = true), (confirmar.hidden = false), (errorBorrar.hidden = true)));
  confirmar.addEventListener('click', async () => {
    confirmar.disabled = true;
    const r = await fetch(`/api/admin/categorias/${campo('id').value}`, { method: 'DELETE' });
    if (r.ok) return location.assign(`${location.pathname}?ok`);
    errorBorrar.textContent = ((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No se pudo borrar.';
    errorBorrar.hidden = false;
    confirmar.disabled = false;
    confirmar.hidden = true;
    borrar.hidden = false;
  });
  for (const boton of document.querySelectorAll<HTMLButtonElement>('[data-editar]')) {
    boton.addEventListener('click', () => {
      const c = JSON.parse(boton.dataset.editar!) as { id: number; nombre: string; padreId: number | null; guia: string; activa: boolean; tieneHijas: boolean; imagen: string | null };
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
      mostrarFoto(c.id, c.imagen);
      borrar.hidden = false;
      confirmar.hidden = true;
      errorBorrar.hidden = true;
      ventana.showModal();
    });
  }
  // Foto opcional de la categoría: se sube apenas se elige y se recarga para ver el resultado.
  const previa = ventana.querySelector<HTMLImageElement>('[data-foto-previa]')!;
  const vacia = ventana.querySelector<HTMLElement>('[data-foto-vacia]')!;
  const quitar = ventana.querySelector<HTMLButtonElement>('[data-foto-quitar]')!;
  const archivo = ventana.querySelector<HTMLInputElement>('[data-foto-archivo]')!;
  const textoFoto = ventana.querySelector<HTMLElement>('[data-foto-texto]')!;
  const estadoFoto = ventana.querySelector<HTMLElement>('[data-foto-estado]')!;
  let categoriaId = 0;
  function mostrarFoto(id: number, clave: string | null) {
    categoriaId = id;
    previa.hidden = !clave;
    vacia.hidden = !!clave;
    quitar.hidden = !clave;
    textoFoto.textContent = clave ? 'Cambiar foto' : 'Subir foto';
    if (clave) previa.src = `/api/imagenes/${clave}/mediano.webp`;
    archivo.value = '';
  }
  archivo.addEventListener('change', async () => {
    const original = archivo.files?.[0];
    if (!original) return;
    const f = await recortar(original);
    if (!f) return void (archivo.value = '');
    try {
      estadoFoto.textContent = 'Subiendo…';
      const datos = new FormData();
      datos.set('mediano', await aWebp(f, 900), 'mediano.webp');
      const r = await fetch(`/api/admin/categorias/${categoriaId}/imagen`, { method: 'POST', body: datos });
      if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No se pudo subir la foto.');
      location.reload();
    } catch (e) {
      estadoFoto.textContent = e instanceof Error ? e.message : 'No se pudo subir la foto.';
    }
  });
  quitar.addEventListener('click', async () => {
    const r = await fetch(`/api/admin/categorias/${categoriaId}/imagen`, { method: 'DELETE' });
    if (r.ok) location.reload();
    else estadoFoto.textContent = 'No se pudo quitar la foto.';
  });
  ventana.querySelector('[data-cerrar]')?.addEventListener('click', () => ventana.close());
  ventana.addEventListener('click', (e) => e.target === ventana && ventana.close());
}
