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
    casilla.disabled = true;
    item.dataset.oculta = String(!visible);
    try {
      await pedir(`/api/admin/categorias/${item.dataset.id}`, 'PATCH', { activa: visible });
      avisar(visible ? 'Categoría visible en la tienda.' : 'Categoría oculta de la tienda.');
    } catch (e) {
      casilla.checked = !visible;
      item.dataset.oculta = String(visible);
      avisar(e instanceof Error ? e.message : 'No se pudo guardar.', true);
    } finally { casilla.disabled = false; }
  });
}

// ───────────── Editar ─────────────
const ventana = document.querySelector<HTMLDialogElement>('#editar-categoria');
if (ventana) {
  const form = ventana.querySelector('form')!;
  const buscadores = document.querySelector<HTMLDialogElement>('#buscadores-categoria')!;
  for (const entrada of buscadores.querySelectorAll('input, textarea, select')) entrada.setAttribute('form', 'form-editar-categoria');
  const abrirBuscadores = () => { ventana.close(); buscadores.showModal(); };
  const volver = () => { buscadores.close(); ventana.showModal(); ventana.querySelector<HTMLButtonElement>('[data-abrir-buscadores]')?.focus(); };
  ventana.querySelector('[data-abrir-buscadores]')!.addEventListener('click', abrirBuscadores);
  buscadores.querySelectorAll('[data-volver-categoria]').forEach(b => b.addEventListener('click', volver));
  buscadores.addEventListener('cancel', e => { e.preventDefault(); volver(); });
  buscadores.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); volver(); } });
  // Un campo inválido debe mostrarse antes de que el navegador intente enfocarlo.
  for (const entrada of buscadores.querySelectorAll('input, textarea')) entrada.addEventListener('invalid', () => { if (!buscadores.open) abrirBuscadores(); });
  const campo = (nombre: string) => form.elements.namedItem(nombre) as HTMLInputElement;
  // Borrar: dos toques; si tiene productos o subcategorías, el servidor lo explica y no se borra.
  const borrar = ventana.querySelector<HTMLButtonElement>('[data-borrar]')!;
  const confirmar = ventana.querySelector<HTMLButtonElement>('[data-borrar-confirmar]')!;
  const errorBorrar = ventana.querySelector<HTMLElement>('[data-borrar-error]')!;
  borrar.addEventListener('click', () => ((borrar.hidden = true), (confirmar.hidden = false), (errorBorrar.hidden = true)));
  confirmar.addEventListener('click', async () => {
    confirmar.disabled = true;
    const r = await fetch(`/api/admin/categorias/${campo('id').value}`, { method: 'DELETE' }).catch(() => null);
    if (r?.ok) return location.assign(`${location.pathname}?ok`);
    errorBorrar.textContent = ((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No se pudo borrar. Revisá tu conexión e intentá otra vez.';
    errorBorrar.hidden = false;
    confirmar.disabled = false;
    confirmar.hidden = true;
    borrar.hidden = false;
  });
  for (const boton of document.querySelectorAll<HTMLButtonElement>('[data-editar]')) {
    boton.addEventListener('click', () => {
      const c = JSON.parse(boton.dataset.editar!) as { slug: string; seoTitulo: string | null; seoDescripcion: string | null; id: number; nombre: string; padreId: number | null; guia: string; activa: boolean; tieneHijas: boolean; imagen: string | null };
      campo('id').value = String(c.id);
      campo('slug').value = c.slug ?? '';
      campo('seoTitulo').value = c.seoTitulo ?? '';
      campo('seoDescripcion').value = c.seoDescripcion ?? '';
      campo('seoTitulo').placeholder = c.nombre;
      campo('seoDescripcion').placeholder = c.nombre + ' en Sukhä. Envíos a todo el país.';
      const seo = buscadores.querySelector<HTMLElement>('[data-seo]')!;
      seo.dataset.slugOriginal = c.slug;
      seo.querySelector<HTMLImageElement>('[data-vista-foto]')!.src = c.imagen ? '/api/imagenes/' + c.imagen + '/mediano.webp' : '/favicon.svg';
      seo.dispatchEvent(new Event('input'));
      ventana.querySelectorAll('details').forEach((d) => d.open = false);
      campo('nombre').value = c.nombre;
      campo('guiaTalles').value = c.guia;
      campo('activa').checked = c.activa;
      const padre = campo('padreId') as unknown as HTMLSelectElement;
      padre.value = c.padreId ? String(c.padreId) : '';
      // No puede colgar de sí misma ni, si ya tiene subcategorías, pasar a ser subcategoría.
      for (const o of padre.options) o.hidden = o.value === String(c.id);
      padre.disabled = true;
      const cambioPadre = ventana.querySelector<HTMLDetailsElement>('[data-cambiar-padre]')!;
      cambioPadre.ontoggle = () => { padre.disabled = c.tieneHijas || !cambioPadre.open; };
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
  function actualizarTarjeta(clave: string | null) {
    const tarjeta = document.querySelector<HTMLElement>('li[data-id="' + categoriaId + '"]');
    const boton = tarjeta?.querySelector<HTMLButtonElement>('[data-editar]');
    if (boton) boton.dataset.editar = JSON.stringify({ ...JSON.parse(boton.dataset.editar!), imagen: clave });
    const zona = tarjeta?.querySelector<HTMLElement>('[data-imagen-categoria]');
    if (zona) {
      zona.querySelectorAll('img, [data-sin-foto]').forEach((n) => n.remove());
      if (clave) {
        const img = document.createElement('img');
        img.src = '/api/imagenes/' + clave + '/mediano.webp';
        img.alt = '';
        img.className = 'size-full object-cover group-data-[oculta=true]/item:opacity-50';
        zona.prepend(img);
      } else {
        const texto = document.createElement('span');
        texto.dataset.sinFoto = '';
        texto.className = 'flex size-full items-center justify-center text-sm text-gray-400';
        texto.textContent = 'Sin foto';
        zona.prepend(texto);
      }
    }
  }
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
      const { clave } = await r.json() as { clave: string };
      mostrarFoto(categoriaId, clave);
      estadoFoto.textContent = 'Foto guardada. Podés seguir editando.';
      actualizarTarjeta(clave);
    } catch (e) {
      estadoFoto.textContent = e instanceof Error ? e.message : 'No se pudo subir la foto.';
    }
  });
  quitar.addEventListener('click', async () => {
    const r = await fetch(`/api/admin/categorias/${categoriaId}/imagen`, { method: 'DELETE' });
    if (r.ok) { mostrarFoto(categoriaId, null); actualizarTarjeta(null); estadoFoto.textContent = 'Foto eliminada.'; }
    else estadoFoto.textContent = 'No se pudo quitar la foto.';
  });
  ventana.querySelector('[data-cerrar]')?.addEventListener('click', () => ventana.close());
  ventana.addEventListener('click', (e) => e.target === ventana && ventana.close());
}

