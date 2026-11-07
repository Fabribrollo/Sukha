// Vista de lista o de cuadrícula (components/panel/VistaBoton.astro). La elección se recuerda por pantalla en este navegador.
for (const caja of document.querySelectorAll<HTMLElement>('[data-vista]')) {
  const clave = `panel-vista-${caja.dataset.vista}`;
  const botones = [...caja.querySelectorAll<HTMLButtonElement>('[data-vista-boton]')];
  const paneles = [...caja.querySelectorAll<HTMLElement>('[data-vista-panel]')];
  const aplicar = (vista: string) => {
    caja.dataset.vistaActual = vista;
    for (const b of botones) b.setAttribute('aria-pressed', String(b.dataset.vistaBoton === vista));
    for (const p of paneles) p.hidden = p.dataset.vistaPanel !== vista;
  };
  let guardada = 'lista';
  try { guardada = localStorage.getItem(clave) === 'grilla' ? 'grilla' : 'lista'; } catch {}
  aplicar(guardada);
  for (const b of botones) b.addEventListener('click', () => {
    aplicar(b.dataset.vistaBoton!);
    try { localStorage.setItem(clave, b.dataset.vistaBoton!); } catch {}
  });
}
