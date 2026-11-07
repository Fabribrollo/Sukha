import { confirmar, pedirTexto } from './dialogo-panel';
// Editor visual de la portada. La portada real se ve en un iframe (/?vista-previa=1&editor=1, con el script public/editor-portada.js):
// al tocar una sección avisa por mensaje y acá se muestran sus campos. Todo cambio se guarda solo en el borrador y la vista previa
// se recarga; publicar es un botón aparte. Los datos vienen de la página en #datos-portada; la API es /api/admin/portada.
import { mejorar } from './combo';
import { ordenable } from './ordenable';
import { recortar } from './recorte';
import { iniciarRangos } from './rango-fechas';
import { aWebp } from './webp';

type Fuente = { tipo: 'destacados' | 'nuevos' | 'ofertas' } | { tipo: 'coleccion' | 'categoria'; slug: string } | { tipo: 'seleccion'; ids: number[] };
type Seccion = { id: string; tipo: string; visible: boolean; titulo?: string; columnas?: number; conFoto?: boolean; categorias?: string[]; titulos?: Record<string, string>; fuente?: Fuente; cantidad?: number; verTodos?: boolean; parrafo?: string; imagen?: string; etiqueta?: string; boton?: string; enlace?: string; tono?: 'oscuro' | 'claro'; items?: { titulo: string; texto: string }[]; producto?: string; looks?: Look[]; dispositivo?: 'todos' | 'escritorio' | 'celular'; boton2?: string; enlace2?: string; categoria?: string; lat?: number | null; lng?: number | null; zoom?: number; etiquetaMapa?: string };
type Look = { imagen: string; descripcion: string; categoria: string; enlace: string };
type Datos = {
  inicial: { version: 1; secciones: Seccion[] };
  hayBorrador: boolean;
  opciones: {
    categorias: { id: number; slug: string; nombre: string; padre: string | null; conFoto: boolean }[];
    colecciones: { slug: string; nombre: string }[];
    productos: { id: number; nombre: string; estado: string; categoria: string }[];
  };
};

const datos = JSON.parse(document.querySelector('#datos-portada')!.textContent!) as Datos;
const { opciones } = datos;
let secciones: Seccion[] = structuredClone(datos.inicial.secciones);
let hayBorrador = datos.hayBorrador;
let elegida: string | null = null;

const q = <T extends HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s)!;
const lista = q<HTMLUListElement>('[data-secciones]');
const editor = q('[data-editor]');
const panel = q('[data-panel]');
const campos = q('[data-campos]');
const marco = q<HTMLIFrameElement>('[data-vista]');
const mensaje = q('[data-mensaje]');
const avisar = (t: string, error = false) => {
  mensaje.textContent = t;
  mensaje.classList.toggle('text-error-600', error);
  mensaje.classList.toggle('text-gray-500', !error);
};

const NOMBRES: Record<string, string> = { banda: 'Banda de color', hero: 'Hero Moda real', campana: 'Campaña', coleccion: 'Colección destacada', columnas: 'Columnas de texto', local: 'El local', carrusel: 'Banners', categorias: 'Categorías', productos: 'Productos', beneficios: 'Beneficios', texto: 'Texto', newsletter: 'Newsletter', separador: 'Separador' };
const FUENTES: Record<string, string> = { destacados: 'Destacados', nuevos: 'Nuevos ingresos', ofertas: 'Ofertas', coleccion: 'Una colección', categoria: 'Una categoría', seleccion: 'Elegidos a mano' };
const SIN_CAMPOS = ['beneficios', 'newsletter', 'separador'];
const id = () => Math.random().toString(36).slice(2, 10).padEnd(8, 'x');
const nombreCategoria = (slug: string) => {
  const c = opciones.categorias.find((x) => x.slug === slug);
  return c ? (c.padre ? `${c.padre} › ${c.nombre}` : c.nombre) : slug;
};

const NUEVAS: Record<string, () => Seccion> = {
  banda: () => ({ id: id(), tipo: 'banda', visible: true, etiqueta: 'EXPLORÁ', titulo: '', categoria: '', cantidad: 6, boton: '' }),
  hero: () => ({ id: id(), tipo: 'hero', visible: true, titulo: 'MODA REAL', etiqueta: '', producto: '', boton: '', enlace: '', looks: [{ imagen: '', descripcion: '', categoria: '', enlace: '' }] }),
  campana: () => ({ id: id(), tipo: 'campana', visible: true, imagen: '', etiqueta: '', titulo: '', boton: '', enlace: '', tono: 'oscuro' }),
  coleccion: () => ({ id: id(), tipo: 'coleccion', visible: true, imagen: '', etiqueta: '', titulo: '', parrafo: '', boton: '', enlace: '' }),
  columnas: () => ({ id: id(), tipo: 'columnas', visible: true, items: [{ titulo: '', texto: '' }, { titulo: '', texto: '' }, { titulo: '', texto: '' }] }),
  local: () => ({ id: id(), tipo: 'local', visible: true, imagen: '', etiqueta: '', titulo: '', parrafo: '', boton: '', enlace: '', boton2: '', enlace2: '', lat: null, lng: null, zoom: 16, etiquetaMapa: '' }),
  carrusel: () => ({ id: id(), tipo: 'carrusel', visible: true }),
  categorias: () => ({ id: id(), tipo: 'categorias', visible: true, titulo: 'Categorías', columnas: 3, conFoto: true, categorias: [], titulos: {} }),
  productos: () => ({ id: id(), tipo: 'productos', visible: true, titulo: 'Lo nuevo', fuente: { tipo: 'nuevos' }, cantidad: 6, verTodos: true }),
  beneficios: () => ({ id: id(), tipo: 'beneficios', visible: true }),
  texto: () => ({ id: id(), tipo: 'texto', visible: true, titulo: '', parrafo: '' }),
  newsletter: () => ({ id: id(), tipo: 'newsletter', visible: true }),
  separador: () => ({ id: id(), tipo: 'separador', visible: true }),
};

