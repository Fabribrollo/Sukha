// Editor visual de la cabecera. La tienda real se ve en un iframe (/?vista-previa=1&editor=cabecera, con public/editor-cabecera.js):
// tocar una entrada del menú la selecciona y acá se muestran sus campos; elegirla en la lista abre su desplegable en la vista previa.
// Todo cambio se guarda solo en el borrador (PUT /api/admin/cabecera/borrador) y la vista previa se recarga; publicar es un botón aparte.
// Mismo esquema que scripts/portada.ts. Los datos vienen de la página en #datos-cabecera.
import { confirmar } from './dialogo-panel';
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

const datos = JSON.parse(document.querySelector('#datos-cabecera')!.textContent!) as { inicial: Menu; defecto: Menu; hayBorrador: boolean; categorias: Cat[]; colecciones: Col[] };
const cats = datos.categorias;
const cols = datos.colecciones;
let menu: Menu = structuredClone(datos.inicial);
let hayBorrador = datos.hayBorrador;
let elegida: string | null = null; // id de una entrada, o 'movil' (las tarjetas del menú del celular)

const q = <T extends HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s)!;
const lista = q<HTMLUListElement>('[data-secciones]');
const editor = q('[data-editor]');
const campos = q('[data-campos]');
const marco = q<HTMLIFrameElement>('[data-vista]');
const mensaje = q('[data-mensaje]');
const avisar = (t: string, error = false) => {
  mensaje.textContent = t;
  mensaje.classList.toggle('text-error-600', error);
  mensaje.classList.toggle('text-gray-500', !error);
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const foto = (k: string) => `/api/imagenes/${k}/mediano.webp`;
const idNuevo = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => 'abcdefghijklmnopqrstuvwxyz0123456789'[n % 36]).join('');
const mensajeDeError = async (r: Response, porDefecto: string) => ((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? porDefecto;

const principales = () => cats.filter((c) => !c.padreId);
const hijasDe = (slug: string) => {
  const p = cats.find((c) => c.slug === slug);
  return p ? cats.filter((c) => c.padreId === p.id) : [];
};
const nombreDe = (e: Entrada) => (e.tipo === 'categoria' ? e.texto || cats.find((c) => c.slug === e.slug)?.nombre || e.slug : e.texto || (e.tipo === 'colecciones' ? 'Colecciones' : 'Sin texto'));
const detalle = (e: Entrada) => {
  const donde = e.dispositivo === 'escritorio' ? ' · solo escritorio' : e.dispositivo === 'celular' ? ' · solo celular' : '';
  if (e.tipo === 'enlace') return `Enlace${donde}`;
  if (e.tipo === 'colecciones') return `Panel de colecciones${donde}`;
  return `${hijasDe(e.slug).length ? 'Categoría con panel' : 'Categoría'}${donde}`;
};

// Opciones de «a dónde lleva» de las tarjetas y enlaces.
const rutas = () => ['/productos', '/ofertas', '/colecciones', ...cats.map((c) => `/categoria/${c.slug}`), ...cols.map((c) => `/coleccion/${c.slug}`)];
{
  const l = document.createElement('datalist');
  l.id = 'rutas';
  l.innerHTML = rutas().map((r) => `<option value="${esc(r)}">`).join('');
  document.body.append(l);
}

// ───────────── Deshacer y rehacer ─────────────
// Se guarda una foto del menú antes de cada cambio; escribir seguido en un mismo campo cuenta como un solo cambio.
let pasado: string[] = [];
let futuro: string[] = [];
let ultimo = { clave: '', hora: 0 };
const botones = () => {
  q<HTMLButtonElement>('[data-deshacer]').disabled = !pasado.length;
  q<HTMLButtonElement>('[data-rehacer]').disabled = !futuro.length;
};
function antesDeCambiar(clave: string) {
  if (clave !== ultimo.clave || Date.now() - ultimo.hora > 1500) {
    pasado.push(JSON.stringify(menu));
    if (pasado.length > 50) pasado.shift();
    futuro = [];
  }
  ultimo = { clave, hora: Date.now() };
}
function viajar(desde: string[], hacia: string[]) {
  const f = desde.pop();
  if (!f) return;
  hacia.push(JSON.stringify(menu));
  menu = JSON.parse(f);
  ultimo = { clave: '', hora: 0 };
  if (elegida && elegida !== 'movil' && !menu.items.some((e) => e.id === elegida)) elegida = null;
  despues(true);
}
q('[data-deshacer]').addEventListener('click', () => viajar(pasado, futuro));
q('[data-rehacer]').addEventListener('click', () => viajar(futuro, pasado));

// ───────────── Guardado automático ─────────────
let temporizador: ReturnType<typeof setTimeout> | undefined;
let pendiente = false;
async function pedir(metodo: string, ruta: string, cuerpo?: unknown) {
  const r = await fetch(`/api/admin/cabecera${ruta}`, { method: metodo, headers: { 'content-type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  if (!r.ok) throw new Error(await mensajeDeError(r, 'No se pudo guardar.'));
}
async function guardar() {
  clearTimeout(temporizador);
  pendiente = false;
  await pedir('PUT', '/borrador', menu);
  hayBorrador = true;
  estados();
}
function estados() {
  q('[data-descartar]').hidden = !hayBorrador;
  q('[data-estado-borrador]').hidden = !hayBorrador;
  q('[data-estado-publicada]').hidden = hayBorrador;
}
// Cada cambio se guarda en el borrador y recarga la vista previa; `ya` salta la espera (deshacer, agregar, quitar).
function despues(ya = false, conPanel = true) {
  pendiente = true;
  hayBorrador = true;
  estados();
  botones();
  dibujarLista();
  if (conPanel) dibujarPanel();
  avisar('Guardando…');
  clearTimeout(temporizador);
  temporizador = setTimeout(
    async () => {
      try {
        await guardar();
        mandar({ tipo: 'actualizar' });
        avisar('Guardado en el borrador');
      } catch (e) {
        avisar(e instanceof Error ? e.message : 'No se pudo guardar.', true);
      }
    },
    ya ? 0 : 700,
  );
}
// Cambio que no vuelve a dibujar el panel (así no se pierde el foco mientras se escribe).
function cambio(clave: string, aplicar: () => void, redibujarPanel = false) {
  antesDeCambiar(clave);
  aplicar();
  despues(false, redibujarPanel);
}

// ───────────── Vista previa ─────────────
const mandar = (m: Record<string, unknown>) => marco.contentWindow?.postMessage({ origen: 'cabecera', ...m }, location.origin);
addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.source !== marco.contentWindow || e.data?.origen !== 'cabecera') return;
  if (e.data.tipo === 'lista') mandar({ tipo: 'marcar', id: elegida });
  else if (e.data.tipo === 'seleccion') elegir(e.data.id);
});

// Escritorio: la tienda se dibuja con 1280 px de ancho y se achica para que entre; celular: 390 px.
let modo: 'escritorio' | 'celular' = matchMedia('(min-width: 1024px)').matches ? 'escritorio' : 'celular';
const ponerModo = (m: typeof modo) => {
  modo = m;
  for (const o of document.querySelectorAll<HTMLButtonElement>('[data-ancho]')) o.setAttribute('aria-pressed', String(o.dataset.ancho === modo));
  ajustar();
};
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-ver]'))
  b.addEventListener('click', () => {
    editor.dataset.tab = b.dataset.ver;
    for (const o of document.querySelectorAll<HTMLButtonElement>('[data-ver]')) o.setAttribute('aria-pressed', String(o === b));
  });
function ajustar() {
  const caja = q('[data-caja]');
  const lienzo = q('[data-lienzo]');
  const ancho = modo === 'celular' ? 390 : 1280;
  const k = Math.min(1, caja.clientWidth / ancho);
  if (!k) return; // pestaña oculta: se ajusta al mostrarla
  lienzo.style.width = `${ancho * k}px`;
  marco.style.width = `${ancho}px`;
  marco.style.height = `${caja.clientHeight / k}px`;
  marco.style.transform = `scale(${k})`;
}
new ResizeObserver(ajustar).observe(q('[data-caja]'));
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-ancho]')) b.addEventListener('click', () => ponerModo(b.dataset.ancho as typeof modo));

