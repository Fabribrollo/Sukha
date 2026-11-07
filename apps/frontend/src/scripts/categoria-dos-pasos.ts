// Categoría del producto en dos pasos (components/panel/DatosProducto.astro): el selector de la categoría principal y, al elegirla,
// el de sus subcategorías (si tiene). El campo oculto `categoriaId` lleva la más específica.
for (const caja of document.querySelectorAll<HTMLElement>('[data-categoria]')) {
  const hijas = JSON.parse(caja.dataset.hijas!) as Record<string, { id: number; nombre: string }[]>;
  const padre = caja.querySelector<HTMLSelectElement>('select[name=categoriaPadre]')!;
  const hija = caja.querySelector<HTMLSelectElement>('select[name=categoriaHija]')!;
  const salida = caja.querySelector<HTMLInputElement>('input[name=categoriaId]')!;
  const bloque = hija.parentElement!;
  const llenar = (elegida: string) => {
    const lista = hijas[padre.value] ?? [];
    hija.replaceChildren(new Option('Sin subcategoría', ''), ...lista.map((h) => new Option(h.nombre, String(h.id), false, String(h.id) === elegida)));
    bloque.hidden = !lista.length;
    salida.value = hija.value || padre.value;
  };
  padre.addEventListener('change', () => {
    llenar('');
    salida.value = padre.value;
  });
  hija.addEventListener('change', () => (salida.value = hija.value || padre.value));
  llenar(caja.dataset.hijaActual ?? '');
}
