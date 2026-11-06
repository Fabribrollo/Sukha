// Ventana para recortar una foto antes de subirla (Cropper.js: arrastrar, pellizcar para acercar, esquinas para el tamaño).
// Devuelve el archivo recortado, el original si elige «Usar completa», o null si cancela.
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';

const PROPORCIONES: [string, number][] = [['Libre', NaN], ['Cuadrada', 1], ['Vertical', 4 / 5], ['Horizontal', 16 / 9]];

export function recortar(archivo: File, opciones: { aspecto?: number; avance?: string } = {}): Promise<File | null> {
  return new Promise((listo) => {
    const url = URL.createObjectURL(archivo);
    const ventana = document.createElement('dialog');
    ventana.className = 'm-auto w-[min(92vw,44rem)] rounded-2xl border border-gray-200 bg-white p-0 shadow-theme-lg backdrop:bg-gray-900/50';
    const filtros = opciones.aspecto
      ? ''
      : `<div class="flex flex-wrap gap-1.5" role="group" aria-label="Proporción">${PROPORCIONES.map(([n], i) => `<button type="button" data-prop="${i}" aria-pressed="${i === 0}" class="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 ring-1 ring-gray-300 ring-inset aria-pressed:bg-brand-25 aria-pressed:text-brand-600 aria-pressed:ring-brand-300">${n}</button>`).join('')}</div>`;
    ventana.innerHTML = `<form method="dialog" class="flex max-h-[92vh] flex-col gap-3 p-4">
      <div class="flex items-center justify-between gap-2"><h2 class="text-sm font-medium text-gray-800">Recortar foto</h2><span class="text-theme-xs text-gray-500">${opciones.avance ?? ''}</span></div>
      <div class="h-[55vh] min-h-0 overflow-hidden rounded-lg bg-gray-100"><img src="${url}" alt="Foto a recortar" class="block max-w-full" /></div>
      ${filtros}
      <div class="flex flex-wrap justify-end gap-2">
        <button type="button" data-cancelar class="btn btn-secundario">Cancelar</button>
        <button type="button" data-completa class="btn btn-secundario">Usar completa</button>
        <button type="button" data-aceptar class="btn btn-primario">Recortar</button>
      </div></form>`;
    document.body.append(ventana);
    const img = ventana.querySelector('img')!;
    let cropper: Cropper | undefined;
    const cerrar = (resultado: File | null) => {
      cropper?.destroy();
      URL.revokeObjectURL(url);
      ventana.remove();
      listo(resultado);
    };
    img.addEventListener('load', () => {
      cropper = new Cropper(img, { viewMode: 1, autoCropArea: 1, aspectRatio: opciones.aspecto ?? NaN, background: false, responsive: true });
    }, { once: true });
    for (const b of ventana.querySelectorAll<HTMLButtonElement>('[data-prop]'))
      b.addEventListener('click', () => {
        cropper?.setAspectRatio(PROPORCIONES[Number(b.dataset.prop)][1]);
        for (const o of ventana.querySelectorAll('[data-prop]')) o.setAttribute('aria-pressed', String(o === b));
      });
    ventana.querySelector('[data-cancelar]')!.addEventListener('click', () => cerrar(null));
    ventana.addEventListener('cancel', (e) => (e.preventDefault(), cerrar(null))); // Esc
    ventana.querySelector('[data-completa]')!.addEventListener('click', () => cerrar(archivo));
    ventana.querySelector('[data-aceptar]')!.addEventListener('click', () => {
      const lienzo = cropper?.getCroppedCanvas({ maxWidth: 4096, maxHeight: 4096, imageSmoothingQuality: 'high' });
      if (!lienzo) return cerrar(archivo);
      lienzo.toBlob((b) => cerrar(b ? new File([b], 'recorte.png', { type: 'image/png' }) : archivo), 'image/png');
    });
    ventana.showModal();
  });
}
