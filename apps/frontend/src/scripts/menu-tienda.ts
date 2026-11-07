// Menús de la cabecera. Escritorio: al pasar por (o enfocar) una categoría con subcategorías o «Colecciones» se abre su panel debajo de
// la cabecera; se cierra al salir, con Escape o al tocar un link sin panel. Celular: el menú a pantalla completa muestra una pantalla
// por vez (principal, una categoría o las colecciones) y «Volver» regresa. Sin JavaScript, cada link lleva a su página.
// Los movimientos (apertura, cierre, cambio de pantalla) son CSS en styles/tienda.css; acá solo se marcan los estados:
// data-cerrando / data-conmuta en la cabecera y data-dir en el menú del celular.

const escritorio = matchMedia('(min-width: 768px)');
const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)');
// Las fotos de los paneles son lazy y están ocultas: se piden recién al primer uso para que no aparezcan de golpe.
const adelantarFotos = (raiz: ParentNode) => {
  for (const img of raiz.querySelectorAll<HTMLImageElement>('img[loading="lazy"]')) img.loading = 'eager';
};

// ───────────── Escritorio ─────────────
const cabecera = document.querySelector<HTMLElement>('[data-cabecera]');
if (cabecera) {
  const paneles = [...cabecera.querySelectorAll<HTMLElement>('[data-panel]')];
  const gatillos = [...cabecera.querySelectorAll<HTMLElement>('[data-menu-abre]')];
  const fondo = cabecera.querySelector<HTMLElement>('[data-menu-fondo]');
  let espera: number | undefined;
  let cierre: number | undefined;
  let fotosPedidas = false;

  const abierto = () => paneles.find((p) => !p.hidden);
  const ocultar = () => {
    clearTimeout(cierre);
    delete cabecera.dataset.cerrando;
    delete cabecera.dataset.conmuta;
    for (const p of paneles) p.hidden = true;
    for (const g of gatillos) g.setAttribute('aria-expanded', 'false');
    if (fondo) fondo.hidden = true;
  };
  // Cierra con un fundido corto (180 ms); sin animaciones, de una.
  const cerrar = () => {
    clearTimeout(espera);
    if (!abierto() || cabecera.dataset.cerrando !== undefined) return;
    if (sinMovimiento.matches) return ocultar();
    cabecera.dataset.cerrando = '';
    cierre = window.setTimeout(ocultar, 180);
  };
  const abrir = (id: string) => {
    if (!escritorio.matches) return;
    clearTimeout(espera);
    clearTimeout(cierre);
    const actual = abierto();
    const cerrandose = cabecera.dataset.cerrando !== undefined;
    delete cabecera.dataset.cerrando;
    if (actual?.dataset.panel === id && !cerrandose) return;
    // Pasar de un panel a otro con el menú ya abierto: fundido corto, sin repetir la entrada completa.
    if (actual && !cerrandose) cabecera.dataset.conmuta = '';
    else delete cabecera.dataset.conmuta;
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
  cabecera.addEventListener('pointerenter', () => {
    clearTimeout(espera);
    if (!fotosPedidas && escritorio.matches) {
      fotosPedidas = true;
      adelantarFotos(cabecera);
    }
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && cerrar());
}

// ───────────── Celular ─────────────
const menu = document.querySelector<HTMLElement>('[data-menu-movil]');
if (menu) {
  const pantallas = [...menu.querySelectorAll<HTMLElement>('[data-pantalla]')];
  // dir: hacia dónde se mueve el cambio de pantalla (adelante = entra una categoría, atrás = vuelve); sin dir, no hay animación de pantalla.
  const mostrar = (id: string, dir?: 'adelante' | 'atras') => {
    if (dir) menu.dataset.dir = dir;
    else delete menu.dataset.dir;
    for (const p of pantallas) p.hidden = p.dataset.pantalla !== id;
    menu.scrollTo({ top: 0 });
  };
  for (const b of menu.querySelectorAll<HTMLElement>('[data-ir]')) b.addEventListener('click', () => mostrar(b.dataset.ir!, 'adelante'));
  for (const b of menu.querySelectorAll<HTMLElement>('[data-volver]')) b.addEventListener('click', () => mostrar('principal', 'atras'));
  // Al cerrar el menú, la próxima vez arranca en la pantalla principal (cuando termina de deslizarse); con el menú abierto no se desplaza la página de atrás.
  const casilla = document.getElementById('menu-t') as HTMLInputElement | null;
  let reinicio: number | undefined;
  let fotosPedidas = false;
  casilla?.addEventListener('change', () => {
    document.body.classList.toggle('overflow-hidden', casilla.checked);
    clearTimeout(reinicio);
    if (casilla.checked) {
      if (!fotosPedidas) {
        fotosPedidas = true;
        adelantarFotos(menu);
      }
    } else {
      reinicio = window.setTimeout(() => mostrar('principal'), sinMovimiento.matches ? 0 : 500);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && casilla?.checked) {
      casilla.checked = false;
      casilla.dispatchEvent(new Event('change'));
    }
  });
}