// ───────────── Selección ─────────────
function elegir(sel: string | null) {
  const e = menu.items.find((x) => x.id === sel);
  elegida = sel === 'movil' || e ? sel : null;
  // Una entrada que solo existe en un formato se muestra en ese formato.
  if (sel === 'movil' || e?.dispositivo === 'celular') ponerModo('celular');
  else if (e?.dispositivo === 'escritorio') ponerModo('escritorio');
  mandar({ tipo: 'marcar', id: elegida });
  dibujarLista();
  dibujarPanel();
  if (elegida) lista.querySelector(`[data-id="${elegida}"]`)?.scrollIntoView({ block: 'nearest' });
}
q('[data-cerrar]').addEventListener('click', () => elegir(null));

// ───────────── Lista de entradas ─────────────
// Al volver a dibujar, el foco se queda en el mismo control de la misma entrada: así se puede ordenar con el teclado.
const CONTROLES = ['data-asa', 'data-ojo'];
function dibujarLista() {
  const molde = q<HTMLTemplateElement>('#plantilla-fila');
  const enfocado = document.activeElement instanceof HTMLElement && lista.contains(document.activeElement) ? document.activeElement : null;
  const foco = enfocado && { id: enfocado.closest<HTMLElement>('[data-id]')?.dataset.id, control: CONTROLES.find((c) => enfocado.hasAttribute(c)) };
  lista.replaceChildren();
  menu.items.forEach((e, i) => {
    const fila = molde.content.firstElementChild!.cloneNode(true) as HTMLElement;
    fila.dataset.id = e.id;
    fila.setAttribute('aria-selected', String(e.id === elegida));
    q('[data-nombre]', fila).textContent = nombreDe(e);
    q('[data-detalle]', fila).textContent = detalle(e);
    fila.classList.toggle('opacity-60', !e.visible);
    q('[data-ojo-abierto]', fila).toggleAttribute('hidden', !e.visible);
    q('[data-ojo-cerrado]', fila).toggleAttribute('hidden', e.visible);
    lista.append(fila);
  });
  q('[data-vacio]').hidden = menu.items.length > 0;
  if (foco?.id && foco.control) {
    const fila = lista.querySelector<HTMLElement>(`[data-id="${foco.id}"]`);
    const habilitado = (c: string) => fila?.querySelector<HTMLButtonElement>(`[${c}]:not(:disabled)`);
    (habilitado(foco.control) ?? fila?.querySelector<HTMLElement>('[data-asa]'))?.focus();
  }
}
lista.addEventListener('click', (ev) => {
  const boton = (ev.target as HTMLElement).closest('button');
  const fila = (ev.target as HTMLElement).closest<HTMLElement>('[data-id]');
  if (!fila) return;
  const i = menu.items.findIndex((e) => e.id === fila.dataset.id);
  const it = menu.items;
  if (boton?.hasAttribute('data-asa')) return;
  if (boton?.hasAttribute('data-ojo')) cambio(`ver:${it[i].id}`, () => (it[i].visible = !it[i].visible), true);
  else if (!boton) elegir(it[i].id);
});
// Ordenar arrastrando: el orden del DOM manda (los ids son texto, `ordenable` los pasa por Number).
ordenable(lista, {
  asa: '[data-asa]',
  guardar: async () => {
    antesDeCambiar('orden');
    const orden = [...lista.children].map((f) => (f as HTMLElement).dataset.id);
    menu.items = orden.map((x) => menu.items.find((e) => e.id === x)!).filter(Boolean);
    despues();
  },
});