const detalle = (s: Seccion) => {
  if (s.tipo === 'categorias') return `${s.columnas} columnas · ${s.categorias?.length ? `${s.categorias.length} elegidas` : 'todas'}`;
  if (s.tipo === 'productos') return `${FUENTES[s.fuente!.tipo]} · ${s.cantidad}`;
  if (s.tipo === 'columnas') return `${s.items!.length} columnas`;
  if (s.tipo === 'banda') return s.categoria ? nombreCategoria(s.categoria) : 'Elegí una categoría';
  if (s.tipo === 'hero') return `${s.looks!.filter((l) => l.imagen).length} de ${s.looks!.length} looks con foto`;
  if (s.tipo === 'campana' || s.tipo === 'coleccion' || s.tipo === 'local') return s.imagen ? 'Con foto' : 'Sin foto todavía';
  if (s.tipo === 'texto') return (s.parrafo || 'Sin texto').slice(0, 40);
  return '';
};

// ───────────── Deshacer y rehacer ─────────────
// Se guarda una foto de las secciones antes de cada cambio; escribir seguido en un mismo campo cuenta como un solo cambio.
let pasado: string[] = [];
let futuro: string[] = [];
let ultimo = { clave: '', hora: 0 };
const botones = () => {
  q<HTMLButtonElement>('[data-deshacer]').disabled = !pasado.length;
  q<HTMLButtonElement>('[data-rehacer]').disabled = !futuro.length;
};
function antesDeCambiar(clave: string) {
  if (clave !== ultimo.clave || Date.now() - ultimo.hora > 1500) {
    pasado.push(JSON.stringify(secciones));
    if (pasado.length > 50) pasado.shift();
    futuro = [];
  }
  ultimo = { clave, hora: Date.now() };
}
function viajar(desde: string[], hacia: string[]) {
  const foto = desde.pop();
  if (!foto) return;
  hacia.push(JSON.stringify(secciones));
  secciones = JSON.parse(foto);
  ultimo = { clave: '', hora: 0 };
  if (elegida && !secciones.some((s) => s.id === elegida)) elegida = null;
  despues(true);
}
q('[data-deshacer]').addEventListener('click', () => viajar(pasado, futuro));
q('[data-rehacer]').addEventListener('click', () => viajar(futuro, pasado));

// ───────────── Guardado automático ─────────────
let temporizador: ReturnType<typeof setTimeout> | undefined;
let pendiente = false;
async function pedir(metodo: string, ruta: string, cuerpo?: unknown) {
  const r = await fetch(`/api/admin/portada${ruta}`, { method: metodo, headers: { 'content-type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No se pudo guardar.');
}
async function guardar() {
  clearTimeout(temporizador);
  pendiente = false;
  await pedir('PUT', '/borrador', { version: 1, secciones });
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
  mandar({ tipo: 'datos', secciones });
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
        // Lo que la vista ya mostró al instante no se vuelve a pedir; si faltaba algo que arma el servidor, se cambian solo las secciones distintas.
        if (necesitaServidor) {
          necesitaServidor = false;
          mandar({ tipo: 'actualizar' });
        }
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
let necesitaServidor = false;
// Cambios que ya están en el servidor (banners, nombres, descartar): se cambian solo las secciones distintas.
const recargarVista = () => mandar({ tipo: 'actualizar' });
const mandar = (m: Record<string, unknown>) => marco.contentWindow?.postMessage({ origen: 'portada', ...m }, location.origin);
addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.source !== marco.contentWindow || e.data?.origen !== 'portada') return;
  if (e.data.tipo === 'lista') {
    mandar({ tipo: 'datos', secciones }); // punto de partida para los cambios que siguen
    mandar({ tipo: 'marcar', id: elegida });
  } else if (e.data.tipo === 'necesita') necesitaServidor = true;
  else if (e.data.tipo === 'seleccion') elegir(e.data.id);
});

