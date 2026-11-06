// Menús de la cabecera. Escritorio: al pasar por (o enfocar) una categoría con subcategorías o «Colecciones» se abre su panel debajo de
// la cabecera; se cierra al salir, con Escape o al tocar un link sin panel. Celular: el menú a pantalla completa muestra una pantalla
// por vez (principal, una categoría o las colecciones) y «Volver» regresa. Sin JavaScript, cada link lleva a su página.

const escritorio = matchMedia('(min-width: 768px)');

// ───────────── Escritorio ─────────────
const cabecera = document.querySelector<HTMLElement>('[data-cabecera]');
if (cabecera) {
  const paneles = [...cabecera.querySelectorAll<HTMLElement>('[data-panel]')];
  const gatillos = [...cabecera.querySelectorAll<HTMLElement>('[data-menu-abre]')];
  const fondo = cabecera.querySelector<HTMLElement>('[data-menu-fondo]');
  let espera: number | undefined;

  const cerrar = () => {
    clearTimeout(espera);
    for (const p of paneles) p.hidden = true;
    for (const g of gatillos) g.setAttribute('aria-expanded', 'false');
    if (fondo) fondo.hidden = true;
  };
  const abrir = (id: string) => {
    if (!escritorio.matches) return;
    clearTimeout(espera);
    for (const p of paneles) p.hidden = p.dataset.panel !== id;
    for (const g of gatillos) g.setAttribute('aria-expanded', String(g.dataset.menuAbre === id));
    if (fondo) fondo.hidden = false;
  };

  for (const g of gatillos) {
    g.addEventListener('pointerenter', () => abrir(g.dataset.menuAbre!));
    g.addEventListener('focus', () => abrir(g.dataset.menuAbre!));
  }
  for (const l of cabecera.querySelectorAll<HTMLElement>('[data-menu-sin-panel]')) {
    l.addEventListener('pointerenter', cerrar);
    l.addEventListener('focus', cerrar);
  }
  // Salir de la cabecera (y de su panel) cierra con una pausa corta, para no cerrarlo al pasar de un link a otro.
  cabecera.addEventListener('pointerleave', () => (espera = window.setTimeout(cerrar, 150)));
  cabecera.addEventListener('pointerenter', () => clearTimeout(espera));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && cerrar());
}

// ───────────── Celular ─────────────
const menu = document.querySelector<HTMLElement>('[data-menu-movil]');
if (menu) {
  const pantallas = [...menu.querySelectorAll<HTMLElement>('[data-pantalla]')];
  const mostrar = (id: string) => {
    for (const p of pantallas) p.hidden = p.dataset.pantalla !== id;
    menu.scrollTo({ top: 0 });
  };
  for (const b of menu.querySelectorAll<HTMLElement>('[data-ir]')) b.addEventListener('click', () => mostrar(b.dataset.ir!));
  for (const b of menu.querySelectorAll<HTMLElement>('[data-volver]')) b.addEventListener('click', () => mostrar('principal'));
  // Al cerrar el menú, la próxima vez arranca en la pantalla principal; con el menú abierto no se desplaza la página de atrás.
  const casilla = document.getElementById('menu-t') as HTMLInputElement | null;
  casilla?.addEventListener('change', () => {
    document.body.classList.toggle('overflow-hidden', casilla.checked);
    if (!casilla.checked) mostrar('principal');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && casilla?.checked) {
      casilla.checked = false;
      casilla.dispatchEvent(new Event('change'));
    }
  });
}