const NUEVAS: Record<string, () => Entrada> = {
  enlace: () => ({ id: idNuevo(), visible: true, dispositivo: 'todos', tipo: 'enlace', texto: 'Nuevo', enlace: '/productos' }),
  categoria: () => ({ id: idNuevo(), visible: true, dispositivo: 'todos', tipo: 'categoria', slug: principales()[0]?.slug ?? '', texto: '', subcategorias: [], tarjetas: [] }),
  colecciones: () => ({ id: idNuevo(), visible: true, dispositivo: 'todos', tipo: 'colecciones', texto: 'Colecciones', colecciones: [], imagenes: {} }),
};
q('[data-agregar]').addEventListener('click', () => {
  const tipo = q<HTMLSelectElement>('[data-tipo-nueva]').value;
  if (menu.items.length >= 14) return avisar('Máximo 14 entradas.', true);
  if (tipo === 'colecciones' && menu.items.some((e) => e.tipo === 'colecciones')) return avisar('Ya hay un panel de colecciones.', true);
  if (tipo === 'categoria' && !principales().length) return avisar('Todavía no hay categorías.', true);
  antesDeCambiar('agregar');
  const nueva = NUEVAS[tipo]();
  menu.items.push(nueva);
  elegir(nueva.id);
  despues(true);
});

