// Vista previa en vivo de Google y WhatsApp para los campos de buscadores (components/panel/SeoCampos.astro):
// título y descripción (o su sugerencia si están vacíos), contadores de caracteres, la dirección y la foto elegida.

for (const caja of document.querySelectorAll<HTMLElement>('[data-seo]')) {
  const slug = caja.querySelector<HTMLInputElement>('[data-seo-slug]')!;
  const titulo = caja.querySelector<HTMLInputElement>('[data-seo-titulo]')!;
  const descripcion = caja.querySelector<HTMLTextAreaElement>('[data-seo-descripcion]')!;
  const aviso = caja.querySelector<HTMLElement>('[data-seo-aviso]')!;

  const actualizar = () => {
    const t = titulo.value.trim() || titulo.placeholder;
    const d = descripcion.value.trim() || descripcion.placeholder;
    for (const e of caja.querySelectorAll('[data-vista-titulo]')) e.textContent = `${t} | Sukhä`;
    for (const e of caja.querySelectorAll('[data-vista-descripcion]')) e.textContent = d;
    caja.querySelector('[data-vista-url]')!.textContent = `${caja.dataset.dominio} › ${caja.dataset.ruta} › ${slug.value}`;
    aviso.hidden = slug.value === caja.dataset.slugOriginal;
    // Contadores: en gris hasta el largo recomendado, en ámbar si se pasa (Google lo corta).
    for (const [campo, valor] of [[titulo, titulo.value], [descripcion, descripcion.value]] as const) {
      const cuenta = campo.closest('div')!.querySelector<HTMLElement>('[data-cuenta]')!;
      const limite = Number(cuenta.dataset.cuenta);
      cuenta.textContent = valor.length ? `${valor.length}/${limite}` : '';
      cuenta.classList.toggle('text-warning-600', valor.length > limite);
    }
  };
  caja.addEventListener('input', actualizar);
  caja.addEventListener('change', (e) => {
    const radio = e.target as HTMLInputElement;
    if (radio.dataset.seoFoto) caja.querySelector<HTMLImageElement>('[data-vista-foto]')!.src = radio.dataset.seoFoto;
  });
  // La dirección solo admite minúsculas, números y guiones: se corrige mientras se escribe.
  slug.addEventListener('input', () => {
    const limpio = slug.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-');
    if (limpio !== slug.value) slug.value = limpio;
    actualizar();
  });
  actualizar();
}
