// Pestañas dentro de una página (components/panel/Pestanas.astro): cada link `#nombre` muestra su <section data-panel="nombre">
// y oculta las demás sin recargar, así lo escrito en otra pestaña no se pierde. La elegida queda en la dirección (#nombre)
// para volver a ella; sin #, se ve la que marcó el servidor (data-inicial: por ejemplo, la del formulario que dio error).
const nav = document.querySelector<HTMLElement>('[data-pestanas]');

if (nav) {
  const paneles = [...document.querySelectorAll<HTMLElement>('[data-panel]')];
  const mostrar = () => {
    const pedida = location.hash.slice(1);
    const nombre = paneles.some((p) => p.dataset.panel === pedida) ? pedida : nav.dataset.inicial;
    for (const p of paneles) p.hidden = p.dataset.panel !== nombre;
    for (const a of nav.querySelectorAll<HTMLAnchorElement>('a[data-pestana]')) {
      if (a.hash !== `#${nombre}`) a.removeAttribute('aria-current');
      else {
        a.setAttribute('aria-current', 'page');
        // En el celular las pestañas se desplazan de costado: la elegida queda a la vista.
        nav.scrollTo({ left: a.offsetLeft - nav.clientWidth / 2 + a.clientWidth / 2 });
      }
    }
  };
  addEventListener('hashchange', mostrar);
  mostrar();
  // Un campo inválido en una pestaña oculta (al guardar desde la barra) lleva a esa pestaña para que se vea el aviso.
  document.addEventListener(
    'invalid',
    (e) => {
      const panel = (e.target as Element).closest<HTMLElement>('[data-panel]');
      if (panel?.hidden) location.hash = panel.dataset.panel!;
    },
    true,
  );
}
