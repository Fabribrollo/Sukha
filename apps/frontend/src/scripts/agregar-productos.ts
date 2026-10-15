// Modal para agregar productos a una colección: selección múltiple, buscador, filtros y orden.
// Todos los productos ya vienen en la página; acá solo se ocultan, se ordenan y se cuentan los elegidos.
// El formulario del modal se envía como siempre (POST), con un `productoId` por cada producto tildado.

const ventana = document.querySelector<HTMLDialogElement>('#agregar-productos');

if (ventana) {
  const q = <T extends HTMLElement>(selector: string) => ventana.querySelector<T>(selector)!;
  const lista = q<HTMLUListElement>('[data-productos]');
  const items = [...lista.querySelectorAll<HTMLLIElement>('li[data-id]')];
  const buscar = q<HTMLInputElement>('[data-buscar]');
  const categoria = q<HTMLSelectElement>('[data-categoria]');
  const estado = q<HTMLSelectElement>('[data-estado]');
  const orden = q<HTMLSelectElement>('[data-orden]');
  const todos = q<HTMLInputElement>('[data-todos]');
  const visibles = q<HTMLElement>('[data-visibles]');
  const vacio = q<HTMLElement>('[data-vacio]');
  const contador = q<HTMLElement>('[data-seleccionados]');
  const confirmar = q<HTMLButtonElement>('[data-confirmar]');
  const casilla = (li: HTMLElement) => li.querySelector<HTMLInputElement>('input[type=checkbox]')!;

  const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const num = (li: HTMLElement, clave: string) => Number(li.dataset[clave]);
  const comparadores: Record<string, (a: HTMLElement, b: HTMLElement) => number> = {
    nuevos: (a, b) => num(a, 'posicion') - num(b, 'posicion'),
    az: (a, b) => a.dataset.nombre!.localeCompare(b.dataset.nombre!, 'es'),
    za: (a, b) => b.dataset.nombre!.localeCompare(a.dataset.nombre!, 'es'),
    precio_asc: (a, b) => num(a, 'precio') - num(b, 'precio'),
    precio_desc: (a, b) => num(b, 'precio') - num(a, 'precio'),
    stock: (a, b) => num(b, 'stock') - num(a, 'stock'),
  };
  let dentro = new Set<number>();

  const verVisibles = () => items.filter((li) => !li.hidden);
  const contar = () => {
    const elegidos = items.filter((li) => casilla(li).checked).length;
    contador.textContent = elegidos === 0 ? 'Ninguno seleccionado' : elegidos === 1 ? '1 producto seleccionado' : `${elegidos} productos seleccionados`;
    confirmar.disabled = elegidos === 0;
    confirmar.querySelector('span')!.textContent = elegidos === 0 ? 'Agregar' : elegidos === 1 ? 'Agregar 1 producto' : `Agregar ${elegidos} productos`;
    // El tilde de "todos" refleja solo lo que se ve; queda a medias si hay algunos.
    const ver = verVisibles();
    const marcados = ver.filter((li) => casilla(li).checked).length;
    todos.checked = ver.length > 0 && marcados === ver.length;
    todos.indeterminate = marcados > 0 && marcados < ver.length;
    todos.disabled = ver.length === 0;
  };

  const aplicar = () => {
    const texto = normal(buscar.value);
    for (const li of items) {
      li.hidden = dentro.has(num(li, 'id')) || (!!texto && !normal(li.dataset.nombre!).includes(texto)) || (!!categoria.value && li.dataset.categoria !== categoria.value) || (!!estado.value && li.dataset.estado !== estado.value);
    }
    // Reordenar moviendo los elementos: los tildados se conservan aunque queden ocultos por un filtro.
    for (const li of [...items].sort(comparadores[orden.value])) lista.append(li);
    const ver = verVisibles().length;
    visibles.textContent = `${ver} ${ver === 1 ? 'producto' : 'productos'}`;
    vacio.hidden = ver > 0;
    lista.hidden = ver === 0;
    contar();
  };

  for (const campo of [buscar, categoria, estado, orden]) campo.addEventListener(campo === buscar ? 'input' : 'change', aplicar);
  lista.addEventListener('change', contar);
  todos.addEventListener('change', () => {
    for (const li of verVisibles()) casilla(li).checked = todos.checked;
    contar();
  });

  // Enter en el buscador no debe enviar el formulario.
  buscar.addEventListener('keydown', (e) => e.key === 'Enter' && e.preventDefault());

  for (const boton of document.querySelectorAll<HTMLButtonElement>('[data-agregar]')) {
    boton.addEventListener('click', () => {
      const c = JSON.parse(boton.dataset.agregar!) as { id: number; nombre: string; dentro: number[] };
      dentro = new Set(c.dentro);
      (ventana.querySelector('input[name=coleccionId]') as HTMLInputElement).value = String(c.id);
      q('[data-titulo]').textContent = c.nombre;
      buscar.value = '';
      categoria.value = '';
      estado.value = '';
      orden.value = 'nuevos';
      for (const li of items) casilla(li).checked = false;
      aplicar();
      lista.scrollTop = 0;
      ventana.showModal();
      buscar.focus();
    });
  }
  for (const cerrar of ventana.querySelectorAll('[data-cerrar]')) cerrar.addEventListener('click', () => ventana.close());
  ventana.addEventListener('click', (e) => e.target === ventana && ventana.close());
}