// Escritorio: la tienda se dibuja con 1280 px de ancho y se achica para que entre; celular: 390 px.
// En el celular arranca en vista celular, con pestañas Secciones · Vista previa.
let modo: 'escritorio' | 'celular' = matchMedia('(min-width: 1024px)').matches ? 'escritorio' : 'celular';
for (const o of document.querySelectorAll<HTMLButtonElement>('[data-ancho]')) o.setAttribute('aria-pressed', String(o.dataset.ancho === modo));
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-ver]'))
  b.addEventListener('click', () => {
    q('[data-editor]').dataset.tab = b.dataset.ver;
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
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-ancho]'))
  b.addEventListener('click', () => {
    modo = b.dataset.ancho as typeof modo;
    for (const o of document.querySelectorAll<HTMLButtonElement>('[data-ancho]')) o.setAttribute('aria-pressed', String(o === b));
    ajustar();
  });

// ───────────── Selección ─────────────
function elegir(sel: string | null) {
  elegida = sel && secciones.some((s) => s.id === sel) ? sel : null;
  mandar({ tipo: 'marcar', id: elegida });
  dibujarLista();
  dibujarPanel();
  if (elegida) lista.querySelector(`[data-id="${elegida}"]`)?.scrollIntoView({ block: 'nearest' });
}

// ───────────── Lista de secciones ─────────────
// Al volver a dibujar, el foco se queda en el mismo control de la misma sección: así se puede ordenar con el teclado
// (flechas sobre el asa) sin perder el lugar después de cada movimiento.
const CONTROLES = ['data-asa', 'data-ojo'];
function dibujarLista() {
  const molde = q<HTMLTemplateElement>('#plantilla-fila');
  const enfocado = document.activeElement instanceof HTMLElement && lista.contains(document.activeElement) ? document.activeElement : null;
  const foco = enfocado && { id: enfocado.closest<HTMLElement>('[data-id]')?.dataset.id, control: CONTROLES.find((c) => enfocado.hasAttribute(c)) };
  lista.replaceChildren();
  secciones.forEach((s, i) => {
    const fila = molde.content.firstElementChild!.cloneNode(true) as HTMLElement;
    fila.dataset.id = s.id;
    fila.setAttribute('aria-selected', String(s.id === elegida));
    q('[data-nombre]', fila).textContent = `${NOMBRES[s.tipo]}${s.titulo ? ` · ${s.titulo}` : ''}`;
    q('[data-detalle]', fila).textContent = detalle(s);
    fila.classList.toggle('opacity-60', !s.visible);
    q('[data-ojo-abierto]', fila).toggleAttribute('hidden', !s.visible);
    q('[data-ojo-cerrado]', fila).toggleAttribute('hidden', s.visible);
    lista.append(fila);
  });
  q('[data-vacio]').hidden = secciones.length > 0;
  if (foco?.id && foco.control) {
    const fila = lista.querySelector<HTMLElement>(`[data-id="${foco.id}"]`);
    const habilitado = (c: string) => fila?.querySelector<HTMLButtonElement>(`[${c}]:not(:disabled)`);
    (habilitado(foco.control) ?? fila?.querySelector<HTMLElement>('[data-asa]'))?.focus();
  }
}
lista.addEventListener('click', (e) => {
  const boton = (e.target as HTMLElement).closest('button');
  const fila = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
  if (!fila) return;
  const i = secciones.findIndex((s) => s.id === fila.dataset.id);
  if (boton?.hasAttribute('data-asa')) return;
  if (boton?.hasAttribute('data-ojo')) cambio(`ver:${secciones[i].id}`, () => (secciones[i].visible = !secciones[i].visible), true);
  else if (!boton) elegir(secciones[i].id);
});
// Ordenar arrastrando: la lista del DOM manda; se reordena el estado según los ids.
ordenable(lista, {
  asa: '[data-asa]',
  guardar: async () => {
    antesDeCambiar('orden');
    // Los ids de las secciones son texto: se lee el orden del DOM (`ordenable` pasa los ids por Number y daría NaN).
    const orden = [...lista.children].map((f) => (f as HTMLElement).dataset.id);
    secciones = orden.map((x) => secciones.find((s) => s.id === x)!).filter(Boolean);
    despues();
  },
});
q('[data-agregar]').addEventListener('click', () => {
  if (secciones.length >= 20) return avisar('Máximo 20 secciones.', true);
  antesDeCambiar('agregar');
  const nueva = NUEVAS[q<HTMLSelectElement>('[data-tipo-nueva]').value]();
  secciones.push(nueva);
  elegida = nueva.id;
  despues(true);
});

// ───────────── Panel de la sección elegida ─────────────
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const campo = (etiqueta: string, html: string) => `<label class="block"><span class="etiqueta">${etiqueta}</span>${html}</label>`;
const marca = (nombre: string, texto: string, marcada: boolean) => `<label class="flex cursor-pointer items-center gap-2 text-sm text-gray-700 select-none"><input type="checkbox" name="${nombre}" ${marcada ? 'checked' : ''} class="text-brand-500 size-4 rounded border-gray-300" />${texto}</label>`;
const opcion = (v: string | number, t: string, sel = false) => `<option value="${esc(String(v))}" ${sel ? 'selected' : ''}>${esc(t)}</option>`;
const selector = (nombre: string, etiqueta: string, opts: string, extra = '') => campo(etiqueta, `<select name="${nombre}" data-combo ${extra} class="campo">${opts}</select>`);
const icono = {
  x: '<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
};
// Color del texto de la campaña sobre la foto: dos botones, como un interruptor.
const tonos = (actual: 'oscuro' | 'claro') =>
  `<fieldset class="space-y-2"><legend class="etiqueta">Texto sobre la foto</legend><div class="grid grid-cols-2 gap-2">${(
    [
      ['oscuro', 'Oscuro', 'Para fotos claras'],
      ['claro', 'Claro', 'Para fotos oscuras'],
    ] as const
  )
    .map(([v, t, ayuda]) => `<label class="has-checked:border-brand-500 has-checked:bg-brand-50 flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 p-3 text-sm text-gray-700 select-none"><input type="radio" name="tono" value="${v}" ${actual === v ? 'checked' : ''} class="text-brand-500 mt-0.5 size-4 border-gray-300" /><span>${t}<span class="text-theme-xs block text-gray-500">${ayuda}</span></span></label>`)
    .join('')}</div></fieldset>`;
const asaIcono = '<svg class="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';
const asaHtml = (nombre: string, tam = 'size-7') => `<button type="button" data-asa class="btn-icono ${tam} cursor-grab touch-none active:cursor-grabbing" title="Arrastrar para ordenar" aria-label="Ordenar ${esc(nombre)}: arrastrar, o flechas arriba y abajo">${asaIcono}</button>`;
const chip = (valor: string, texto: string, extra = '') => `<li data-chip="${esc(valor)}" class="rounded-lg border border-gray-200 bg-gray-50 p-2"><div class="flex items-center gap-2"><span class="min-w-0 flex-1 truncate text-sm text-gray-700">${esc(texto)}</span>${extra}<button type="button" data-quitar-chip="${esc(valor)}" class="btn-icono size-7" title="Quitar" aria-label="Quitar ${esc(texto)}">${icono.x}</button></div></li>`;

function dibujarPanel() {
  const s = secciones.find((x) => x.id === elegida);
  editor.toggleAttribute('data-sel', Boolean(s));
  if (!s) return;
  q('[data-titulo]').textContent = `${NOMBRES[s.tipo]}${s.titulo ? ` · ${s.titulo}` : ''}`;
  q('[data-visible-panel] span').textContent = s.visible ? 'Ocultar' : 'Mostrar';
  let html = '';
  if (s.tipo === 'categorias') {
    const elegidas = s.categorias ?? [];
    const disponibles = opciones.categorias.filter((c) => !elegidas.includes(c.slug));
    html =
      campo('Título de la sección', `<input name="titulo" value="${esc(s.titulo ?? '')}" maxlength="80" class="campo" />`) +
      campo('Columnas (en escritorio)', `<select name="columnas" class="campo">${[2, 3, 4, 6].map((n) => opcion(n, String(n), s.columnas === n)).join('')}</select>`) +
      marca('conFoto', 'Mostrar la foto de cada categoría', !!s.conFoto) +
      marca('verTodos', 'Mostrar el enlace «Ver todo →»', !!s.verTodos) +
      `<div class="space-y-2"><span class="etiqueta">Categorías que se muestran</span>` +
      (elegidas.length
        ? `<ul data-elegidas class="space-y-2">${elegidas
            .map((slug) =>
              chip(
                slug,
                nombreCategoria(slug),
                `${asaHtml(nombreCategoria(slug))}<button type="button" data-renombrar="${esc(slug)}" class="btn-icono size-7" title="Cambiar el nombre" aria-label="Cambiar el nombre">✎</button>`,
              ).replace('<li ', `<li data-id="${esc(slug)}" `).replace('</div></li>', `</div><input data-titulo-portada="${esc(slug)}" value="${esc(s.titulos?.[slug] ?? '')}" maxlength="40" placeholder="Título en la portada (opcional)" aria-label="Título en la portada" class="campo mt-2 h-9" /></li>`),
            )
            .join('')}</ul>`
        : `<p class="text-theme-xs text-gray-500">Ahora se muestran todas las categorías principales. Agregá algunas para elegir cuáles y en qué orden.</p>`) +
      selector('agregarCategoria', 'Agregar una categoría', `<option value="" disabled selected>Buscar…</option>${disponibles.map((c) => opcion(c.slug, c.padre ? `${c.padre} › ${c.nombre}` : c.nombre)).join('')}`) +
      (elegidas.length ? '<button type="button" data-todas class="text-theme-xs text-gray-500 underline">Mostrar todas las principales</button>' : '') +
      `<p class="text-theme-xs text-gray-500">Elegir categorías acá solo cambia la portada: las demás siguen en la tienda. El título en la portada tampoco cambia el nombre real.</p></div>`;
  } else if (s.tipo === 'productos') {
    const fu = s.fuente!;
    const ids = fu.tipo === 'seleccion' ? fu.ids : [];
    html =
      campo('Título de la sección', `<input name="titulo" value="${esc(s.titulo ?? '')}" maxlength="80" class="campo" />`) +
      campo('Qué productos mostrar', `<select name="fuente" class="campo">${Object.entries(FUENTES).map(([v, t]) => opcion(v, t, fu.tipo === v)).join('')}</select>`) +
      (fu.tipo === 'coleccion' ? selector('coleccion', 'Colección', opciones.colecciones.map((c) => opcion(c.slug, c.nombre, fu.slug === c.slug)).join('')) : '') +
      (fu.tipo === 'categoria' ? selector('categoriaFuente', 'Categoría', opciones.categorias.map((c) => opcion(c.slug, c.padre ? `${c.padre} › ${c.nombre}` : c.nombre, fu.slug === c.slug)).join('')) : '') +
      (fu.tipo === 'seleccion'
        ? `<div class="space-y-2"><span class="etiqueta">Productos (hasta 24)</span>${ids.length ? `<ul data-elegidos class="space-y-2">${ids.map((i) => chip(String(i), opciones.productos.find((p) => p.id === i)?.nombre ?? `Producto ${i}`)).join('')}</ul>` : ''}${selector('agregarProducto', 'Agregar un producto', `<option value="" disabled selected>Buscar…</option>${opciones.productos.filter((p) => !ids.includes(p.id)).map((p) => opcion(p.id, p.estado === 'publicado' ? p.nombre : `${p.nombre} (${p.estado}, no se muestra)`)).join('')}`)}</div>`
        : '') +
      campo('Cantidad', `<select name="cantidad" class="campo">${[3, 6, 9, 12].map((n) => opcion(n, String(n), s.cantidad === n)).join('')}</select>`) +
      marca('verTodos', 'Mostrar el enlace «Ver todos»', s.verTodos !== false);
  } else if (s.tipo === 'banda') {
    html =
      campo('Texto chico de arriba', `<input data-f="etiqueta" value="${esc(s.etiqueta ?? '')}" maxlength="40" class="campo" />`) +
      campo('Título', `<input data-f="titulo" value="${esc(s.titulo ?? '')}" maxlength="80" class="campo" />`) +
      selector('categoriaBanda', 'Categoría de las prendas', opcion('', 'Elegí una categoría', !s.categoria) + opciones.categorias.map((c) => opcion(c.slug, c.padre ? `${c.padre} › ${c.nombre}` : c.nombre, s.categoria === c.slug)).join('')) +
      campo('Cantidad', `<select name="cantidad" class="campo">${[3, 6, 9].map((n) => opcion(n, String(n), s.cantidad === n)).join('')}</select>`) +
      campo('Texto del botón (ej. Ver todos los chalecos)', `<input data-f="boton" value="${esc(s.boton ?? '')}" maxlength="40" class="campo" />`);
  } else if (s.tipo === 'hero') {
    const looks = s.looks!;
    const entrada = (nombre: string, etiqueta: string, max: number) => campo(etiqueta, `<input data-f="${nombre}" value="${esc(String((s as any)[nombre] ?? ''))}" maxlength="${max}" class="campo" />`);
    const tarjetaLook = (l: Look, i: number) => `<div class="space-y-2 rounded-lg bg-gray-50 p-3"><p class="text-theme-xs font-medium text-gray-500">Look ${i + 1}</p>${l.imagen ? `<img src="/api/imagenes/${esc(l.imagen)}/mediano.webp" alt="" class="h-32 rounded-lg bg-white object-contain" />` : ''}<label class="btn btn-secundario cursor-pointer">${l.imagen ? 'Cambiar foto' : 'Subir foto'}<input type="file" accept="image/*" data-lk="${i}" data-lf="foto" class="sr-only" /></label>${campo('Descripción de la foto', `<input data-lk="${i}" data-lf="descripcion" value="${esc(l.descripcion)}" maxlength="120" class="campo" />`)}${campo('Categoría que se muestra abajo', `<input data-lk="${i}" data-lf="categoria" value="${esc(l.categoria)}" maxlength="40" placeholder="Vestidos" class="campo" />`)}${campo('Adónde lleva esa categoría', selectorEnlace(`enlaceLook${i}`, l.enlace, `data-lk="${i}" data-lf="enlace"`))}</div>`;
    html =
      entrada('titulo', 'Título grande', 40) +
      `<div class="space-y-3 rounded-xl border border-gray-200 p-3"><p class="text-theme-xs font-medium text-gray-500">Looks (hasta 3). Con 3 rotan de a dos en la computadora. La foto va recortada, sin fondo.</p>${looks.map(tarjetaLook).join('')}<div class="flex gap-2">${looks.length < 3 ? '<button type="button" data-look-mas class="btn btn-secundario">Agregar look</button>' : ''}${looks.length > 1 ? '<button type="button" data-look-menos class="btn btn-peligro-suave">Quitar el último</button>' : ''}</div></div>` +
      `<div class="space-y-3 rounded-xl border border-gray-200 p-3"><p class="text-theme-xs font-medium text-gray-500">Solo en el celular (la tapa)</p>${entrada('etiqueta', 'Texto chico de arriba', 40)}${entrada('producto', 'Línea de la prenda (ej. Vestido de fiesta · $ 130.000)', 60)}${entrada('boton', 'Texto del botón', 30)}${campo('Adónde lleva el botón', selectorEnlace('enlace', s.enlace ?? '', 'data-f="enlace"'))}</div>`;
  } else if (s.tipo === 'campana' || s.tipo === 'coleccion' || s.tipo === 'local') {
    const txt = (nombre: string, etiqueta: string, max: number) => campo(etiqueta, `<input data-f="${nombre}" value="${esc(String((s as any)[nombre] ?? ''))}" maxlength="${max}" class="campo" />`);
    html =
      `<div class="space-y-2"><span class="etiqueta">Foto</span>${s.imagen ? `<img src="/api/imagenes/${esc(s.imagen)}/grande.webp" alt="" class="aspect-video w-full rounded-lg bg-gray-100 object-cover" />` : ''}<div class="flex gap-2"><label class="btn btn-secundario cursor-pointer">${s.imagen ? 'Cambiar foto' : 'Subir foto'}<input type="file" name="foto" accept="image/*" class="sr-only" /></label>${s.imagen ? '<button type="button" data-quitar-foto class="btn btn-peligro-suave">Quitar</button>' : ''}</div></div>` +
      (s.tipo === 'campana' ? tonos(s.tono ?? 'oscuro') : '') +
      txt('etiqueta', 'Texto chico de arriba', 40) +
      txt('titulo', 'Título', 80) +
      (s.tipo === 'campana' ? '' : campo('Texto', `<textarea data-f="parrafo" rows="4" maxlength="300" class="campo h-auto py-3">${esc(s.parrafo ?? '')}</textarea>`)) +
      txt('boton', s.tipo === 'local' ? 'Texto del enlace (ej. Cómo llegar)' : 'Texto del botón', 30) +
      campo('Adónde lleva', selectorEnlace('enlace', s.enlace ?? '', 'data-f="enlace"')) +
      (s.tipo === 'local' ? `<div class="space-y-3 rounded-xl border border-gray-200 p-3"><p class="text-theme-xs font-medium text-gray-500">Segundo botón (solo en el celular, ej. WhatsApp)</p>${txt('boton2', 'Texto del segundo botón', 30)}${campo('Adónde lleva', selectorEnlace('enlace2', s.enlace2 ?? '', 'data-f="enlace2"'))}</div>` + `<div class="space-y-3 rounded-xl border border-gray-200 p-3"><p class="text-theme-xs font-medium text-gray-500">Mapa (reemplaza a la foto). Pegá un link largo de Google Maps o cargá las coordenadas.</p>${campo('Link de Google Maps', '<input data-link-mapa placeholder="https://www.google.com/maps/place/…@-38.95,-68.05…" class="campo" />')}<div class="grid grid-cols-2 gap-2">${campo('Latitud', `<input data-f="lat" data-num inputmode="decimal" value="${s.lat ?? ''}" class="campo" />`)}${campo('Longitud', `<input data-f="lng" data-num inputmode="decimal" value="${s.lng ?? ''}" class="campo" />`)}</div>${campo('Zoom', `<select name="zoomMapa" class="campo">${[14, 15, 16, 17, 18].map((n) => opcion(n, `${n}${n === 14 ? ' (más lejos)' : n === 18 ? ' (más cerca)' : ''}`, (s.zoom ?? 16) === n)).join('')}</select>`)}${campo('Texto de la etiqueta', `<input data-f="etiquetaMapa" value="${esc(s.etiquetaMapa ?? '')}" maxlength="40" placeholder="Sukhä · Alberdi 129" class="campo" />`)}</div>` : '');
  } else if (s.tipo === 'columnas') {
    const n = s.items!.length;
    html =
      s.items!.map((it, i) => `<div class="space-y-2 rounded-xl border border-gray-200 p-3"><p class="text-theme-xs font-medium text-gray-500">Columna ${i + 1}</p><input data-ci="${i}" data-cf="titulo" value="${esc(it.titulo)}" maxlength="40" placeholder="Título" aria-label="Título de la columna ${i + 1}" class="campo" /><textarea data-ci="${i}" data-cf="texto" rows="3" maxlength="200" placeholder="Texto" aria-label="Texto de la columna ${i + 1}" class="campo h-auto py-3">${esc(it.texto)}</textarea></div>`).join('') +
      `<div class="flex gap-2">${n < 3 ? '<button type="button" data-col-mas class="btn btn-secundario">Agregar columna</button>' : ''}${n > 1 ? '<button type="button" data-col-menos class="btn btn-peligro-suave">Quitar la última</button>' : ''}</div>`;
  } else if (s.tipo === 'texto') {
    html = campo('Título', `<input name="titulo" value="${esc(s.titulo ?? '')}" maxlength="80" class="campo" />`) + campo('Texto', `<textarea name="parrafo" rows="6" maxlength="600" class="campo h-auto py-3">${esc(s.parrafo ?? '')}</textarea>`);
  } else if (s.tipo === 'carrusel') {
    campos.innerHTML = '';
    void mostrarBanners();
    return;
  } else {
    html = `<p class="text-theme-sm text-gray-600">${s.tipo === 'separador' ? 'Una línea que separa dos partes de la portada.' : s.tipo === 'beneficios' ? 'Envíos, cuotas y descuentos: se arma solo con la configuración de la tienda.' : 'El formulario para que se suscriban a novedades.'}</p>`;
  }
  html += campo('Se muestra en', `<select name="dispositivo" class="campo">${opcion('todos', 'Computadora y celular', (s.dispositivo ?? 'todos') === 'todos')}${opcion('escritorio', 'Solo en la computadora', s.dispositivo === 'escritorio')}${opcion('celular', 'Solo en el celular', s.dispositivo === 'celular')}</select>`);
  campos.innerHTML = html;
  for (const sel of campos.querySelectorAll<HTMLSelectElement>('select[data-combo]')) mejorar(sel);
  // Categorías elegidas de una sección: se ordenan arrastrando.
  const chips = campos.querySelector<HTMLElement>('[data-elegidas]');
  if (chips && s.tipo === 'categorias')
    ordenable(chips, {
      asa: '[data-asa]',
      guardar: async () => {
        const orden = [...chips.children].map((li) => (li as HTMLElement).dataset.chip!);
        cambio('orden-cat', () => (s.categorias = orden), true);
      },
    });
}
q('[data-cerrar]').addEventListener('click', () => elegir(null));
q('[data-borrar]').addEventListener('click', async () => {
  if (!elegida || !await confirmar('¿Quitar esta sección de la portada?')) return;
  const i = secciones.findIndex((s) => s.id === elegida);
  cambio('quitar', () => secciones.splice(i, 1));
  elegida = null;
  despues(true);
});
q('[data-visible-panel]').addEventListener('click', () => {
  const s = secciones.find((x) => x.id === elegida);
  if (s) cambio(`ver:${s.id}`, () => (s.visible = !s.visible), true);
});

// Campos del panel: lo que se escribe o elige se aplica enseguida a la sección elegida.
const actual = () => secciones.find((x) => x.id === elegida)!;
campos.addEventListener('input', (e) => {
  const c = e.target as HTMLInputElement;
  const s = actual();
  if (c.dataset.linkMapa !== undefined) {
    // Los links largos de Google Maps traen el lugar: «@lat,lng» o «!3dlat!4dlng».
    const m = c.value.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ?? c.value.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) cambio(`${s.id}:mapa`, () => ((s.lat = Number(m[1])), (s.lng = Number(m[2]))), true);
    return;
  }
  if (c.dataset.num !== undefined && c.dataset.f) {
    const n = Number(c.value.replace(',', '.'));
    cambio(`${s.id}:${c.dataset.f}`, () => ((s as any)[c.dataset.f!] = c.value.trim() === '' || !Number.isFinite(n) ? null : n));
  } else if (c.dataset.lk !== undefined && c.dataset.lf && c.dataset.lf !== 'foto') cambio(`${s.id}:l${c.dataset.lk}${c.dataset.lf}`, () => ((s.looks![Number(c.dataset.lk)] as any)[c.dataset.lf!] = c.value.trim()));
  else if (c.dataset.f) cambio(`${s.id}:${c.dataset.f}`, () => ((s as any)[c.dataset.f!] = c.value.trim()));
  else if (c.dataset.ci !== undefined) cambio(`${s.id}:c${c.dataset.ci}${c.dataset.cf}`, () => (s.items![Number(c.dataset.ci)][c.dataset.cf as 'titulo' | 'texto'] = c.value.trim()));
  else if (c.name === 'titulo') cambio(`${s.id}:titulo`, () => (s.titulo = c.value.trim()));
  else if (c.name === 'parrafo') cambio(`${s.id}:parrafo`, () => (s.parrafo = c.value.trim()));
  else if (c.dataset.tituloPortada !== undefined) {
    cambio(`${s.id}:t:${c.dataset.tituloPortada}`, () => {
      s.titulos = { ...s.titulos };
      if (c.value.trim()) s.titulos[c.dataset.tituloPortada!] = c.value.trim();
      else delete s.titulos[c.dataset.tituloPortada!];
    });
  }
});
campos.addEventListener('change', (e) => {
  const c = e.target as HTMLInputElement | HTMLSelectElement;
  const s = actual();
  if (c.name === 'zoomMapa') cambio(`${s.id}:zoom`, () => (s.zoom = Number(c.value)));
  else if (c.name === 'dispositivo') cambio(`${s.id}:disp`, () => (s.dispositivo = c.value as 'todos' | 'escritorio' | 'celular'));
  else if (c.name === 'categoriaBanda') cambio(`${s.id}:catb`, () => (s.categoria = c.value), true);
  else if (c.dataset.f === 'enlace2') cambio(`${s.id}:enlace2`, () => (s.enlace2 = c.value.trim()));
  else if (c.dataset.lk !== undefined && c.dataset.lf === 'foto') void subirFotoLook(s, Number(c.dataset.lk), (c as HTMLInputElement).files?.[0]);
  else if (c.dataset.lk !== undefined && c.dataset.lf === 'enlace') cambio(`${s.id}:l${c.dataset.lk}enlace`, () => (s.looks![Number(c.dataset.lk)].enlace = c.value.trim()));
  else if (c.dataset.f === 'enlace') cambio(`${s.id}:enlace`, () => (s.enlace = c.value.trim()));
  else if (c.name === 'foto') void subirFoto(s, (c as HTMLInputElement).files?.[0]);
  else if (c.name === 'tono') cambio(`${s.id}:tono`, () => (s.tono = c.value === 'claro' ? 'claro' : 'oscuro'));
  else if (c.name === 'columnas') cambio(`${s.id}:col`, () => (s.columnas = Number(c.value)));
  else if (c.name === 'conFoto') cambio(`${s.id}:foto`, () => (s.conFoto = (c as HTMLInputElement).checked));
  else if (c.name === 'verTodos') cambio(`${s.id}:vt`, () => (s.verTodos = (c as HTMLInputElement).checked));
  else if (c.name === 'cantidad') cambio(`${s.id}:cant`, () => (s.cantidad = Number(c.value)));
  else if (c.name === 'fuente')
    cambio(`${s.id}:fuente`, () => {
      const tipo = c.value;
      s.fuente = (tipo === 'coleccion' ? { tipo, slug: opciones.colecciones[0]?.slug ?? '' } : tipo === 'categoria' ? { tipo, slug: opciones.categorias[0]?.slug ?? '' } : tipo === 'seleccion' ? { tipo, ids: [] } : { tipo }) as Fuente;
    }, true);
  else if (c.name === 'coleccion' || c.name === 'categoriaFuente') cambio(`${s.id}:slug`, () => (s.fuente = { tipo: s.fuente!.tipo, slug: c.value } as Fuente), true);
  else if (c.name === 'agregarCategoria' && c.value) cambio('agregar-cat', () => (s.categorias = [...(s.categorias ?? []), c.value]), true);
  else if (c.name === 'agregarProducto' && c.value && s.fuente?.tipo === 'seleccion' && s.fuente.ids.length < 24) {
    const f = s.fuente;
    cambio('agregar-prod', () => (f.ids = [...f.ids, Number(c.value)]), true);
  }
});
campos.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  const s = actual();
  if (b.dataset.quitarChip !== undefined) {
    const v = b.dataset.quitarChip;
    if (s.tipo === 'categorias') cambio('quitar-cat', () => (s.categorias = s.categorias!.filter((x) => x !== v)), true);
    else if (s.fuente?.tipo === 'seleccion') {
      const f = s.fuente;
      cambio('quitar-prod', () => (f.ids = f.ids.filter((x) => String(x) !== v)), true);
    }
    } else if (b.hasAttribute('data-todas')) cambio('todas', () => ((s.categorias = []), (s.titulos = {})), true);
  else if (b.dataset.renombrar !== undefined) renombrarCategoria(b.dataset.renombrar);
  else if (b.hasAttribute('data-quitar-foto')) cambio(`${s.id}:foto`, () => (s.imagen = ''), true);
  else if (b.hasAttribute('data-col-mas')) cambio('col+', () => s.items!.push({ titulo: '', texto: '' }), true);
  else if (b.hasAttribute('data-col-menos')) cambio('col-', () => s.items!.pop(), true);
});