// ───────────── Panel de la entrada elegida ─────────────
const ICONO = {
  borrar: '<path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/>',
  foto: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  asa: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
};
const svg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4" aria-hidden="true">${d}</svg>`;
const asa = (nombre: string) => `<button type="button" data-asa class="btn-icono cursor-grab touch-none active:cursor-grabbing" title="Arrastrar para ordenar" aria-label="Ordenar ${esc(nombre)}: arrastrá o usá las flechas arriba y abajo">${svg(ICONO.asa)}</button>`;
const iconBtn = (accion: string, d: string, titulo: string, extra = '') => `<button type="button" data-a="${accion}" ${extra} class="btn-icono" title="${titulo}" aria-label="${titulo}">${svg(d)}</button>`;

function fotoCampo(clave: string, ruta: string, vacio = 'Sin foto propia') {
  return `<div class="flex items-center gap-2">
    <div class="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50 text-gray-400">${clave ? `<img src="${foto(clave)}" alt="" class="size-full object-cover">` : svg(ICONO.foto)}</div>
    <div class="space-y-1">
      <label class="btn btn-secundario cursor-pointer"><span>${clave ? 'Cambiar foto' : 'Subir foto'}</span><input type="file" accept="image/*" class="sr-only" data-subir="${ruta}"></label>
      ${clave ? `<button type="button" class="btn btn-peligro-suave" data-a="quitar-foto" data-ruta="${ruta}">Quitar foto</button>` : `<p class="text-theme-xs text-gray-500">${vacio}</p>`}
    </div></div>`;
}

function tarjetasHtml(l: Tarjeta[], base: string) {
  const filas = l
    .map(
      (t, i) => `<div class="space-y-2 rounded-lg border border-gray-200 p-3">
      <div class="flex items-center justify-between"><span class="text-theme-sm font-medium text-gray-700">Tarjeta ${i + 1}</span>${iconBtn('quitar-tarjeta', ICONO.borrar, 'Quitar tarjeta', `data-ruta="${base}.${i}"`)}</div>
      <label class="block"><span class="etiqueta">A dónde lleva</span><input class="campo" list="rutas" data-c="${base}.${i}.enlace" value="${esc(t.enlace)}" placeholder="/categoria/vestidos"></label>
      <label class="block"><span class="etiqueta">Título</span><input class="campo" maxlength="40" data-c="${base}.${i}.titulo" value="${esc(t.titulo)}" placeholder="El nombre del destino"></label>
      ${fotoCampo(t.imagen, `${base}.${i}.imagen`, 'Usa la foto del destino, si tiene.')}
    </div>`,
    )
    .join('');
  return `${filas}${l.length < 2 ? `<button type="button" class="btn btn-secundario" data-a="mas-tarjeta" data-ruta="${base}">+ Agregar tarjeta</button>` : ''}`;
}

// Orden en que se muestra una lista elegible: primero lo tildado (en su orden) y después el resto; sin nada guardado, todo.
function ordenDe(e: any, campo: 'subcategorias' | 'colecciones'): string[] {
  const todas: string[] = campo === 'subcategorias' ? hijasDe(e.slug).map((h) => h.slug) : cols.map((c) => c.slug);
  const elegidas: string[] = (e[campo] as string[]).filter((s) => todas.includes(s));
  return elegidas.length ? [...elegidas, ...todas.filter((s) => !elegidas.includes(s))] : todas;
}

