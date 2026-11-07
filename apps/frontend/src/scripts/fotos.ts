// Subida de fotos desde el panel. El navegador achica cada foto y la convierte a WebP antes de enviarla,
// así se guardan archivos livianos sin pagar ningún servicio de redimensionado.
//
// Se usa en cualquier <form data-subida="..."> con un <input type="file">:
//   data-subida   dirección de la API que recibe el formulario
//   data-tamanos  JSON con los archivos a generar a partir del campo "foto": { "chico": 400, ... } (ancho máximo en px)
// Los demás campos del formulario (color, texto alternativo, enlace...) se mandan tal cual.
//   data-aspecto  proporción fija del recorte (ancho / alto); sin esto se elige al recortar
//   data-guardar-original  ancho máximo (px) con el que se guarda además la foto original sin recortar (campo «original» + «encuadre»)
//   data-auto    sube apenas se eligen (o se sueltan) las fotos, sin botón
// Un segundo <input type="file" data-ancho="900"> se convierte por separado y va con su propio nombre.

import { recortarConEncuadre } from './recorte';
import { aWebp } from './webp';

for (const form of document.querySelectorAll<HTMLFormElement>('form[data-subida]')) {
  const estado = form.querySelector<HTMLElement>('[data-estado]');
  const boton = form.querySelector<HTMLButtonElement>('button');
  const decir = (texto: string, esError = false) => {
    if (!estado) return;
    estado.textContent = texto;
    estado.className = esError ? 'text-theme-sm font-medium text-error-600' : 'text-theme-xs text-gray-500';
  };

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const principal = form.querySelector<HTMLInputElement>('input[type=file][name=foto]')!;
    const fotos = [...(principal.files ?? [])];
    if (!fotos.length) return decir('Elegí al menos una foto.', true);
    const tamanos = JSON.parse(form.dataset.tamanos!) as Record<string, number>;
    if (boton) boton.disabled = true;
    principal.disabled = true;

    try {
      // Cada foto elegida se sube por separado, con los mismos datos del formulario.
      let subidas = 0;
      for (const [i, original] of fotos.entries()) {
        const recorte = await recortarConEncuadre(original, { aspecto: form.dataset.aspecto ? Number(form.dataset.aspecto) : undefined, avance: fotos.length > 1 ? `Foto ${i + 1} de ${fotos.length}` : '' });
        if (!recorte) continue; // canceló el recorte de esta foto: no se sube
        const foto = recorte.archivo;
        subidas++;
        decir(`Preparando y subiendo foto ${i + 1} de ${fotos.length}…`);
        const datos = new FormData();
        for (const campo of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input:not([type=file]), select')) {
          if (campo.name && campo.value) datos.set(campo.name, campo.value);
        }
        for (const [nombre, ancho] of Object.entries(tamanos)) datos.set(nombre, await aWebp(foto, ancho), `${nombre}.webp`);
        // La original sin recortar queda guardada para poder reencuadrar sin perder calidad.
        if (form.dataset.guardarOriginal) {
          datos.set('original', await aWebp(original, Number(form.dataset.guardarOriginal)), 'original.webp');
          datos.set('encuadre', JSON.stringify(recorte.encuadre));
        }
        for (const extra of form.querySelectorAll<HTMLInputElement>('input[type=file][data-ancho]')) {
          const archivo = extra.files?.[0];
          if (archivo) datos.set(extra.name, await aWebp(archivo, Number(extra.dataset.ancho)), `${extra.name}.webp`);
        }
        const r = await fetch(form.dataset.subida!, { method: 'POST', body: datos });
        if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No se pudo subir la foto.');
      }
      if (!subidas) {
        decir('');
        principal.disabled = false;
        principal.value = '';
        if (boton) boton.disabled = false;
        return;
      }
      // Con cambios sin guardar en la página (barra de guardado a la vista), recargar los borraría: la foto se ve al guardar.
      if (document.querySelector('[data-barra-guardado]:not([hidden])')) {
        decir(fotos.length > 1 ? 'Fotos subidas. Se ven al guardar los cambios.' : 'Foto subida. Se ve al guardar los cambios.');
        principal.disabled = false;
        principal.value = '';
        return;
      }
      // Se vuelve a la misma pestaña (#imagen en Configuración); a la misma dirección con # el navegador no recargaría.
      if (location.search === '?ok' && location.hash) location.reload();
      else location.assign(`${location.pathname}?ok${location.hash}`);
    } catch (e) {
      decir(e instanceof Error ? e.message : 'No se pudo subir la foto.', true);
      if (boton) boton.disabled = false;
      principal.disabled = false;
    }
  });

  if ('auto' in form.dataset) {
    const entrada = form.querySelector<HTMLInputElement>('input[type=file][name=foto]')!;
    entrada.addEventListener('change', () => entrada.files?.length && form.requestSubmit());
    // También se pueden soltar las fotos sobre la zona punteada.
    const zona = form.querySelector<HTMLElement>('[data-zona]');
    zona?.addEventListener('dragover', (e) => {
      e.preventDefault();
      zona.classList.add('border-brand-400', 'bg-brand-25');
    });
    zona?.addEventListener('dragleave', () => zona.classList.remove('border-brand-400', 'bg-brand-25'));
    zona?.addEventListener('drop', (e) => {
      e.preventDefault();
      zona.classList.remove('border-brand-400', 'bg-brand-25');
      if (!e.dataTransfer?.files.length) return;
      entrada.files = e.dataTransfer.files;
      form.requestSubmit();
    });
  }
}
