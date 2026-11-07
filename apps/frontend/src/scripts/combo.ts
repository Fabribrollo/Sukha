// Selector con buscador y alta rápida ("creatable combobox").
// Mejora cualquier <select data-combo>: se escribe para filtrar y, si nada coincide, aparece "+ Agregar «texto»".
//   data-crear="/api/admin/talles"  dirección que crea la opción nueva (recibe { nombre } y devuelve { id, nombre })
//   data-libre                      lo nuevo se usa como texto tal cual, sin crearlo en el servidor (material, cuidados)
// El <select> original queda oculto y sigue siendo lo que envía el formulario; sin JavaScript se usa tal cual.

type Opcion = { valor: string; texto: string; hex?: string };

const normal = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
let serie = 0;

// Una opción deshabilitada no se ofrece en la lista: sirve de "vacío" en los selectores que agregan a una lista (materiales).
export function mejorar(select: HTMLSelectElement) {
  if (select.dataset.mejorado) return;
  select.dataset.mejorado = '1';
  const id = `combo-${serie++}`;
  const crearEn = select.dataset.crear;
  const libre = 'libre' in select.dataset;
  const opciones = (): Opcion[] => [...select.options].filter((o) => !o.disabled).map((o) => ({ valor: o.value, texto: o.text, hex: o.dataset.hex }));

  const caja = document.createElement('div');
  caja.className = 'relative';
  const entrada = document.createElement('input');
  entrada.type = 'text';
  entrada.className = select.className;
  entrada.autocomplete = 'off';
  entrada.setAttribute('role', 'combobox');
  entrada.setAttribute('aria-autocomplete', 'list');
  entrada.setAttribute('aria-expanded', 'false');
  entrada.setAttribute('aria-controls', id);
  entrada.placeholder = select.dataset.placeholder ?? 'Buscar…';
  const lista = document.createElement('ul');
  lista.id = id;
  lista.setAttribute('role', 'listbox');
  lista.className = 'shadow-theme-lg absolute z-30 mt-1 hidden max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1';

  // La etiqueta del campo pasa a apuntar al buscador.
  const etiqueta = select.id ? document.querySelector<HTMLLabelElement>(`label[for="${select.id}"]`) : null;
  entrada.id = `${id}-entrada`;
  if (etiqueta) etiqueta.htmlFor = entrada.id;

  // Colores: el círculo con el tono (opción con data-hex) a la izquierda del nombre elegido.
  const circulo = document.createElement('span');
  circulo.className = 'pointer-events-none absolute top-1/2 left-3.5 hidden size-4 -translate-y-1/2 rounded-full border border-gray-200';
  circulo.setAttribute('aria-hidden', 'true');
  const pintarCirculo = () => {
    const hex = select.options[select.selectedIndex]?.dataset.hex;
    circulo.classList.toggle('hidden', !hex);
    if (hex) circulo.style.background = hex;
    entrada.style.paddingLeft = hex ? '2.5rem' : '';
  };

  select.hidden = true;
  select.before(caja);
  caja.append(entrada, circulo, lista, select);

  let activa = -1;
  let visibles: (Opcion & { crear?: boolean })[] = [];
  const elegida = () => select.options[select.selectedIndex]?.text ?? '';
  entrada.value = elegida();
  pintarCirculo();

  const cerrar = () => {
    lista.classList.add('hidden');
    entrada.setAttribute('aria-expanded', 'false');
    entrada.removeAttribute('aria-activedescendant');
    entrada.value = elegida();
    pintarCirculo();
  };

  const pintar = (filtro: string) => {
    const buscado = normal(filtro);
    visibles = opciones().filter((o) => !buscado || normal(o.texto).includes(buscado));
    const exacta = opciones().some((o) => normal(o.texto) === buscado);
    if ((crearEn || libre) && buscado && !exacta) visibles.push({ valor: '', texto: filtro.trim(), crear: true });
    activa = visibles.length ? 0 : -1;
    lista.replaceChildren(
      ...visibles.map((o, i) => {
        const li = document.createElement('li');
        li.id = `${id}-${i}`;
        li.setAttribute('role', 'option');
        li.dataset.i = String(i);
        if (o.hex) {
          const punto = document.createElement('span');
          punto.className = 'size-4 shrink-0 rounded-full border border-gray-200';
          punto.style.background = o.hex;
          li.append(punto, o.texto);
        } else li.textContent = o.crear ? `+ Agregar "${o.texto}"` : o.texto;
        li.className = `${o.hex ? 'flex items-center gap-2 ' : ''}cursor-pointer px-4 py-2 text-sm ${o.crear ? 'text-brand-500 border-t border-gray-100 font-medium' : 'text-gray-700'}`;
        return li;
      }),
    );
    if (!visibles.length) {
      const vacio = document.createElement('li');
      vacio.className = 'px-4 py-2 text-sm text-gray-400';
      vacio.textContent = 'Sin resultados';
      lista.append(vacio);
    }
    lista.classList.remove('hidden');
    entrada.setAttribute('aria-expanded', 'true');
    marcar();
  };

  const marcar = () => {
    [...lista.children].forEach((li, i) => {
      li.classList.toggle('bg-gray-100', i === activa);
      li.setAttribute('aria-selected', String(i === activa));
    });
    if (activa >= 0) {
      entrada.setAttribute('aria-activedescendant', `${id}-${activa}`);
      lista.children[activa]?.scrollIntoView({ block: 'nearest' });
    }
  };

  const elegir = async (o: Opcion & { crear?: boolean }) => {
    if (o.crear && libre) {
      select.add(new Option(o.texto, o.texto));
      select.value = o.texto;
    } else if (o.crear) {
      entrada.disabled = true;
      const r = await fetch(crearEn!, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nombre: o.texto }) });
      entrada.disabled = false;
      const cuerpo = (await r.json().catch(() => null)) as { id?: number; nombre?: string; error?: string } | null;
      if (!r.ok || !cuerpo?.id) {
        entrada.setCustomValidity(cuerpo?.error ?? 'No se pudo agregar.');
        entrada.reportValidity();
        entrada.setCustomValidity('');
        return;
      }
      // La opción nueva se suma a todos los selectores de la página que crean en el mismo lugar.
      for (const otro of document.querySelectorAll<HTMLSelectElement>(`select[data-crear="${crearEn}"]`)) {
        otro.add(new Option(cuerpo.nombre ?? o.texto, String(cuerpo.id)));
      }
      select.value = String(cuerpo.id);
    } else {
      select.value = o.valor;
    }
    select.dispatchEvent(new Event('change', { bubbles: true }));
    cerrar();
  };

  entrada.addEventListener('focus', () => {
    entrada.select();
    pintar('');
  });
  // Si ya tenía el foco y se cerró (por ejemplo, después de elegir), un toque lo vuelve a abrir.
  entrada.addEventListener('click', () => {
    if (lista.classList.contains('hidden')) pintar('');
  });
  entrada.addEventListener('input', () => pintar(entrada.value));
  entrada.addEventListener('blur', () => setTimeout(cerrar, 150));
  entrada.addEventListener('keydown', (e) => {
    const abierta = !lista.classList.contains('hidden');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!abierta) return pintar('');
      if (visibles.length) activa = (activa + (e.key === 'ArrowDown' ? 1 : -1) + visibles.length) % visibles.length;
      marcar();
    } else if (e.key === 'Enter' && abierta) {
      // Enter elige la opción marcada en lugar de enviar el formulario.
      e.preventDefault();
      if (activa >= 0) void elegir(visibles[activa]);
    } else if (e.key === 'Escape' && abierta) {
      e.preventDefault();
      cerrar();
    }
  });
  // mousedown y no click: así se elige antes de que el buscador pierda el foco.
  lista.addEventListener('mousedown', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-i]');
    if (!li) return;
    e.preventDefault();
    void elegir(visibles[Number(li.dataset.i)]);
  });
}

document.querySelectorAll<HTMLSelectElement>('select[data-combo]').forEach(mejorar);
