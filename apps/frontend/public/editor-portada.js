// Solo se carga dentro del editor de portada (/?vista-previa=1&editor=1, en un iframe del panel).
// Tocar una sección la selecciona y avisa al panel; el panel también puede pedir resaltar una (mensajes entre ventanas del mismo sitio).
(() => {
  const estilo = document.createElement('style');
  estilo.textContent = `
    [data-seccion]{position:relative;cursor:pointer}
    [data-seccion]>*{pointer-events:none}
    [data-seccion]:hover{outline:2px dashed #465fff;outline-offset:-2px}
    [data-seccion].sel{outline:3px solid #465fff;outline-offset:-3px}
    [data-seccion].sel::before,[data-seccion]:hover::before{content:attr(data-etiqueta);position:absolute;top:8px;left:8px;z-index:20;background:#465fff;color:#fff;font:600 12px/1 system-ui,sans-serif;padding:6px 10px;border-radius:999px}
    header,footer{pointer-events:none}`;
  document.head.append(estilo);

  const marcar = (id) => {
    for (const s of document.querySelectorAll('[data-seccion]')) s.classList.toggle('sel', s.dataset.seccion === id);
  };

  // ───────────── Vista previa al instante ─────────────
  // El panel manda las secciones en cada cambio. Lo que se puede cambiar en el lugar (textos, foto, orden) se cambia al
  // instante; si hace falta algo que solo arma el servidor (una sección nueva u oculta, productos, tono), se avisa al panel
  // ("necesita") y, cuando el borrador ya está guardado, 'actualizar' cambia solo las secciones distintas, sin recargar.
  let previo = null;
  const TEXTOS = ['etiqueta', 'titulo', 'parrafo', 'boton'];
  const campo = (nodo, nombre) => nodo.querySelector('[data-campo="' + nombre + '"]');
  function ponerTexto(el, valor, sufijo) {
    el.textContent = valor + (sufijo || '');
    el.style.display = valor ? '' : 'none';
  }
  // Devuelve true si el cambio de esta sección no se pudo hacer acá.
  function parchar(nodo, antes, ahora) {
    let falta = false;
    for (const k of new Set([...Object.keys(antes), ...Object.keys(ahora)])) {
      if (JSON.stringify(antes[k]) === JSON.stringify(ahora[k]) || k === 'id' || k === 'tipo') continue;
      const v = ahora[k] ?? '';
      if (TEXTOS.includes(k)) {
        const el = campo(nodo, k);
        if (el) ponerTexto(el, v, el.dataset.sufijo);
        else if (v) falta = true;
      } else if (k === 'enlace') {
        const el = campo(nodo, 'boton');
        if (el) el.setAttribute('href', v);
        else if (v) falta = true;
      } else if (k === 'imagen') {
        const imgs = nodo.querySelectorAll('[data-campo-img]');
        if (!imgs.length || !v) falta = true;
        for (const i of imgs) {
          const url = '/api/imagenes/' + v + (i.tagName === 'SOURCE' ? '/mediano.webp' : '/grande.webp');
          i.setAttribute(i.tagName === 'SOURCE' ? 'srcset' : 'src', url);
        }
      } else if (k === 'items' && antes.items?.length === ahora.items?.length) {
        ahora.items.forEach((it, n) => {
          const fila = nodo.querySelector('[data-item="' + n + '"]');
          for (const c of ['titulo', 'texto']) {
            const el = fila && campo(fila, c);
            if (el) ponerTexto(el, it[c] ?? '');
            else if (it[c]) falta = true;
          }
        });
      } else falta = true;
    }
    return falta;
  }
  function aplicar(secciones) {
    const nodos = new Map([...document.querySelectorAll('[data-seccion]')].map((n) => [n.dataset.seccion, n]));
    let falta = false;
    if (previo) {
      const visibles = secciones.filter((s) => s.visible);
      if (visibles.length !== nodos.size) falta = true;
      for (const s of visibles) {
        const nodo = nodos.get(s.id);
        const antes = previo.find((p) => p.id === s.id);
        if (!nodo || !antes) falta = true;
        else if (parchar(nodo, antes, s)) falta = true;
      }
      // Orden: se mueven los nodos que ya están.
      let anterior = null;
      for (const s of visibles) {
        const nodo = nodos.get(s.id);
        if (!nodo) continue;
        if (anterior) anterior.after(nodo);
        anterior = nodo;
      }
    }
    previo = structuredClone(secciones);
    if (falta) avisar({ tipo: 'necesita' });
  }
  let seleccion = null;
  async function actualizar() {
    const doc = new DOMParser().parseFromString(await (await fetch(location.href, { credentials: 'same-origin' })).text(), 'text/html');
    const nuevos = [...doc.querySelectorAll('[data-seccion]')];
    const viejos = new Map([...document.querySelectorAll('[data-seccion]')].map((n) => [n.dataset.seccion, n]));
    // Una isla nueva (Newsletter) necesita los scripts de la página: se recarga entera.
    if ([...nuevos].some((n) => n.querySelector('astro-island') && !viejos.get(n.dataset.seccion)) && !document.querySelector('astro-island')) return location.reload();
    const ancla = document.createElement('template');
    (viejos.values().next().value ?? document.querySelector('footer'))?.before(ancla);
    let anterior = ancla;
    for (const n of nuevos) {
      const v = viejos.get(n.dataset.seccion);
      if (v && v.innerHTML === n.innerHTML && v.dataset.etiqueta === n.dataset.etiqueta) {
        anterior.after(v);
        anterior = v;
      } else {
        const copia = document.importNode(n, true);
        anterior.after(copia);
        v?.remove();
        anterior = copia;
      }
      viejos.delete(n.dataset.seccion);
    }
    for (const v of viejos.values()) v.remove();
    ancla.remove();
    marcar(seleccion);
  }

  const avisar = (m) => parent.postMessage({ origen: 'portada', ...m }, location.origin);

  document.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const s = e.target.closest?.('[data-seccion]');
    avisar({ tipo: 'seleccion', id: s ? s.dataset.seccion : null });
  }, true);
  // Nada de enviar formularios ni abrir enlaces dentro de la vista previa.
  document.addEventListener('submit', (e) => e.preventDefault(), true);

  addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.data?.origen !== 'portada') return;
    if (e.data.tipo === 'datos') aplicar(e.data.secciones);
    else if (e.data.tipo === 'actualizar') actualizar().catch(() => location.reload());
    else if (e.data.tipo === 'marcar') {
      seleccion = e.data.id;
      marcar(e.data.id);
      document.querySelector(`[data-seccion="${CSS.escape(e.data.id ?? '')}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
  avisar({ tipo: 'lista' });
})();
