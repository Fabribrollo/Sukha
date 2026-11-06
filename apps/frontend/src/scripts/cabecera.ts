// Editor del menú de la cabecera. El estado vive acá; cada cambio de estructura (agregar, mover, borrar, foto) vuelve a dibujar
// y lo que se tipea solo actualiza el estado. Se guarda todo junto con PUT /api/admin/cabecera.
import { ordenable } from './ordenable';
import { recortar } from './recorte';
import { aWebp } from './webp';

type Tarjeta = { enlace: string; titulo: string; imagen: string };
type Base = { id: string; visible: boolean; dispositivo: 'todos' | 'escritorio' | 'celular' };
type Entrada =
  | (Base & { tipo: 'enlace'; texto: string; enlace: string })
  | (Base & { tipo: 'categoria'; slug: string; texto: string; subcategorias: string[]; tarjetas: Tarjeta[] })
  | (Base & { tipo: 'colecciones'; texto: string; colecciones: string[]; imagenes: Record<string, string> });
type Menu = { version: 1; items: Entrada[]; tarjetasMovil: Tarjeta[] };
type Cat = { id: number; nombre: string; slug: string; padreId: number | null; activa: number };
type Col = { nombre: string; slug: string };

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const editor = $('#editor');
const movil = $('#tarjetas-movil');
const agregar = $('#agregar');
const estado = $('[data-estado]');
const aviso = $('[data-aviso]');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const foto = (k: string) => `/api/imagenes/${k}/mediano.webp`;
const idNuevo = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => 'abcdefghijklmnopqrstuvwxyz0123456789'[n % 36]).join('');
const avisar = (t: string, error = false) => {
  aviso.textContent = t;
  aviso.classList.toggle('text-error-600', error);
};

let menu: Menu = { version: 1, items: [], tarjetasMovil: [] };
let cats: Cat[] = [];
let cols: Col[] = [];
let defecto: Menu = menu;
const abiertos = new Set<string>();

const principales = () => cats.filter((c) => !c.padreId);
const hijasDe = (slug: string) => {
  const p = cats.find((c) => c.slug === slug);
  return p ? cats.filter((c) => c.padreId === p.id) : [];
};
const rutas = () => ['/productos', '/ofertas', '/colecciones', ...cats.map((c) => `/categoria/${c.slug}`), ...cols.map((c) => `/coleccion/${c.slug}`)];

const ICONO = {
  asa: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
  borrar: '<path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/>',
  ojo: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  foto: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
};
const svg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4" aria-hidden="true">${d}</svg>`;
const asa = (nombre: string) => `<button type="button" data-asa class="btn-icono cursor-grab touch-none active:cursor-grabbing" title="Arrastrar para ordenar" aria-label="Ordenar ${esc(nombre)}: arrastrá o usá las flechas arriba y abajo">${svg(ICONO.asa)}</button>`;
const iconBtn = (accion: string, d: string, titulo: string, extra = '', deshabilitado = false) =>
  `<button type="button" data-a="${accion}" ${extra} class="btn-icono disabled:opacity-30" title="${titulo}" aria-label="${titulo}"${deshabilitado ? ' disabled' : ''}>${svg(d)}</button>`;

function fotoCampo(clave: string, ruta: string, vacio = 'Sin foto propia') {
  return `<div class="flex items-center gap-2">
    <div class="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50 text-gray-400">${clave ? `<img src="${foto(clave)}" alt="" class="size-full object-cover">` : svg(ICONO.foto)}</div>
    <div class="space-y-1">
      <label class="btn btn-secundario cursor-pointer"><span>${clave ? 'Cambiar foto' : 'Subir foto'}</span><input type="file" accept="image/*" class="sr-only" data-subir="${ruta}"></label>
      ${clave ? `<button type="button" class="btn btn-peligro-suave" data-a="quitar-foto" data-ruta="${ruta}">Quitar foto</button>` : `<p class="text-theme-xs text-gray-500">${vacio}</p>`}
    </div></div>`;
}