// Foto de una sección: se achica y convierte a WebP en el navegador, y se guarda su clave en la sección.
async function subirFoto(s: Seccion, archivo?: File) {
  if (!archivo) return;
  archivo = await recortar(archivo);
  if (!archivo) return;
  try {
    avisar('Subiendo foto…');
    const datos = new FormData();
    datos.set('foto', await aWebp(archivo, 1920), 'foto.webp');
    datos.set('mediano', await aWebp(archivo, 1080), 'mediano.webp');
    const r = await fetch('/api/admin/portada/imagen', { method: 'POST', body: datos });
    if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No se pudo subir la foto.');
    const { clave } = (await r.json()) as { clave: string };
    cambio(`${s.id}:foto`, () => (s.imagen = clave), true);
  } catch (e) {
    avisar(e instanceof Error ? e.message : 'No se pudo subir la foto.', true);
  }
}

// Hero: cada look tiene su foto, descripción, categoría y enlace; se agregan o quitan hasta 3.
const hacerLook = (): Look => ({ imagen: '', descripcion: '', categoria: '', enlace: '' });
async function subirFotoLook(s: Seccion, i: number, archivo?: File) {
  if (!archivo) return;
  archivo = await recortar(archivo);
  if (!archivo) return;
  try {
    avisar('Subiendo foto…');
    const datos = new FormData();
    datos.set('foto', await aWebp(archivo, 1920), 'foto.webp');
    datos.set('mediano', await aWebp(archivo, 1080), 'mediano.webp');
    const r = await fetch('/api/admin/portada/imagen', { method: 'POST', body: datos });
    if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No se pudo subir la foto.');
    const { clave } = (await r.json()) as { clave: string };
    cambio(`${s.id}:look${i}:foto`, () => (s.looks![i].imagen = clave), true);
  } catch (e) {
    avisar(e instanceof Error ? e.message : 'No se pudo subir la foto.', true);
  }
}
campos.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  const s = actual();
  if (!b || s?.tipo !== 'hero') return;
  if (b.hasAttribute('data-look-mas')) cambio('look+', () => s.looks!.push(hacerLook()), true);
  else if (b.hasAttribute('data-look-menos')) cambio('look-', () => s.looks!.pop(), true);
});

