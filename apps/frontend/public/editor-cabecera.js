// Solo se carga dentro del editor de la cabecera (/?vista-previa=1&editor=cabecera, en un iframe del panel).
// Tocar una entrada del menú la selecciona y avisa al panel; el panel pide marcar una (y abrir su desplegable en escritorio,
// o su pantalla del menú en el celular). Mensajes entre ventanas del mismo sitio, con origen: 'cabecera'.
(() => {
  const estilo = document.createElement('style');
  estilo.textContent = `
    [data-eid]{cursor:pointer}
    [data-eid]:hover{outline:2px dashed #465fff;outline-offset:2px}
    [data-eid].sel{outline:3px solid #465fff;outline-offset:2px}
    [data-panel][data-eid]:hover,[data-panel][data-eid].sel{outline-offset:-3px}
    [data-menu-movil] [data-eid]{outline-offset:-3px}`;
  document.head.append(estilo);

  const avisar = (m) => parent.postMessage({ origen: 'cabecera', ...m }, location.origin);
  const escritorio = matchMedia('(min-width: 768px)');
  let marcada = null;

  function abrirMenu(abierto) {
    const casilla = document.getElementById('menu-t');
    if (!casilla || casilla.checked === abierto) return;
    casilla.checked = abierto;
    casilla.dispatchEvent(new Event('change'));
  }
  // Marca la entrada y muestra lo que abre: su desplegable (escritorio) o su pantalla del menú (celular).
  function marcar(id) {
    marcada = id;
    for (const n of document.querySelectorAll('[data-eid]')) n.classList.toggle('sel', n.dataset.eid === id);
    const aqui = (sel) => document.querySelector(sel + '[data-eid="' + CSS.escape(id ?? '') + '"]');
    if (escritorio.matches) {
      abrirMenu(false);
      // La cabecera abre y cierra con pointerenter: se simula (solo los eventos propios pasan, ver más abajo).
      const gatillo = aqui('[data-menu-abre]') ?? aqui('[data-menu-sin-panel]');
      (gatillo ?? document.querySelector('[data-cabecera]'))?.dispatchEvent(new Event(gatillo ? 'pointerenter' : 'pointerleave'));
    } else {
      abrirMenu(Boolean(id));
      if (!id) return;
      const menu = document.querySelector('[data-menu-movil]');
      menu?.querySelector('[data-volver]')?.click();
      if (id === 'movil') menu?.scrollTo({ top: menu.scrollHeight });
      else aqui('[data-ir]')?.click();
    }
  }

  // Dentro de la vista previa nada navega ni abre solo: tocar selecciona. Solo el abrir y cerrar el menú del celular y «Volver» funcionan.
  document.addEventListener('click', (e) => {
    if (!e.isTrusted) return;
    const t = e.target.closest?.bind(e.target);
    if (!t || t('label[for="menu-t"], #menu-t, [data-volver]')) return;
    e.preventDefault();
    if (!t('[data-ir]')) e.stopPropagation();
    avisar({ tipo: 'seleccion', id: t('[data-eid]')?.dataset.eid ?? null });
  }, true);
  document.addEventListener('submit', (e) => e.preventDefault(), true);
  // El mouse no abre ni cierra los desplegables solo: lo elige el panel (así el que se edita no se cierra al salir de la cabecera).
  for (const tipo of ['pointerenter', 'pointerleave'])
    document.addEventListener(tipo, (e) => e.isTrusted && e.target.closest?.('[data-cabecera]') && e.stopPropagation(), true);

  addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.data?.origen !== 'cabecera') return;
    if (e.data.tipo === 'marcar') marcar(e.data.id);
    else if (e.data.tipo === 'actualizar') location.reload();
  });
  // Al cambiar el ancho de la vista (escritorio ↔ celular) se vuelve a mostrar lo mismo en el formato nuevo.
  escritorio.addEventListener('change', () => marcar(marcada));
  avisar({ tipo: 'lista' });
})();