function tarjetasHtml(lista: Tarjeta[], base: string) {
  const filas = lista
    .map(
      (t, i) => `<div class="space-y-2 rounded-lg border border-gray-200 p-3">
      <div class="flex items-center justify-between"><span class="text-theme-sm font-medium text-gray-700">Tarjeta ${i + 1}</span>${iconBtn('quitar-tarjeta', ICONO.borrar, 'Quitar tarjeta', `data-ruta="${base}.${i}"`)}</div>
      <div class="grid gap-2 sm:grid-cols-2">
        <label class="block"><span class="etiqueta">A dónde lleva</span><input class="campo" list="rutas" data-c="${base}.${i}.enlace" value="${esc(t.enlace)}" placeholder="/categoria/vestidos"></label>
        <label class="block"><span class="etiqueta">Título</span><input class="campo" maxlength="40" data-c="${base}.${i}.titulo" value="${esc(t.titulo)}" placeholder="El nombre del destino"></label>
      </div>
      ${fotoCampo(t.imagen, `${base}.${i}.imagen`, 'Usa la foto del destino, si tiene.')}
    </div>`,
    )
    .join('');
  return `${filas}${lista.length < 2 ? `<button type="button" class="btn btn-secundario" data-a="mas-tarjeta" data-ruta="${base}">+ Agregar tarjeta</button>` : ''}`;
}