// Cambiar el nombre real de una categoría (se ve en todo el sitio: menú, listados y filtros).
async function renombrarCategoria(slug: string) {
  const c = opciones.categorias.find((x) => x.slug === slug);
  if (!c) return;
  const nuevo = (await pedirTexto(`Nuevo nombre de «${c.nombre}».\n\nOjo: cambia el nombre en toda la tienda (menú, listados y filtros). Si solo querés otro título en la portada, usá el campo «Título en la portada».`, c.nombre))?.trim();
  if (!nuevo || nuevo === c.nombre) return;
  const r = await fetch(`/api/admin/categorias/${c.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nombre: nuevo }) });
  if (!r.ok) return avisar(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No se pudo cambiar el nombre.', true);
  c.nombre = nuevo;
  avisar('Nombre cambiado en toda la tienda.');
  dibujarPanel();
  recargarVista();
}

// ───────────── Banners (se guardan al instante, no esperan al borrador) ─────────────
type Banner = { id: number; clave: string; claveMovil: string | null; textoAlternativo: string | null; enlace: string | null; orden: number; activo: number; desde: string | null; hasta: string | null };
let banners: Banner[] | null = null;
const aCampoFecha = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 3 * 3_600_000).toISOString().slice(0, 16) : '');
const deCampoFecha = (v: string) => (v ? new Date(`${v}:00-03:00`).toISOString() : null);
const enlacesPosibles = () => [
  ['', 'Sin enlace'],
  ['/productos', 'Todos los productos'],
  ['/ofertas', 'Ofertas'],
  ...opciones.categorias.map((c) => [`/categoria/${c.slug}`, `Categoría: ${c.padre ? `${c.padre} › ${c.nombre}` : c.nombre}`]),
  ...opciones.colecciones.map((c) => [`/coleccion/${c.slug}`, `Colección: ${c.nombre}`]),
];
// Selector con buscador; se puede escribir una ruta propia (data-libre).
const selectorEnlace = (nombre: string, actual: string | null, atributo = 'data-b="enlace"') => {
  const lista = enlacesPosibles();
  if (actual && !lista.some(([v]) => v === actual)) lista.push([actual, actual]);
  return `<select name="${nombre}" ${atributo} data-combo data-libre class="campo">${lista.map(([v, t]) => opcion(v, t, v === (actual ?? ''))).join('')}</select>`;
};
async function cargarBanners() {
  const r = await fetch('/api/admin/banners');
  banners = r.ok ? ((await r.json()) as Banner[]) : [];
}
async function mostrarBanners() {
  if (!banners) {
    campos.innerHTML = '<p class="text-theme-sm text-gray-500">Cargando banners…</p>';
    await cargarBanners();
    if (actual()?.tipo !== 'carrusel') return;
  }
  const tarjeta = (b: Banner) => `<article data-id="${b.id}" data-banner="${b.id}" class="space-y-3 rounded-xl border border-gray-200 p-3 ${b.activo ? '' : 'opacity-70'}">
    <div class="flex items-start gap-3"><img src="/api/imagenes/${b.clave}" alt="" class="aspect-[16/6] w-32 rounded-lg bg-gray-100 object-cover" />
    <div class="ml-auto flex">${asaHtml('banner', 'size-8')}<button type="button" data-b-borrar class="btn-icono hover:bg-error-50 hover:text-error-600 size-8" title="Borrar" aria-label="Borrar banner">${icono.x}</button></div></div>
    ${campo('Adónde lleva', selectorEnlace('enlace', b.enlace))}
    ${campo('Descripción de la imagen', `<input data-b="textoAlternativo" value="${esc(b.textoAlternativo ?? '')}" maxlength="200" class="campo" />`)}
    <div data-rango="fechahora" data-opcional data-etiqueta="Vigencia" class="grid grid-cols-2 gap-2">${campo('Desde', `<input type="datetime-local" data-b="desde" value="${aCampoFecha(b.desde)}" class="campo" />`)}${campo('Hasta', `<input type="datetime-local" data-b="hasta" value="${aCampoFecha(b.hasta)}" class="campo" />`)}</div>
    <label class="flex cursor-pointer items-center gap-2 text-sm text-gray-700 select-none"><input type="checkbox" data-b="activo" ${b.activo ? 'checked' : ''} class="text-brand-500 size-4 rounded border-gray-300" />Se muestra</label>
  </article>`;
  campos.innerHTML = `<p class="text-theme-xs text-gray-500">Los banners se guardan y se ven en la tienda apenas los cambiás: no esperan al botón Publicar.</p>
    ${banners!.length ? `<div data-banners class="space-y-3">${banners!.map(tarjeta).join('')}</div>` : '<p class="text-theme-sm text-gray-500">Todavía no hay banners.</p>'}
    <form data-nuevo-banner class="space-y-3 rounded-xl border border-dashed border-gray-300 p-3">
      <p class="text-sm font-medium text-gray-800">Nuevo banner</p>
      ${campo('Imagen para computadora', '<input type="file" name="escritorio" accept="image/*" required class="text-theme-xs block w-full text-gray-500" />')}
      ${campo('Imagen para celular (opcional)', '<input type="file" name="movil" accept="image/*" class="text-theme-xs block w-full text-gray-500" />')}
      ${campo('Adónde lleva', selectorEnlace('enlaceNuevo', null))}
      ${campo('Descripción de la imagen', '<input name="textoAlternativo" maxlength="200" class="campo" />')}
      <button class="btn btn-primario">Subir banner</button>
    </form>`;
  for (const sel of campos.querySelectorAll<HTMLSelectElement>('select[data-combo]')) mejorar(sel);
  iniciarRangos(campos);
  const lista = campos.querySelector<HTMLElement>('[data-banners]');
  if (lista)
    ordenable(lista, {
      asa: '[data-asa]',
      guardar: async (ids) => {
        try {
          await Promise.all(ids.map((x, orden) => (banners!.find((y) => y.id === x)!.orden === orden ? null : pedirBanner('PATCH', x, { orden }))));
          await cargarBanners();
          mostrarBanners();
          recargarVista();
        } catch (err) {
          avisar(err instanceof Error ? err.message : 'No se pudo guardar el banner.', true);
        }
      },
    });
}
async function pedirBanner(metodo: string, id: number, cuerpo?: unknown) {
  const r = await fetch(`/api/admin/banners/${id}`, { method: metodo, headers: { 'content-type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No se pudo guardar el banner.');
}
const idBanner = (el: Element) => Number(el.closest<HTMLElement>('[data-banner]')?.dataset.banner);
campos.addEventListener('change', async (e) => {
  const c = e.target as HTMLInputElement | HTMLSelectElement;
  const campoB = c.dataset.b;
  if (!campoB || !c.closest('[data-banner]')) return;
  const cambio = campoB === 'activo' ? { activo: (c as HTMLInputElement).checked } : campoB === 'desde' || campoB === 'hasta' ? { [campoB]: deCampoFecha(c.value) } : { [campoB]: c.value.trim() || null };
  try {
    avisar('Guardando banner…');
    await pedirBanner('PATCH', idBanner(c), cambio);
    await cargarBanners();
    avisar('Banner guardado');
    recargarVista();
    if (campoB === 'activo') mostrarBanners();
  } catch (err) {
    avisar(err instanceof Error ? err.message : 'No se pudo guardar el banner.', true);
  }
});
campos.addEventListener('click', async (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b || !b.closest('[data-banner]')) return;
  const id = idBanner(b);
  try {
    if (b.hasAttribute('data-b-borrar')) {
      if (!await confirmar('¿Borrar este banner? Se saca de la tienda.')) return;
      await pedirBanner('DELETE', id);
    } else return;
    await cargarBanners();
    mostrarBanners();
    recargarVista();
  } catch (err) {
    avisar(err instanceof Error ? err.message : 'No se pudo guardar el banner.', true);
  }
});
campos.addEventListener('submit', async (e) => {
  const f = (e.target as HTMLElement).closest<HTMLFormElement>('form[data-nuevo-banner]');
  if (!f) return;
  e.preventDefault();
  const boton = f.querySelector<HTMLButtonElement>('button')!;
  try {
    boton.disabled = true;
    const escritorio = await recortar(f.escritorio.files[0]);
    const movilOriginal = f.movil.files[0];
    const movil = movilOriginal && (await recortar(movilOriginal));
    if (!escritorio || (movilOriginal && !movil)) return void (boton.disabled = false);
    avisar('Subiendo banner…');
    const datos = new FormData();
    datos.set('escritorio', await aWebp(escritorio, 1920), 'escritorio.webp');
    if (movil) datos.set('movil', await aWebp(movil, 900), 'movil.webp');
    if (f.enlaceNuevo.value.trim()) datos.set('enlace', f.enlaceNuevo.value.trim());
    if (f.textoAlternativo.value.trim()) datos.set('textoAlternativo', f.textoAlternativo.value.trim());
    const r = await fetch('/api/admin/banners', { method: 'POST', body: datos });
    if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No se pudo subir el banner.');
    await cargarBanners();
    mostrarBanners();
    recargarVista();
    avisar('Banner subido');
  } catch (err) {
    avisar(err instanceof Error ? err.message : 'No se pudo subir el banner.', true);
    boton.disabled = false;
  }
});

// ───────────── Publicar y descartar ─────────────
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
  if (!await confirmar('¿Publicar esta portada? Se ve en la tienda apenas la publiques.')) return;
  await conAviso(async () => {
    await guardar();
    await pedir('POST', '/publicar');
    location.reload();
  }, 'Portada publicada.')();
});
q('[data-descartar]').addEventListener('click', async () => {
  if (!await confirmar('¿Descartar los cambios sin publicar? Vuelve a la portada publicada.')) return;
  await conAviso(async () => {
    await pedir('DELETE', '/borrador');
    location.reload();
  }, 'Cambios descartados.')();
});
addEventListener('beforeunload', (e) => pendiente && (e.preventDefault(), (e.returnValue = '')));

dibujarLista();
estados();
ajustar();