function cuerpo(e: Entrada, i: number) {
  const b = `items.${i}`;
  if (e.tipo === 'enlace')
    return `<label class="block"><span class="etiqueta">Texto</span><input class="campo" maxlength="30" data-c="${b}.texto" value="${esc(e.texto)}"></label>
      <label class="block"><span class="etiqueta">A dónde lleva</span><input class="campo" list="rutas" data-c="${b}.enlace" value="${esc(e.enlace)}" placeholder="/ofertas"></label>`;
  if (e.tipo === 'categoria') {
    const todas = hijasDe(e.slug);
    const orden = ordenDe(e, 'subcategorias').map((s) => todas.find((h) => h.slug === s)!);
    const filas = orden
      .map((h, k) => {
        const marcada = !e.subcategorias.length || e.subcategorias.includes(h.slug);
        return `<li data-id="${k}" class="flex items-center gap-2 py-1">${asa(h.nombre)}<input type="checkbox" class="size-4" data-sub="${i}" value="${h.slug}" ${marcada ? 'checked' : ''} aria-label="Mostrar ${esc(h.nombre)}"><span class="min-w-0 flex-1 truncate text-sm">${esc(h.nombre)}${h.activa !== 1 ? ' <span class="text-theme-xs text-gray-400">(oculta)</span>' : ''}</span></li>`;
      })
      .join('');
    return `<label class="block"><span class="etiqueta">Categoría</span><select class="campo pr-10" data-c="${b}.slug">${principales().map((p) => `<option value="${p.slug}" ${p.slug === e.slug ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
      <label class="block"><span class="etiqueta">Texto en el menú</span><input class="campo" maxlength="30" data-c="${b}.texto" value="${esc(e.texto)}" placeholder="El nombre de la categoría"></label>
      <div><p class="etiqueta">Subcategorías del desplegable</p>${todas.length ? `<ul data-orden="subcategorias" class="divide-y divide-gray-100 rounded-lg border border-gray-200 px-3">${filas}</ul><p class="text-theme-xs mt-1 text-gray-500">Tildá las que se ven y ordenalas arrastrando. Sin subcategorías no hay desplegable: el menú lleva directo a la categoría.</p>` : '<p class="text-theme-sm text-gray-500">Esta categoría no tiene subcategorías, así que el menú lleva directo a ella.</p>'}</div>
      ${todas.length ? `<div><p class="etiqueta">Tarjetas con foto del desplegable</p><div class="space-y-3">${tarjetasHtml(e.tarjetas, `${b}.tarjetas`)}</div>${e.tarjetas.length ? '' : '<p class="text-theme-xs mt-1 text-gray-500">Sin tarjetas propias se usan las dos primeras subcategorías con foto.</p>'}</div>` : ''}`;
  }
  const orden = ordenDe(e, 'colecciones').map((s) => cols.find((c) => c.slug === s)!);
  const filas = orden
    .map((c, k) => {
      const marcada = !e.colecciones.length || e.colecciones.includes(c.slug);
      return `<li data-id="${k}" class="space-y-2 py-2"><div class="flex items-center gap-2">${asa(c.nombre)}<input type="checkbox" class="size-4" data-col="${i}" value="${c.slug}" ${marcada ? 'checked' : ''} aria-label="Mostrar ${esc(c.nombre)}"><span class="min-w-0 flex-1 truncate text-sm">${esc(c.nombre)}</span></div>${fotoCampo(e.imagenes[c.slug] ?? '', `${b}.imagenes.${c.slug}`, 'Usa la foto de su primer producto.')}</li>`;
    })
    .join('');
  return `<label class="block"><span class="etiqueta">Texto en el menú</span><input class="campo" maxlength="30" data-c="${b}.texto" value="${esc(e.texto)}"></label>
    <div><p class="etiqueta">Colecciones del desplegable (hasta 8 se muestran)</p>${cols.length ? `<ul data-orden="colecciones" class="divide-y divide-gray-100 rounded-lg border border-gray-200 px-3">${filas}</ul>` : '<p class="text-theme-sm text-gray-500">Todavía no hay colecciones.</p>'}</div>`;
}

const actual = () => menu.items.find((e) => e.id === elegida);
function dibujarPanel() {
  const e = actual();
  const i = e ? menu.items.indexOf(e) : -1;
  const movil = elegida === 'movil';
  editor.toggleAttribute('data-sel', Boolean(e) || movil);
  q('[data-pie]').hidden = movil;
  if (!e && !movil) return;
  if (movil) {
    q('[data-titulo]').textContent = 'Tarjetas del menú del celular';
    campos.innerHTML = `<p class="text-theme-sm text-gray-500">Hasta dos tarjetas con foto debajo de la lista del menú del celular. Si no cargás ninguna, se usan las primeras subcategorías que tengan foto.</p>${tarjetasHtml(menu.tarjetasMovil, 'tarjetasMovil')}`;
    return activarOrden();
  }
  q('[data-titulo]').textContent = nombreDe(e!);
  q('[data-visible-panel] span').textContent = e!.visible ? 'Ocultar' : 'Mostrar';
  const donde = `<label class="block"><span class="etiqueta">Se muestra en</span><select class="campo" data-c="items.${i}.dispositivo"><option value="todos" ${e!.dispositivo === 'todos' ? 'selected' : ''}>Computadora y celular</option><option value="escritorio" ${e!.dispositivo === 'escritorio' ? 'selected' : ''}>Solo en la computadora</option><option value="celular" ${e!.dispositivo === 'celular' ? 'selected' : ''}>Solo en el celular</option></select></label>`;
  campos.innerHTML = cuerpo(e!, i) + donde;
  activarOrden();
}
// Las listas ordenables del panel (subcategorías, colecciones) se crean de nuevo en cada dibujo.
function activarOrden() {
  for (const ul of campos.querySelectorAll<HTMLElement>('[data-orden]'))
    ordenable(ul, {
      asa: '[data-asa]',
      guardar: async (idx) => {
        const e = actual() as any;
        const campo = ul.dataset.orden as 'subcategorias' | 'colecciones';
        const orden = ordenDe(e, campo);
        const marcadas: string[] = e[campo].length ? e[campo] : orden;
        cambio(`${e.id}:orden-${campo}`, () => (e[campo] = idx.map((n) => orden[n]).filter((s) => marcadas.includes(s))), true);
      },
    });
}

q('[data-borrar]').addEventListener('click', async () => {
  const e = actual();
  if (!e || !(await confirmar(`¿Quitar «${nombreDe(e)}» del menú?`))) return;
  cambio('quitar', () => menu.items.splice(menu.items.indexOf(e), 1));
  elegir(null);
  despues(true);
});
q('[data-visible-panel]').addEventListener('click', () => {
  const e = actual();
  if (e) cambio(`ver:${e.id}`, () => (e.visible = !e.visible), true);
});

// Camino "items.2.tarjetas.0.enlace" → objeto contenedor y clave final.
function destino(ruta: string): [Record<string, unknown>, string] {
  const partes = ruta.split('.');
  const ultima = partes.pop()!;
  let o: any = menu;
  for (const p of partes) o = o[p];
  return [o, ultima];
}

// Foto de una tarjeta o colección: se achica y convierte a WebP en el navegador (la misma subida de la portada).
async function subir(ruta: string, original?: File) {
  if (!original) return;
  const archivo = await recortar(original);
  if (!archivo) return;
  try {
    avisar('Subiendo foto…');
    const f = new FormData();
    f.set('foto', await aWebp(archivo, 1600), 'foto.webp');
    f.set('mediano', await aWebp(archivo, 1000), 'mediano.webp');
    const r = await fetch('/api/admin/portada/imagen', { method: 'POST', body: f });
    if (!r.ok) throw new Error(await mensajeDeError(r, 'No se pudo subir la foto.'));
    const { clave } = (await r.json()) as { clave: string };
    cambio(`foto:${ruta}`, () => (destino(ruta)[0][destino(ruta)[1]] = clave), true);
  } catch (err) {
    avisar(err instanceof Error ? err.message : 'No se pudo subir la foto.', true);
  }
}

campos.addEventListener('click', async (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-a]');
  if (!b) return;
  const a = b.dataset.a!;
  if (a === 'mas-tarjeta') cambio('tarjeta+', () => (destino(`${b.dataset.ruta}.x`)[0] as unknown as Tarjeta[]).push({ enlace: '', titulo: '', imagen: '' }), true);
  else if (a === 'quitar-tarjeta') {
    if (!(await confirmar('¿Quitar esta tarjeta?'))) return;
    const [o, k] = destino(b.dataset.ruta!);
    cambio('tarjeta-', () => (o as unknown as Tarjeta[]).splice(Number(k), 1), true);
  } else if (a === 'quitar-foto') {
    const [o, k] = destino(b.dataset.ruta!);
    cambio(`foto:${b.dataset.ruta}`, () => (/\.imagenes\./.test(b.dataset.ruta!) ? delete o[k] : (o[k] = '')), true);
  }
});

campos.addEventListener('change', (ev) => {
  const t = ev.target as HTMLInputElement;
  if (t.dataset.subir) return void subir(t.dataset.subir, t.files?.[0]);
  const k = t.dataset.sub ?? t.dataset.col;
  if (k !== undefined) {
    const e = actual() as any;
    const campo = t.dataset.sub !== undefined ? 'subcategorias' : 'colecciones';
    const todas: string[] = campo === 'subcategorias' ? hijasDe(e.slug).map((h) => h.slug) : cols.map((c) => c.slug);
    const actuales: string[] = e[campo].length ? e[campo] : todas;
    const nuevas = t.checked ? [...actuales.filter((s) => s !== t.value), t.value] : actuales.filter((s) => s !== t.value);
    // Sin ninguna tildada no se muestra nada de esta lista: se vuelve a "todas" para no dejar un desplegable vacío.
    cambio(`${e.id}:${campo}`, () => (e[campo] = nuevas.length === todas.length ? todas.filter((s) => nuevas.includes(s)) : nuevas), true);
  } else if (t.dataset.c && t.tagName === 'SELECT') aplicarCampo(t, true);
});
campos.addEventListener('input', (ev) => {
  const t = ev.target as HTMLInputElement;
  if (t.dataset.c && t.tagName === 'INPUT') aplicarCampo(t, false);
});
function aplicarCampo(t: HTMLInputElement, redibujar: boolean) {
  const ruta = t.dataset.c!;
  const esCategoria = /\.slug$/.test(ruta);
  cambio(`c:${ruta}`, () => {
    const [o, k] = destino(ruta);
    o[k] = t.value;
    // Cambiar de categoría reinicia lo que dependía de la anterior.
    if (esCategoria) Object.assign(o, { subcategorias: [], tarjetas: [] });
  }, redibujar || esCategoria);
  // El título del panel sigue al texto que se escribe.
  const e = actual();
  if (e && !redibujar) q('[data-titulo]').textContent = nombreDe(e);
}

// ───────────── Publicar, descartar y volver al menú automático ─────────────
const conAviso = (accion: () => Promise<void>, ok: string) => async () => {
  try {
    avisar('Un momento…');
    await accion();
    avisar(ok);
  } catch (e) {
    avisar(e instanceof Error ? e.message : 'No se pudo completar.', true);
  }
};
q('[data-publicar]').addEventListener('click', async () => {
  if (!(await confirmar('¿Publicar este menú? Se ve en la tienda apenas lo publiques.'))) return;
  await conAviso(async () => {
    await guardar();
    await pedir('POST', '/publicar');
    location.reload();
  }, 'Menú publicado.')();
});
q('[data-descartar]').addEventListener('click', async () => {
  if (!(await confirmar('¿Descartar los cambios sin publicar? Vuelve al menú publicado.'))) return;
  await conAviso(async () => {
    await pedir('DELETE', '/borrador');
    location.reload();
  }, 'Cambios descartados.')();
});
addEventListener('beforeunload', (e) => pendiente && (e.preventDefault(), (e.returnValue = '')));

dibujarLista();
estados();
ponerModo(modo);