function cuerpo(e: Entrada, i: number) {
  const b = `items.${i}`;
  if (e.tipo === 'enlace')
    return `<div class="grid gap-3 sm:grid-cols-2">
      <label class="block"><span class="etiqueta">Texto</span><input class="campo" maxlength="30" data-c="${b}.texto" value="${esc(e.texto)}"></label>
      <label class="block"><span class="etiqueta">A dónde lleva</span><input class="campo" list="rutas" data-c="${b}.enlace" value="${esc(e.enlace)}" placeholder="/ofertas"></label></div>`;
  if (e.tipo === 'categoria') {
    const todas = hijasDe(e.slug);
    // Primero las elegidas (en su orden) y después el resto; sin ninguna elegida se muestran todas.
    const orden = ordenDe(e, 'subcategorias').map((s) => todas.find((h) => h.slug === s)!);
    const lista = orden
      .map((h, k) => {
        const marcada = !e.subcategorias.length || e.subcategorias.includes(h.slug);
        return `<li data-id="${k}" class="flex items-center gap-2 py-1">${asa(h.nombre)}<input type="checkbox" class="size-4" data-sub="${i}" value="${h.slug}" ${marcada ? 'checked' : ''} aria-label="Mostrar ${esc(h.nombre)}"><span class="min-w-0 flex-1 truncate text-sm">${esc(h.nombre)}${h.activa !== 1 ? ' <span class="text-theme-xs text-gray-400">(oculta)</span>' : ''}</span></li>`;
      })
      .join('');
    return `<div class="space-y-4">
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block"><span class="etiqueta">Categoría</span><select class="campo pr-10" data-c="${b}.slug">${principales().map((p) => `<option value="${p.slug}" ${p.slug === e.slug ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
        <label class="block"><span class="etiqueta">Texto en el menú</span><input class="campo" maxlength="30" data-c="${b}.texto" value="${esc(e.texto)}" placeholder="El nombre de la categoría"></label>
      </div>
      <div><p class="etiqueta">Subcategorías del panel</p>${todas.length ? `<ul data-orden="subcategorias" data-e="${i}" class="divide-y divide-gray-100 rounded-lg border border-gray-200 px-3">${lista}</ul><p class="text-theme-xs mt-1 text-gray-500">Tildá las que se ven y ordenalas arrastrando. Sin subcategorías no hay panel: el menú lleva directo a la categoría.</p>` : '<p class="text-theme-sm text-gray-500">Esta categoría no tiene subcategorías, así que el menú lleva directo a ella.</p>'}</div>
      <div><p class="etiqueta">Tarjetas con foto del panel</p><div class="space-y-3">${tarjetasHtml(e.tarjetas, `${b}.tarjetas`)}</div>${e.tarjetas.length ? '' : '<p class="text-theme-xs mt-1 text-gray-500">Sin tarjetas propias se usan las dos primeras subcategorías con foto.</p>'}</div></div>`;
  }
  const orden = ordenDe(e, 'colecciones').map((s) => cols.find((c) => c.slug === s)!);
  const lista = orden
    .map((c, k) => {
      const marcada = !e.colecciones.length || e.colecciones.includes(c.slug);
      return `<li data-id="${k}" class="space-y-2 py-2"><div class="flex items-center gap-2">${asa(c.nombre)}<input type="checkbox" class="size-4" data-col="${i}" value="${c.slug}" ${marcada ? 'checked' : ''} aria-label="Mostrar ${esc(c.nombre)}"><span class="min-w-0 flex-1 truncate text-sm">${esc(c.nombre)}</span></div>${fotoCampo(e.imagenes[c.slug] ?? '', `${b}.imagenes.${c.slug}`, 'Usa la foto de su primer producto.')}</li>`;
    })
    .join('');
  return `<div class="space-y-4"><label class="block max-w-sm"><span class="etiqueta">Texto en el menú</span><input class="campo" maxlength="30" data-c="${b}.texto" value="${esc(e.texto)}"></label>
    <div><p class="etiqueta">Colecciones del panel (hasta 8 se muestran)</p>${cols.length ? `<ul data-orden="colecciones" data-e="${i}" class="divide-y divide-gray-100 rounded-lg border border-gray-200 px-3">${lista}</ul>` : '<p class="text-theme-sm text-gray-500">Todavía no hay colecciones.</p>'}</div></div>`;
}

function resumen(e: Entrada) {
  if (e.tipo === 'enlace') return `${esc(e.texto || 'Sin texto')} <span class="text-gray-400">· enlace</span>`;
  if (e.tipo === 'categoria') return `${esc(e.texto || cats.find((c) => c.slug === e.slug)?.nombre || e.slug)} <span class="text-gray-400">· categoría${hijasDe(e.slug).length ? ' con panel' : ''}</span>`;
  return `${esc(e.texto || 'Colecciones')} <span class="text-gray-400">· panel de colecciones</span>`;
}

// Orden en que se muestra una lista elegible: primero lo tildado (en su orden) y después el resto; sin nada guardado, todo.
function ordenDe(e: any, campo: 'subcategorias' | 'colecciones'): string[] {
  const todas: string[] = campo === 'subcategorias' ? hijasDe(e.slug).map((h) => h.slug) : cols.map((c) => c.slug);
  const elegidas: string[] = (e[campo] as string[]).filter((s) => todas.includes(s));
  return elegidas.length ? [...elegidas, ...todas.filter((s) => !elegidas.includes(s))] : todas;
}

// Arrastrar para ordenar (el mismo componente del resto del panel): las entradas del menú y las listas de cada panel.
// Los elementos llevan su posición actual en data-id; al soltar se reordena el estado con esa lista.
function activarOrden() {
  ordenable($('#lista-items'), {
    asa: '[data-asa]',
    guardar: async (idx) => {
      menu.items = idx.map((n) => menu.items[n]);
      dibujar();
    },
  });
  for (const ul of document.querySelectorAll<HTMLElement>('[data-orden]')) {
    ordenable(ul, {
      asa: '[data-asa]',
      guardar: async (idx) => {
        const e = menu.items[Number(ul.dataset.e)] as any;
        const campo = ul.dataset.orden as 'subcategorias' | 'colecciones';
        const actual = ordenDe(e, campo);
        const marcadas: string[] = e[campo].length ? e[campo] : actual;
        e[campo] = idx.map((n) => actual[n]).filter((s) => marcadas.includes(s));
        dibujar();
      },
    });
  }
}

function dibujar() {
  // Las entradas van en su propio contenedor, que se crea de nuevo en cada dibujo (así el arrastre no se duplica).
  const entradas = menu.items.length
    ? menu.items
        .map(
          (e, i) => `<details class="group rounded-xl border border-gray-200 bg-white" data-id="${i}" data-eid="${e.id}" ${abiertos.has(e.id) ? 'open' : ''}>
      <summary class="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        ${asa(e.texto || 'entrada')}
        <span class="${e.visible ? 'text-gray-800' : 'text-gray-400 line-through'} min-w-0 flex-1 truncate text-sm font-medium">${resumen(e)}</span>
        <select class="campo w-auto py-1 pr-8 text-xs" data-c="items.${i}.dispositivo" aria-label="Dónde se ve"><option value="todos" ${e.dispositivo === 'todos' ? 'selected' : ''}>Escritorio y celular</option><option value="escritorio" ${e.dispositivo === 'escritorio' ? 'selected' : ''}>Solo escritorio</option><option value="celular" ${e.dispositivo === 'celular' ? 'selected' : ''}>Solo celular</option></select>
        ${iconBtn('visible', ICONO.ojo, e.visible ? 'Ocultar del menú' : 'Mostrar en el menú', `data-i="${i}" aria-pressed="${e.visible}"`)}
        ${iconBtn('borrar', ICONO.borrar, 'Quitar del menú', `data-i="${i}"`)}
      </summary>
      <div class="border-t border-gray-100 p-4">${cuerpo(e, i)}</div></details>`,
        )
        .join('')
    : '<p class="text-theme-sm text-gray-500">El menú está vacío. Agregá una entrada.</p>';
  editor.innerHTML = `<div id="lista-items" class="space-y-3">${entradas}</div>`;
  agregar.innerHTML = `<button type="button" class="btn btn-secundario" data-a="mas-enlace">+ Enlace</button><button type="button" class="btn btn-secundario" data-a="mas-categoria">+ Categoría</button>${menu.items.some((e) => e.tipo === 'colecciones') ? '' : '<button type="button" class="btn btn-secundario" data-a="mas-colecciones">+ Colecciones</button>'}`;
  movil.innerHTML = tarjetasHtml(menu.tarjetasMovil, 'tarjetasMovil');
  activarOrden();
}

// Camino "items.2.tarjetas.0.enlace" → objeto contenedor y clave final.
function destino(ruta: string): [Record<string, unknown>, string] {
  const partes = ruta.split('.');
  const ultima = partes.pop()!;
  let o: any = menu;
  for (const p of partes) o = o[p];
  return [o, ultima];
}

async function subir(ruta: string, original?: File) {
  if (!original) return;
  const archivo = await recortar(original);
  if (!archivo) return;
  try {
    avisar('Subiendo foto…');
    const datos = new FormData();
    datos.set('foto', await aWebp(archivo, 1600), 'foto.webp');
    datos.set('mediano', await aWebp(archivo, 1000), 'mediano.webp');
    const r = await fetch('/api/admin/portada/imagen', { method: 'POST', body: datos });
    if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No se pudo subir la foto.');
    const { clave } = (await r.json()) as { clave: string };
    const [o, k] = destino(ruta);
    o[k] = clave;
    avisar('Foto subida. Falta guardar.');
    dibujar();
  } catch (e) {
    avisar(e instanceof Error ? e.message : 'No se pudo subir la foto.', true);
  }
}

const nueva = <T extends Entrada>(e: Omit<T, 'id' | 'visible' | 'dispositivo'>) => {
  const x = { ...e, id: idNuevo(), visible: true, dispositivo: 'todos' } as unknown as Entrada;
  abiertos.add(x.id);
  menu.items.push(x);
  dibujar();
};

document.addEventListener('click', (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-a]');
  if (!b) return;
  const i = Number(b.dataset.i);
  const a = b.dataset.a!;
  if (b.closest('summary')) ev.preventDefault();
  // Quitar una entrada o una tarjeta pide un segundo toque (el botón cambia a «¿Quitar?» por unos segundos).
  if ((a === 'borrar' || a === 'quitar-tarjeta') && !b.dataset.confirmar) {
    b.dataset.confirmar = '1';
    const antes = b.innerHTML;
    b.innerHTML = '<span class="text-theme-xs px-1 font-medium text-error-600">¿Quitar?</span>';
    return void setTimeout(() => b.isConnected && (delete b.dataset.confirmar, (b.innerHTML = antes)), 3500);
  }
  if (a === 'visible') menu.items[i].visible = !menu.items[i].visible;
  else if (a === 'borrar') menu.items.splice(i, 1);
  else if (a === 'mas-enlace') return nueva({ tipo: 'enlace', texto: 'Nuevo', enlace: '/productos' });
  else if (a === 'mas-categoria') return nueva({ tipo: 'categoria', slug: principales()[0]?.slug ?? '', texto: '', subcategorias: [], tarjetas: [] });
  else if (a === 'mas-colecciones') return nueva({ tipo: 'colecciones', texto: 'Colecciones', colecciones: [], imagenes: {} });
  else if (a === 'mas-tarjeta') (destino(`${b.dataset.ruta}.x`)[0] as unknown as Tarjeta[]).push({ enlace: '', titulo: '', imagen: '' });
  else if (a === 'quitar-tarjeta') {
    const [o, k] = destino(b.dataset.ruta!);
    (o as unknown as Tarjeta[]).splice(Number(k), 1);
  } else if (a === 'quitar-foto') {
    const [o, k] = destino(b.dataset.ruta!);
    if (/\.imagenes\./.test(b.dataset.ruta!)) delete o[k];
    else o[k] = '';
  } else return;
  dibujar();
});

document.addEventListener('toggle', (ev) => {
  const d = ev.target as HTMLDetailsElement;
  if (d.dataset?.eid) d.open ? abiertos.add(d.dataset.eid) : abiertos.delete(d.dataset.eid);
}, true);

document.addEventListener('change', (ev) => {
  const t = ev.target as HTMLInputElement;
  if (t.dataset.subir) return void subir(t.dataset.subir, t.files?.[0]);
  const k = t.dataset.sub ?? t.dataset.col;
  if (k !== undefined) {
    const e = menu.items[Number(k)] as any;
    const campo = t.dataset.sub !== undefined ? 'subcategorias' : 'colecciones';
    const todas: string[] = campo === 'subcategorias' ? hijasDe(e.slug).map((h) => h.slug) : cols.map((c) => c.slug);
    const actuales: string[] = e[campo].length ? e[campo] : todas;
    const nuevas = t.checked ? [...actuales.filter((s) => s !== t.value), t.value] : actuales.filter((s) => s !== t.value);
    // Sin ninguna tildada no se muestra nada de esta lista: se vuelve a "todas" para no dejar un panel vacío.
    e[campo] = nuevas.length === todas.length ? todas.filter((s) => nuevas.includes(s)) : nuevas;
    dibujar();
  }
});

document.addEventListener('input', (ev) => {
  const t = ev.target as HTMLInputElement;
  const ruta = t.dataset.c;
  if (!ruta) return;
  const [o, k] = destino(ruta);
  o[k] = t.value;
  if (/\.slug$/.test(ruta)) {
    // Cambiar de categoría reinicia lo que dependía de la anterior.
    const e = menu.items[Number(ruta.split('.')[1])] as any;
    e.subcategorias = [];
    dibujar();
  }
});
document.addEventListener('keydown', (ev) => {
  // Escribir en un campo dentro del resumen no debe abrir ni cerrar el panel.
  if ((ev.target as HTMLElement).closest('summary select') && ev.key === ' ') ev.stopPropagation();
});

// ───────────── Guardar / restaurar ─────────────
async function guardar() {
  try {
    avisar('Guardando…');
    const r = await fetch('/api/admin/cabecera', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(menu) });
    if (!r.ok) {
      const cuerpoError = (await r.json().catch(() => null)) as { error?: string } | null;
      throw new Error(cuerpoError?.error ?? 'No se pudo guardar.');
    }
    estado.textContent = 'Guardado';
    avisar('Guardado. La tienda lo muestra en menos de un minuto.');
  } catch (e) {
    avisar(e instanceof Error ? e.message : 'No se pudo guardar.', true);
  }
}
$('[data-guardar]').addEventListener('click', guardar);
const restaurar = $<HTMLButtonElement>('[data-restaurar]');
const textoRestaurar = $('[data-restaurar-texto]');
let confirmando = false;
restaurar.addEventListener('click', async () => {
  if (!confirmando) {
    confirmando = true;
    textoRestaurar.textContent = '¿Restaurar? Tocá de nuevo';
    return void setTimeout(() => ((confirmando = false), (textoRestaurar.textContent = 'Restaurar el original')), 4000);
  }
  confirmando = false;
  textoRestaurar.textContent = 'Restaurar el original';
  const r = await fetch('/api/admin/cabecera', { method: 'DELETE' });
  if (!r.ok) return avisar('No se pudo restaurar.', true);
  menu = structuredClone(defecto);
  dibujar();
  avisar('Se restauró el menú original (armado con tus categorías y colecciones).');
});

// ───────────── Carga ─────────────
(async () => {
  try {
    const [c, categorias, colecciones] = await Promise.all([
      fetch('/api/admin/cabecera').then((r) => r.json()) as Promise<{ config: Menu | null; defecto: Menu }>,
      fetch('/api/admin/categorias').then((r) => r.json()) as Promise<Cat[]>,
      fetch('/api/admin/colecciones').then((r) => r.json()) as Promise<Col[]>,
    ]);
    cats = categorias;
    cols = colecciones;
    defecto = c.defecto;
    menu = structuredClone(c.config ?? c.defecto);
    const lista = document.createElement('datalist');
    lista.id = 'rutas';
    lista.innerHTML = rutas().map((r) => `<option value="${esc(r)}">`).join('');
    document.body.append(lista);
    avisar(c.config ? '' : 'Todavía no guardaste un menú: se muestra el que arma la tienda sola. Editalo y guardá.');
    dibujar();
  } catch {
    editor.innerHTML = '<p class="text-theme-sm text-error-600">No se pudo cargar el menú. Recargá la página.</p>';
  }
})();
