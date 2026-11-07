import { confirmar, pedirTexto } from './dialogo-panel';
// Carga rápida de productos: una fila por producto (nombre, categoría, marca, precio, peso, fotos) y, al abrirla,
// materiales y variantes con los mismos selectores con buscador de la edición de productos (talle, color y stock).
// Todo vive en el navegador: el borrador se guarda solo en IndexedDB (con las fotos ya achicadas) y recién se manda
// al servidor al tocar «Publicar productos» (lote único: o se crean todos o ninguno), después se suben las fotos.
import { mejorar } from './combo';
import { ordenable } from './ordenable';
import { etiquetaMaterial } from './materiales';
import { formatearPesos } from './pesos';
import { aWebp } from './webp';

type Op = { id: number; nombre: string; hex?: string | null; corto?: string; padreId?: number | null };
type Foto = { id: string; subida?: boolean };
type Variante = { id: string; talleId: number | null; colorId: number | null; stock: string };
type Fila = {
  id: string;
  abierta: boolean;
  nombre: string;
  categoriaId: number | null;
  marcaId: number | null;
  precio: string;
  peso: string;
  materialIds: number[];
  coleccionIds: number[];
  fotos: Foto[];
  variantes: Variante[];
  fotosColor: Record<number, Foto[]>;
  servidor?: { id: number; slug: string };
};
type Estado = { v: 2; filas: Fila[]; publicarYa: boolean; guardado: string };

const D = JSON.parse(document.querySelector('#datos-carga')!.textContent!) as { categorias: Op[]; marcas: Op[]; talles: Op[]; colores: Op[]; materiales: Op[]; colecciones: Op[] };
const q = <T extends HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s)!;
const contenedor = q('[data-filas]');
const MAX_FOTOS = 10;

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const uid = () => crypto.randomUUID();
const porId = (lista: Op[], id: number | null) => lista.find((o) => o.id === id);

// ───────────── IndexedDB: borrador y fotos ─────────────
let bd: IDBDatabase | null = null;
const abrir = () =>
  new Promise<IDBDatabase | null>((listo) => {
    try {
      const r = indexedDB.open('sukha-carga-rapida', 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('estado');
        r.result.createObjectStore('fotos');
      };
      r.onsuccess = () => listo(r.result);
      r.onerror = () => listo(null);
    } catch {
      listo(null);
    }
  });
const idb = <T>(tienda: string, modo: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) =>
  new Promise<T | undefined>((listo) => {
    if (!bd) return listo(undefined);
    try {
      const r = f(bd.transaction(tienda, modo).objectStore(tienda));
      r.onsuccess = () => listo(r.result);
      r.onerror = () => listo(undefined);
    } catch {
      listo(undefined);
    }
  });

// `original`: la foto sin recortar (hasta 2000 px); falta en lo guardado por versiones anteriores.
type Blobs = { chico: Blob; mediano: Blob; grande: Blob; original?: Blob };
const miniaturas = new Map<string, string>();
const fotoGuardada = (id: string) => idb<Blobs>('fotos', 'readonly', (s) => s.get(id));
async function cargarMiniatura(id: string) {
  if (miniaturas.has(id)) return;
  const b = await fotoGuardada(id);
  if (b) miniaturas.set(id, URL.createObjectURL(b.chico));
}

// ───────────── Estado, historial y autoguardado ─────────────
let estado: Estado = { v: 2, filas: [], publicarYa: false, guardado: '' };
const historial: string[] = [];
let ultimoCambio = 0;
let temporizador: ReturnType<typeof setTimeout> | undefined;
let revisar = false;
let soloIncompletos = false;
let ocupado = false;
// Fotos preparándose y guardados del borrador en curso: mientras haya, no se puede publicar ni sumar otro producto.
let preparando = 0;
let guardando = false;
// Mientras hay un borrador anterior sin resolver (continuar o descartar), no se lo pisa con la fila vacía.
let bloqueado = false;

const filaNueva = (): Fila => ({ id: uid(), abierta: true, nombre: '', categoriaId: null, marcaId: null, precio: '', peso: '', materialIds: [], coleccionIds: [], fotos: [], variantes: [], fotosColor: {} });
const fotosDe = (f: Fila) => [...f.fotos, ...Object.values(f.fotosColor).flat()];
const contenido = (f: Fila) => Boolean(f.nombre || f.precio || f.categoriaId || f.marcaId || f.fotos.length || f.variantes.length || f.servidor);
const coloresDe = (f: Fila) => [...new Set(f.variantes.map((v) => v.colorId).filter((c): c is number => c !== null))];

async function guardarYa() {
  clearTimeout(temporizador);
  try {
    if (bloqueado) return;
    estado.guardado = new Date().toISOString();
    await idb('estado', 'readwrite', (s) => s.put(JSON.stringify(estado), 'borrador'));
    // Las fotos que ya no usa ninguna fila (ni el historial de deshacer) se borran del navegador.
    const todo = JSON.stringify(estado) + historial.join('');
    const guardadas = ((await idb<IDBValidKey[]>('fotos', 'readonly', (s) => s.getAllKeys())) ?? []) as string[];
    for (const id of guardadas.filter((k) => !todo.includes(k))) await idb('fotos', 'readwrite', (s) => s.delete(id));
    q('[data-guardado]').textContent = bd ? 'Guardado en este navegador' : 'Este navegador no puede guardar el borrador';
  } finally {
    guardando = false;
    actualizarBotones();
  }
}
const programarGuardado = () => {
  clearTimeout(temporizador);
  guardando = true;
  actualizarBotones();
  temporizador = setTimeout(guardarYa, 500);
};
function cambio(f: () => void, estructural = false) {
  const ahora = Date.now();
  if (estructural || ahora - ultimoCambio > 1500) {
    historial.push(JSON.stringify(estado.filas));
    if (historial.length > 50) historial.shift();
  }
  ultimoCambio = estructural ? 0 : ahora;
  f();
  q<HTMLButtonElement>('[data-deshacer]').disabled = false;
  actualizarResumen();
  programarGuardado();
}

// ───────────── Validación ─────────────
const aCentavos = (t: string) => {
  const s = t.trim().replace(/[\s$]/g, '');
  if (!s) return null;
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : /^\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, '')) : Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};
const stockDe = (v: Variante) => {
  const n = Number(v.stock || 0);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};

type Problema = { campo: string; texto: string; corto: string; grave: boolean };
function problemas(f: Fila): Problema[] {
  const p: Problema[] = [];
  // Una tarjeta vacía no se crea ni se marca en rojo.
  if (f.servidor || !contenido(f)) return p;
  if (!f.nombre.trim()) p.push({ campo: 'nombre', texto: 'Falta el nombre.', corto: 'el nombre', grave: true });
  if (!f.categoriaId) p.push({ campo: 'categoria', texto: 'Falta la categoría.', corto: 'la categoría', grave: true });
  if (!f.marcaId) p.push({ campo: 'marca', texto: 'Falta la marca.', corto: 'la marca', grave: true });
  if (!aCentavos(f.precio)) p.push({ campo: 'precio', texto: 'Falta el precio.', corto: 'el precio', grave: true });
  if (f.peso.trim() && !(Number.isInteger(Number(f.peso)) && Number(f.peso) > 0)) p.push({ campo: 'peso', texto: 'El peso va en gramos, con un número entero.', corto: 'revisar el peso', grave: true });
  if (!f.variantes.length) p.push({ campo: 'variantes', texto: 'Agregá al menos una variante.', corto: 'una variante', grave: true });
  if (f.variantes.some((v) => Number.isNaN(stockDe(v)))) p.push({ campo: 'variantes', texto: 'El stock tiene que ser un número entero, 0 o más.', corto: 'revisar el stock', grave: true });
  if (!f.fotos.length) p.push({ campo: 'fotos', texto: 'No tiene fotos.', corto: 'una foto', grave: estado.publicarYa });
  if (estado.publicarYa && f.variantes.length && f.variantes.every((v) => !(stockDe(v) > 0))) p.push({ campo: 'variantes', texto: 'Sin stock no se puede mostrar en la tienda.', corto: 'stock', grave: true });
  return p;
}

// ───────────── Dibujo ─────────────
// Cada producto es una tarjeta: arriba lo que lo identifica (foto, nombre, estado); adentro tres secciones con título:
// Datos, Fotos y Variantes (como la edición de productos, con los mismos selectores con buscador).
const selector = (attrs: string, lista: Op[], elegido: number | null, vacio: string | null, crear: string, rojo = false) =>
  `<select ${attrs} data-crear="${crear}" class="campo${rojo ? ' border-error-500' : ''}">${vacio === null ? '<option value="" disabled selected></option>' : `<option value="">${esc(vacio)}</option>`}${lista.map((o) => `<option value="${o.id}" ${o.hex ? `data-hex="${esc(o.hex)}"` : ''} ${o.id === elegido ? 'selected' : ''}>${esc(o.corto ?? o.nombre)}</option>`).join('')}</select>`;
// Categoría en dos pasos: primero la principal y, si tiene subcategorías, la subcategoría (la fila guarda la más específica).
const padreDe = (f: Fila) => {
  const c = porId(D.categorias, f.categoriaId);
  return c ? (c.padreId ?? c.id) : null;
};
const hijasDe = (f: Fila) => D.categorias.filter((c) => c.padreId && c.padreId === padreDe(f));
const svg = (d: string, clase = 'size-5') => `<svg class="${clase}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONOS = {
  borrar: '<path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/>',
  flecha: '<path d="m6 9 6 6 6-6"/>',
  copiar: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  foto: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
};
const punto = (c?: Op) => (c ? `<span class="size-4 shrink-0 rounded-full border border-gray-200" style="background:${esc(c.hex ?? 'transparent')}" aria-hidden="true"></span>` : '');
const seccion = (titulo: string, cuerpo: string) => `<section class="space-y-4"><h3 class="text-base font-semibold text-gray-900">${titulo}</h3>${cuerpo}</section>`;
const campo = (etiqueta: string, control: string) => `<div><span class="etiqueta">${etiqueta}</span>${control}</div>`;

const miniatura = (foto: Foto, destino: string, bloqueada: boolean, tam = 'size-20', principal = false) =>
  `<span data-id="${foto.id}" class="relative inline-block${bloqueada ? '' : ' cursor-grab'}"><img src="${miniaturas.get(foto.id) ?? ''}" alt="" class="${tam} rounded-xl border border-gray-200 object-cover" />${principal ? '<span class="absolute bottom-1 left-1 rounded-full bg-gray-900/80 px-1.5 text-[11px] font-medium text-white">Principal</span>' : ''}${bloqueada ? '' : `<button type="button" data-accion="foto-quitar" data-foto="${foto.id}" data-destino="${destino}" class="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-gray-800 text-white hover:bg-gray-900" title="Quitar foto" aria-label="Quitar foto">×</button>`}</span>`;
const botonFoto = (destino: string, tam: string, texto: string) =>
  `<label class="hover:border-brand-300 hover:bg-brand-25 hover:text-brand-600 flex ${tam} shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 transition" title="Elegí fotos o soltalas acá">${svg(ICONOS.mas)}${texto ? `<span class="text-xs font-medium">${texto}</span>` : ''}<input type="file" accept="image/*" multiple data-foto-para="${destino}" class="sr-only" /></label>`;

// Estado de la tarjeta, como insignia: completo, lo que falta, o ya creado.
function insignia(f: Fila, ps: Problema[]) {
  const estilo = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap';
  if (f.servidor) return `<span class="${estilo} bg-success-50 text-success-700">Creado</span>`;
  const graves = ps.filter((p) => p.grave);
  if (!contenido(f)) return `<span class="${estilo} bg-gray-100 text-gray-600">Nuevo</span>`;
  if (!graves.length) return `<span class="${estilo} bg-success-50 text-success-700">Listo</span>`;
  return `<span class="${estilo} bg-warning-50 text-warning-700">Falta ${graves.length === 1 ? graves[0].corto : `${graves.length} datos`}</span>`;
}

function htmlFila(f: Fila) {
  const ps = problemas(f);
  const rojo = (c: string) => revisar && ps.some((p) => p.campo === c && p.grave);
  const bloqueada = !!f.servidor;
  const stockTotal = f.variantes.reduce((s, v) => s + (stockDe(v) || 0), 0);
  const portada = f.fotos[0];
  const resumen = [porId(D.categorias, f.categoriaId)?.nombre, porId(D.marcas, f.marcaId)?.nombre, aCentavos(f.precio) ? `$ ${(aCentavos(f.precio)! / 100).toLocaleString('es-AR')}` : '', f.variantes.length ? `${f.variantes.length} ${f.variantes.length === 1 ? 'variante' : 'variantes'} · ${stockTotal} u.` : '']
    .filter(Boolean)
    .join(' · ');

  const cabecera = `<header class="flex items-center gap-3 p-4">
    <button type="button" data-accion="abrir" aria-expanded="${f.abierta}" class="group flex min-w-0 flex-1 items-center gap-3 text-left" title="${f.abierta ? 'Cerrar' : 'Abrir'}">
      ${portada ? `<img src="${miniaturas.get(portada.id) ?? ''}" alt="" class="size-12 shrink-0 rounded-lg border border-gray-200 object-cover" />` : `<span class="flex size-12 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400">${svg(ICONOS.foto)}</span>`}
      <span class="min-w-0 flex-1">
        <span class="block truncate text-base font-semibold ${f.nombre ? 'text-gray-900' : 'text-gray-400'}">${esc(f.nombre || 'Producto sin nombre')}</span>
        ${resumen ? `<span class="block truncate text-sm text-gray-500">${esc(resumen)}</span>` : ''}
      </span>
      ${insignia(f, ps)}
      <span class="text-gray-400 transition group-aria-expanded:rotate-180">${svg(ICONOS.flecha)}</span>
    </button>
    ${bloqueada ? '' : `<span class="flex shrink-0 gap-1 border-l border-gray-100 pl-2"><button type="button" data-accion="duplicar" class="btn-icono" title="Duplicar" aria-label="Duplicar producto">${svg(ICONOS.copiar, 'size-4')}</button><button type="button" data-accion="borrar" class="btn-icono hover:bg-error-50 hover:text-error-600" title="Quitar" aria-label="Quitar producto">${svg(ICONOS.borrar, 'size-4')}</button></span>`}
  </header>`;
  if (!f.abierta) return articulo(f, ps, cabecera);

  const texto = (t: string) => `<p class="flex min-h-11 items-center text-sm text-gray-800">${esc(t || '—')}</p>`;
  const datos = seccion(
    'Datos',
    `${campo('Nombre', bloqueada ? texto(f.nombre) : `<input data-c="nombre" value="${esc(f.nombre)}" maxlength="120" class="campo${rojo('nombre') ? ' border-error-500' : ''}" />`)}
    <div class="grid gap-4 sm:grid-cols-2">
      ${campo('Categoría', bloqueada ? texto(porId(D.categorias, f.categoriaId)?.nombre ?? '') : selector('data-c="categoria" aria-label="Categoría"', D.categorias.filter((c) => !c.padreId), padreDe(f), null, '/api/admin/categorias', rojo('categoria')))}
      ${!bloqueada && hijasDe(f).length ? campo('Subcategoría (opcional)', selector('data-c="subcategoria" aria-label="Subcategoría"', hijasDe(f), f.categoriaId !== padreDe(f) ? f.categoriaId : null, 'Sin subcategoría', '')) : ''}
      ${campo('Marca', bloqueada ? texto(porId(D.marcas, f.marcaId)?.nombre ?? '') : selector('data-c="marca" aria-label="Marca"', D.marcas, f.marcaId, null, '/api/admin/marcas', rojo('marca')))}
      ${campo('Precio', bloqueada ? texto(f.precio) : `<div class="relative"><span class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-gray-500">$</span><input data-c="precio" data-pesos inputmode="decimal" value="${esc(f.precio)}" class="campo pl-8${rojo('precio') ? ' border-error-500' : ''}" /></div>`)}
      ${campo('Peso (g)', bloqueada ? texto(f.peso) : `<input data-c="peso" inputmode="numeric" value="${esc(f.peso)}" placeholder="Opcional" class="campo${rojo('peso') ? ' border-error-500' : ''}" />`)}
    </div>
    ${campo(
      'Materiales',
      `<div class="space-y-2">${f.materialIds.length ? `<div class="flex flex-wrap gap-2">${f.materialIds.map((id) => porId(D.materiales, id)).filter(Boolean).map((m) => (bloqueada ? `<span class="inline-flex min-h-9 items-center rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm">${esc(m!.nombre)}</span>` : etiquetaMaterial(String(m!.id), m!.nombre, 'm'))).join('')}</div>` : ''}${bloqueada ? '' : selector('data-agregar-material data-placeholder="Agregar material…" aria-label="Agregar material"', D.materiales, null, null, '/api/admin/materiales')}</div>`,
    )}
    ${campo(
      'Colecciones',
      `<div class="space-y-2">${f.coleccionIds.length ? `<div class="flex flex-wrap gap-2">${f.coleccionIds.map((id) => porId(D.colecciones, id)).filter(Boolean).map((m) => (bloqueada ? `<span class="inline-flex min-h-9 items-center rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm">${esc(m!.nombre)}</span>` : etiquetaMaterial(String(m!.id), m!.nombre, 'k').replace('data-quitar-chip', 'data-quitar-coleccion'))).join('')}</div>` : ''}${bloqueada ? '' : selector('data-agregar-coleccion data-placeholder="Agregar colección…" aria-label="Agregar colección"', D.colecciones, null, null, '/api/admin/colecciones')}</div>`,
    )}`,
  );
  const fotos = seccion(
    'Fotos',
    `<div data-zona="principal" class="flex flex-wrap gap-3">${f.fotos.map((x, i) => miniatura(x, 'principal', bloqueada, 'size-24', i === 0 && f.fotos.length > 1)).join('')}${bloqueada || f.fotos.length >= MAX_FOTOS ? '' : botonFoto('principal', 'size-24', 'Agregar')}</div>`,
  );

  // Variantes: tabla con la misma carga que la edición de productos; la última fila es para agregar.
  const fotoColor = (colorId: number | null) => {
    if (!colorId) return '<span class="text-sm text-gray-400">—</span>';
    const lista = f.fotosColor[colorId] ?? [];
    return `<div data-zona="${colorId}" class="flex items-center gap-2">${lista.map((x) => miniatura(x, String(colorId), bloqueada, 'size-12')).join('')}${bloqueada || lista.length >= MAX_FOTOS ? '' : botonFoto(String(colorId), 'size-12', '')}</div>`;
  };
  const filasVariantes = f.variantes
    .map((v) => {
      const color = porId(D.colores, v.colorId);
      return `<tr>
        <td class="td font-medium text-gray-800">${esc(porId(D.talles, v.talleId)?.nombre ?? '—')}</td>
        <td class="td"><span class="flex items-center gap-2 text-gray-800">${punto(color)}${esc(color?.nombre ?? '—')}</span></td>
        <td class="td">${bloqueada ? esc(v.stock || '0') : `<input data-stock="${v.id}" inputmode="numeric" value="${esc(v.stock)}" placeholder="0" aria-label="Stock" class="campo h-10 w-24${Number.isNaN(stockDe(v)) && revisar ? ' border-error-500' : ''}" />`}</td>
        <td class="td">${fotoColor(v.colorId)}</td>
        <td class="td text-right">${bloqueada ? '' : `<button type="button" data-accion="quitar-variante" data-variante="${v.id}" class="btn-icono hover:bg-error-50 hover:text-error-600" title="Quitar variante" aria-label="Quitar variante">${svg(ICONOS.borrar, 'size-4')}</button>`}</td>
      </tr>`;
    })
    .join('');
  const filaNuevaVariante = bloqueada
    ? ''
    : // Fuera de la tabla (que se desplaza de costado en el celular), para que la lista de talles y colores se vea entera.
      `<div data-nueva-variante class="flex flex-wrap items-end gap-3 rounded-xl border ${rojo('variantes') ? 'border-error-300' : 'border-gray-200'} bg-gray-50 p-3">
        <label class="block min-w-36 flex-1"><span class="etiqueta">Talle</span>${selector('data-nv="talle"', D.talles, null, 'Sin talle', '/api/admin/talles')}</label>
        <label class="block min-w-36 flex-1"><span class="etiqueta">Color</span>${selector('data-nv="color"', D.colores, null, 'Sin color', '/api/admin/colores')}</label>
        <label class="block w-24"><span class="etiqueta">Stock</span><input data-nv="stock" inputmode="numeric" value="" placeholder="0" class="campo" /></label>
        <button type="button" data-accion="agregar-variante" class="btn btn-secundario">${svg(ICONOS.mas, 'size-4')}Agregar variante</button>
      </div>`;
  const variantes = seccion(
    `Variantes${f.variantes.length ? ` <span class="ml-1 font-normal text-gray-500">${f.variantes.length} · ${stockTotal} u.</span>` : ''}`,
    `${
      f.variantes.length
        ? `<div class="relative overflow-x-auto rounded-xl border border-gray-200"><table class="min-w-full text-sm">
      <thead class="border-b border-gray-100 bg-gray-50"><tr><th class="th">Talle</th><th class="th">Color</th><th class="th">Stock</th><th class="th">Foto del color</th><th class="th"><span class="sr-only">Quitar</span></th></tr></thead>
      <tbody class="divide-y divide-gray-100">${filasVariantes}</tbody>
    </table></div>`
        : ''
    }${filaNuevaVariante}
    <p data-error-variante class="text-error-600 text-sm empty:hidden" role="status"></p>`,
  );

  const avisos = revisar && ps.length ? `<div class="${ps.some((p) => p.grave) ? 'bg-error-50 text-error-700' : 'bg-warning-50 text-warning-700'} rounded-xl px-4 py-3 text-sm"><ul class="list-disc space-y-0.5 pl-5">${ps.map((p) => `<li>${esc(p.texto)}</li>`).join('')}</ul></div>` : '';
  const cuerpo = `<div class="space-y-6 border-t border-gray-100 p-4 sm:p-6">${avisos}<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">${datos}${fotos}</div>${variantes}</div>`;
  return articulo(f, ps, cabecera + cuerpo);
}
const articulo = (f: Fila, ps: Problema[], interior: string) =>
  `<article data-fila="${f.id}" class="shadow-theme-xs rounded-2xl border ${revisar && ps.some((p) => p.grave) ? 'border-error-300' : f.abierta ? 'border-brand-200' : 'border-gray-200'} ${f.servidor ? 'bg-gray-50' : 'bg-white'}" ${soloIncompletos && !ps.some((p) => p.grave) ? 'hidden' : ''}>${interior}</article>`;

function dibujarFila(f: Fila) {
  const actual = contenedor.querySelector<HTMLElement>(`[data-fila="${f.id}"]`);
  const t = document.createElement('template');
  t.innerHTML = htmlFila(f).trim();
  const nueva = t.content.firstElementChild as HTMLElement;
  if (actual) actual.replaceWith(nueva);
  else contenedor.append(nueva);
  nueva.querySelectorAll<HTMLSelectElement>('select[data-crear]').forEach(mejorar);
  if (!f.servidor) nueva.querySelectorAll<HTMLElement>('[data-zona]').forEach((zona) => ordenable(zona, { asa: '[data-asa]', guardar: async () => reordenarFotos(f, zona) }));
}
// Las fotos se ordenan arrastrándolas, igual que en la edición de productos; la primera es la principal.
function reordenarFotos(f: Fila, zona: HTMLElement) {
  const lista = zona.dataset.zona === 'principal' ? f.fotos : f.fotosColor[Number(zona.dataset.zona)];
  const orden = [...zona.querySelectorAll<HTMLElement>('[data-id]')].map((e) => e.dataset.id);
  cambio(() => lista.sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id)), true);
  redibujar(f);
}
async function dibujarTodo() {
  await Promise.all(estado.filas.flatMap((f) => fotosDe(f).map((x) => cargarMiniatura(x.id))));
  contenedor.replaceChildren();
  for (const f of estado.filas) dibujarFila(f);
  q<HTMLInputElement>('[data-publicar-ya]').checked = estado.publicarYa;
  actualizarResumen();
}
// Publicar y «Agregar producto» quedan apagados mientras algo se está preparando o falta completar.
function actualizarBotones() {
  const activas = estado.filas.filter(contenido);
  const incompleto = activas.some((f) => problemas(f).some((p) => p.grave));
  const espera = ocupado || preparando > 0 || guardando;
  q<HTMLButtonElement>('[data-publicar]').disabled = espera || incompleto || !activas.length;
  q<HTMLButtonElement>('[data-agregar]').disabled = espera || incompleto;
}
function actualizarResumen() {
  actualizarBotones();
  const activas = estado.filas.filter(contenido);
  const pendientes = activas.filter((f) => !f.servidor).length;
  q('[data-publicar-texto]').textContent = estado.publicarYa ? 'Crear y mostrar' : 'Crear productos';
  if (!activas.length) return void (q('[data-resumen]').textContent = 'Sin productos todavía');
  const incompletas = activas.filter((f) => problemas(f).some((p) => p.grave)).length;
  q('[data-resumen]').textContent = `${activas.length} ${activas.length === 1 ? 'producto' : 'productos'}${incompletas ? ` · ${incompletas} sin terminar` : pendientes ? ' · listos' : ''}`;
}
const redibujar = (f: Fila) => (dibujarFila(f), actualizarResumen());
const decir = (t: string, error = false) => {
  const m = q('[data-mensaje]');
  m.textContent = t;
  m.className = `text-sm ${error ? 'text-error-600 font-medium' : 'text-gray-600'}`;
};

// Una opción creada con «+ Agregar» en cualquier selector se suma a la lista, así aparece en las demás filas.
function recordarOpcion(select: HTMLSelectElement, lista: Op[]) {
  const id = Number(select.value);
  if (id && !porId(lista, id)) lista.push({ id, nombre: select.selectedOptions[0].text });
  return id || null;
}

// ───────────── Fotos ─────────────
async function agregarFotos(f: Fila, destino: string, archivos: File[]) {
  const lista = destino === 'principal' ? f.fotos : (f.fotosColor[Number(destino)] ??= []);
  const nuevas: Foto[] = [];
  preparando++;
  actualizarBotones();
  for (const archivo of archivos.filter((a) => a.type.startsWith('image/')).slice(0, MAX_FOTOS - lista.length)) {
    decir('Preparando fotos…');
    try {
      const blobs: Blobs = { chico: await aWebp(archivo, 400), mediano: await aWebp(archivo, 900), grande: await aWebp(archivo, 1600), original: await aWebp(archivo, 2000) };
      const id = uid();
      await idb('fotos', 'readwrite', (s) => s.put(blobs, id));
      miniaturas.set(id, URL.createObjectURL(blobs.chico));
      nuevas.push({ id });
    } catch (e) {
      decir(e instanceof Error ? e.message : 'No se pudo preparar una foto.', true);
    }
  }
  preparando--;
  if (nuevas.length) {
    cambio(() => lista.push(...nuevas), true);
    decir('');
  }
  redibujar(f);
}

// ───────────── Eventos de la lista ─────────────
const filaDe = (el: Element) => estado.filas.find((f) => f.id === el.closest<HTMLElement>('[data-fila]')?.dataset.fila);

contenedor.addEventListener('input', (e) => {
  const c = e.target as HTMLInputElement;
  const f = filaDe(c);
  if (!f) return;
  if (c.dataset.c === 'precio') formatearPesos(c);
  if (c.dataset.c && ['nombre', 'precio', 'peso'].includes(c.dataset.c)) cambio(() => (f[c.dataset.c as 'nombre'] = c.value));
  else if (c.dataset.stock) {
    const v = f.variantes.find((x) => x.id === c.dataset.stock);
    if (v) cambio(() => (v.stock = c.value));
  } else return;
  actualizarMarcas(f);
});
// Mientras se escribe, se actualizan la cabecera de la tarjeta (nombre, resumen, estado) y las marcas de error,
// sin redibujar los campos (así no se pierde el foco).
function actualizarMarcas(f: Fila) {
  const art = contenedor.querySelector<HTMLElement>(`[data-fila="${f.id}"]`);
  if (!art) return;
  const t = document.createElement('template');
  t.innerHTML = htmlFila(f).trim();
  art.querySelector('header')?.replaceWith(t.content.querySelector('header')!);
  if (!revisar) return actualizarResumen();
  const ps = problemas(f);
  for (const campo of ['nombre', 'precio', 'peso']) art.querySelector(`[data-c="${campo}"]`)?.classList.toggle('border-error-500', ps.some((p) => p.campo === campo && p.grave));
  art.classList.toggle('border-error-300', ps.some((p) => p.grave));
  art.classList.toggle('border-gray-200', !ps.some((p) => p.grave));
  actualizarResumen();
}

contenedor.addEventListener('change', async (e) => {
  const c = e.target as HTMLInputElement & HTMLSelectElement;
  const f = filaDe(c);
  if (!f) return;
  if (c.dataset.c === 'subcategoria') {
    const padre = padreDe(f);
    cambio(() => (f.categoriaId = Number(c.value) || padre));
    redibujar(f);
  } else if (c.dataset.c === 'categoria' || c.dataset.c === 'marca') {
    const esMarca = c.dataset.c === 'marca';
    const id = recordarOpcion(c, esMarca ? D.marcas : D.categorias);
    cambio(() => (esMarca ? (f.marcaId = id) : (f.categoriaId = id)));
    if (revisar || !esMarca) redibujar(f);
    else actualizarMarcas(f);
  } else if ('agregarColeccion' in c.dataset) {
    const id = recordarOpcion(c, D.colecciones);
    if (id && !f.coleccionIds.includes(id)) cambio(() => f.coleccionIds.push(id), true);
    redibujar(f);
  } else if ('agregarMaterial' in c.dataset) {
    const id = recordarOpcion(c, D.materiales);
    if (id && !f.materialIds.includes(id)) cambio(() => f.materialIds.push(id), true);
    redibujar(f);
  } else if (c.dataset.nv === 'talle' || c.dataset.nv === 'color') {
    recordarOpcion(c, c.dataset.nv === 'talle' ? D.talles : D.colores);
  } else if (c.dataset.fotoPara) {
    const archivos = [...(c.files ?? [])];
    c.value = '';
    await agregarFotos(f, c.dataset.fotoPara, archivos);
  }
});

function agregarVariante(f: Fila, caja: HTMLElement) {
  const talleId = Number(q<HTMLSelectElement>('[data-nv="talle"]', caja).value) || null;
  const colorId = Number(q<HTMLSelectElement>('[data-nv="color"]', caja).value) || null;
  const stock = q<HTMLInputElement>('[data-nv="stock"]', caja).value.trim();
  const error = q('[data-error-variante]', caja.closest('article')!);
  if (f.variantes.some((v) => v.talleId === talleId && v.colorId === colorId)) return void (error.textContent = 'Esa combinación de talle y color ya está.');
  if (Number.isNaN(stockDe({ id: '', talleId, colorId, stock }))) return void (error.textContent = 'El stock tiene que ser un número entero, 0 o más.');
  cambio(() => f.variantes.push({ id: uid(), talleId, colorId, stock }), true);
  redibujar(f);
  // Queda listo para cargar la siguiente: el foco vuelve al talle.
  contenedor.querySelector<HTMLInputElement>(`[data-fila="${f.id}"] [data-nueva-variante] input[role=combobox]`)?.focus();
}

contenedor.addEventListener('click', async (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-accion], [data-quitar-chip], [data-quitar-coleccion]');
  const f = b && filaDe(b);
  if (!b || !f) return;
  const accion = b.dataset.accion;
  if (b.hasAttribute('data-quitar-coleccion')) {
    const id = Number(b.closest<HTMLElement>('[data-chip]')!.dataset.chip);
    cambio(() => (f.coleccionIds = f.coleccionIds.filter((m) => m !== id)), true);
    redibujar(f);
  } else if (b.hasAttribute('data-quitar-chip')) {
    const id = Number(b.closest<HTMLElement>('[data-chip]')!.dataset.chip);
    cambio(() => (f.materialIds = f.materialIds.filter((m) => m !== id)), true);
    redibujar(f);
  } else if (accion === 'abrir') {
    f.abierta = !f.abierta;
    redibujar(f);
    programarGuardado();
  } else if (accion === 'borrar') {
    if (contenido(f) && !await confirmar('¿Quitar este producto de la carga?')) return;
    cambio(() => (estado.filas = estado.filas.filter((x) => x !== f)), true);
    if (!estado.filas.length) estado.filas.push(filaNueva());
    await dibujarTodo();
  } else if (accion === 'duplicar') {
    // Copia categoría, marca, precio, peso, materiales y variantes; el nombre y las fotos son de cada producto.
    const copia: Fila = { ...structuredClone(f), id: uid(), nombre: '', fotos: [], fotosColor: {}, servidor: undefined, abierta: false };
    copia.variantes = copia.variantes.map((v) => ({ ...v, id: uid() }));
    cambio(() => estado.filas.splice(estado.filas.indexOf(f) + 1, 0, copia), true);
    dibujarFila(copia);
    contenedor.querySelector(`[data-fila="${f.id}"]`)?.after(contenedor.querySelector(`[data-fila="${copia.id}"]`)!);
    contenedor.querySelector<HTMLInputElement>(`[data-fila="${copia.id}"] [data-c="nombre"]`)?.focus();
  } else if (accion === 'agregar-variante') {
    agregarVariante(f, b.closest<HTMLElement>('[data-nueva-variante]')!);
  } else if (accion === 'quitar-variante') {
    cambio(() => (f.variantes = f.variantes.filter((v) => v.id !== b.dataset.variante)), true);
    redibujar(f);
  } else if (accion === 'foto-quitar') {
    const lista = b.dataset.destino === 'principal' ? f.fotos : f.fotosColor[Number(b.dataset.destino)];
    cambio(() => lista.splice(lista.findIndex((x) => x.id === b.dataset.foto), 1), true);
    redibujar(f);
  }
});

// Soltar fotos sobre la zona punteada.
contenedor.addEventListener('dragover', (e) => (e.target as HTMLElement).closest('[data-zona]') && e.preventDefault());
contenedor.addEventListener('drop', async (e) => {
  const zona = (e.target as HTMLElement).closest<HTMLElement>('[data-zona]');
  const f = zona && filaDe(zona);
  if (!zona || !f || f.servidor || !e.dataTransfer?.files.length) return;
  e.preventDefault();
  await agregarFotos(f, zona.dataset.zona!, [...e.dataTransfer.files]);
});

contenedor.addEventListener('keydown', (e) => {
  const c = e.target as HTMLInputElement;
  if (e.key !== 'Enter') return;
  // Enter en el stock de la variante nueva la agrega, como el botón.
  if (c.dataset.nv === 'stock') {
    e.preventDefault();
    const f = filaDe(c);
    if (f) agregarVariante(f, c.closest<HTMLElement>('[data-nueva-variante]')!);
    return;
  }
});

// Pegar desde Excel o Google Sheets: varias celdas copiadas se reparten en filas y columnas
// (Nombre, Categoría, Marca, Precio, Peso), empezando en la celda donde se pega. Las marcas nuevas se crean solas.
const COLUMNAS = ['nombre', 'categoria', 'marca', 'precio', 'peso'] as const;
contenedor.addEventListener('paste', async (e) => {
  const c = e.target as HTMLInputElement;
  if (c.dataset?.c !== 'nombre' && c.dataset?.c !== 'precio' && c.dataset?.c !== 'peso') return;
  const limpio = (e.clipboardData?.getData('text/plain') ?? '').replace(/\r/g, '').replace(/\n$/, '');
  if (!/[\t\n]/.test(limpio)) return;
  e.preventDefault();
  const origen = filaDe(c);
  if (!origen) return;
  const columna = COLUMNAS.indexOf(c.dataset.c);
  const celdas = limpio.split('\n').map((l) => l.split('\t').map((x) => x.trim()));
  const buscar = (lista: Op[], t: string) => lista.find((o) => normal(o.nombre) === normal(t)) ?? (() => { const l = lista.filter((o) => normal(o.nombre.split('›').pop()!) === normal(t)); return l.length === 1 ? l[0] : undefined; })();
  try {
    const iMarca = COLUMNAS.indexOf('marca') - columna;
    for (const m of new Set(celdas.map((r) => r[iMarca]).filter(Boolean))) {
      if (buscar(D.marcas, m)) continue;
      const r = await fetch('/api/admin/marcas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nombre: m }) });
      const j = (await r.json().catch(() => null)) as (Op & { error?: string }) | null;
      if (!r.ok || !j?.id) throw new Error(j?.error ?? `No se pudo agregar la marca «${m}».`);
      D.marcas.push({ id: j.id, nombre: j.nombre });
    }
    const sinCategoria: string[] = [];
    const desde = estado.filas.indexOf(origen);
    cambio(() => {
      celdas.forEach((fila, i) => {
        const f = (estado.filas[desde + i] ??= filaNueva());
        if (f.servidor) return;
        fila.forEach((valor, j) => {
          const campo = COLUMNAS[columna + j];
          if (campo === 'marca') f.marcaId = valor ? (buscar(D.marcas, valor)?.id ?? null) : null;
          else if (campo === 'categoria') {
            f.categoriaId = valor ? (buscar(D.categorias, valor)?.id ?? null) : null;
            if (valor && !f.categoriaId) sinCategoria.push(valor);
          } else if (campo) f[campo] = valor;
        });
      });
    }, true);
    await dibujarTodo();
    decir(sinCategoria.length ? `Se pegaron ${celdas.length} filas. Estas categorías no existen, elegilas a mano: ${[...new Set(sinCategoria)].join(', ')}.` : `Se pegaron ${celdas.length} ${celdas.length === 1 ? 'fila' : 'filas'}.`, sinCategoria.length > 0);
  } catch (err) {
    decir(err instanceof Error ? err.message : 'No se pudo pegar.', true);
  }
});

// Se guarda al salir de una celda y al cerrar la pestaña.
contenedor.addEventListener('focusout', programarGuardado);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void guardarYa());

// Al agregar un producto, los anteriores se cierran: queda a la vista solo el que se está cargando.
function agregarFila() {
  const f = filaNueva();
  cambio(() => {
    for (const x of estado.filas) x.abierta = false;
    estado.filas.push(f);
  }, true);
  void dibujarTodo().then(() => contenedor.querySelector(`[data-fila="${f.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}
q('[data-agregar]').addEventListener('click', agregarFila);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !(e.target as HTMLElement).matches('input, textarea')) {
    e.preventDefault();
    q<HTMLButtonElement>('[data-deshacer]').click();
  }
});
q('[data-deshacer]').addEventListener('click', async () => {
  const antes = historial.pop();
  if (!antes) return;
  estado.filas = JSON.parse(antes);
  if (!estado.filas.length) estado.filas.push(filaNueva());
  q<HTMLButtonElement>('[data-deshacer]').disabled = historial.length === 0;
  await dibujarTodo();
  programarGuardado();
});
q('[data-solo-incompletos]').addEventListener('click', (e) => {
  soloIncompletos = !soloIncompletos;
  (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(soloIncompletos));
  revisar ||= soloIncompletos;
  void dibujarTodo();
});
q<HTMLInputElement>('[data-publicar-ya]').addEventListener('change', (e) => {
  estado.publicarYa = (e.target as HTMLInputElement).checked;
  actualizarResumen();
  programarGuardado();
});

// ───────────── Publicar ─────────────
async function pedir(ruta: string, metodo: string, cuerpo?: unknown) {
  const r = await fetch(ruta, { method: metodo, headers: cuerpo ? { 'content-type': 'application/json' } : undefined, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const j = (await r.json().catch(() => null)) as any;
  if (!r.ok) throw new Error(j?.error ?? 'No se pudo completar.');
  return j;
}

// Las fotos que van al producto: las principales y las de los colores que tiene.
const fotosAsubir = (f: Fila): { foto: Foto; colorId: number | null }[] => [
  ...f.fotos.map((foto) => ({ foto, colorId: null })),
  ...Object.entries(f.fotosColor).flatMap(([c, fs]) => (coloresDe(f).includes(Number(c)) ? fs.map((foto) => ({ foto, colorId: Number(c) })) : [])),
];

async function subirFotos(f: Fila) {
  for (const { foto, colorId } of fotosAsubir(f).filter((x) => !x.foto.subida)) {
    const blobs = await fotoGuardada(foto.id);
    if (!blobs) throw new Error(`Se perdió una foto de «${f.nombre}»: agregala de nuevo.`);
    const datos = new FormData();
    for (const t of ['chico', 'mediano', 'grande'] as const) datos.set(t, blobs[t], `${t}.webp`);
    if (blobs.original) {
      datos.set('original', blobs.original, 'original.webp');
      datos.set('encuadre', JSON.stringify({ x: 0, y: 0, ancho: 1, alto: 1 }));
    }
    if (colorId) datos.set('colorId', String(colorId));
    decir(`Subiendo fotos de «${f.nombre}»…`);
    const r = await fetch(`/api/admin/productos/${f.servidor!.id}/imagenes`, { method: 'POST', body: datos });
    if (!r.ok) throw new Error(((await r.json().catch(() => null)) as any)?.error ?? `No se pudo subir una foto de «${f.nombre}».`);
    foto.subida = true;
    await guardarYa();
  }
}

q('[data-publicar]').addEventListener('click', async () => {
  if (ocupado) return;
  const lista = q('[data-problemas]');
  lista.hidden = true;
  lista.replaceChildren();
  const filas = estado.filas.filter(contenido);
  if (!filas.length) return decir('Todavía no cargaste ningún producto.', true);
  revisar = true;
  const malas = filas.filter((f) => problemas(f).some((p) => p.grave));
  if (malas.length) {
    await dibujarTodo();
    contenedor.querySelector(`[data-fila="${malas[0].id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return decir(`Faltan datos en ${malas.length} ${malas.length === 1 ? 'producto' : 'productos'}: revisá lo marcado en rojo.`, true);
  }

  ocupado = true;
  actualizarBotones();
  const fallas: string[] = [];
  try {
    // 1) Los productos que todavía no existen se crean juntos (todo o nada).
    const nuevos = filas.filter((f) => !f.servidor);
    if (nuevos.length) {
      decir(`Creando ${nuevos.length} ${nuevos.length === 1 ? 'producto' : 'productos'}…`);
      const r = await pedir('/api/admin/productos/lote', 'POST', {
        productos: nuevos.map((f) => ({
          nombre: f.nombre.trim(),
          categoriaId: f.categoriaId,
          marcaId: f.marcaId,
          materialIds: f.materialIds,
          coleccionIds: f.coleccionIds,
          precioCentavos: aCentavos(f.precio),
          pesoGramos: f.peso.trim() ? Number(f.peso) : null,
          variantes: f.variantes.map((v) => ({ talleId: v.talleId, colorId: v.colorId, stock: stockDe(v) })),
        })),
      });
      nuevos.forEach((f, i) => (f.servidor = r.productos[i]));
      await guardarYa();
      await dibujarTodo();
    }
    // 2) Las fotos, de a una (cada una ya está achicada en el navegador).
    for (const f of filas) {
      try {
        await subirFotos(f);
      } catch (e) {
        fallas.push(e instanceof Error ? e.message : `Falló una foto de «${f.nombre}».`);
      }
    }
    // 3) Si se pidió, se publican los que tienen todas sus fotos arriba.
    if (estado.publicarYa) {
      for (const f of filas.filter((x) => fotosAsubir(x).every((y) => y.foto.subida))) {
        try {
          decir(`Publicando «${f.nombre}»…`);
          await pedir(`/api/admin/productos/${f.servidor!.id}`, 'PATCH', { estado: 'publicado' });
        } catch (e) {
          fallas.push(`«${f.nombre}» quedó como borrador: ${e instanceof Error ? e.message : 'no se pudo publicar.'}`);
        }
      }
    }
  } catch (e) {
    decir(e instanceof Error ? e.message : 'No se pudo crear la carga. No se creó nada.', true);
    ocupado = false;
    actualizarBotones();
    return;
  }

  if (fallas.length) {
    lista.hidden = false;
    lista.replaceChildren(...fallas.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
    decir('Los productos se crearon, pero hubo problemas. Tocá «Publicar productos» para reintentar lo que falta.', true);
    ocupado = false;
    actualizarBotones();
    return;
  }
  await idb('estado', 'readwrite', (s) => s.delete('borrador'));
  location.assign('/admin/productos?ok');
});

// ───────────── Arranque ─────────────
async function arrancar() {
  bd = await abrir();
  const guardado = await idb<string>('estado', 'readonly', (s) => s.get('borrador'));
  let previo: Estado | null = null;
  try {
    previo = guardado ? (JSON.parse(guardado) as Estado) : null;
  } catch {}
  // Un borrador del formato anterior de esta pantalla no se puede retomar.
  if (previo && previo.v !== 2) previo = null;
  if (previo?.filas.some(contenido)) {
    const aviso = q('[data-retomar]');
    const n = previo.filas.filter(contenido).length;
    q('[data-retomar-texto]', aviso).textContent = `Tenés una carga sin terminar: ${n} ${n === 1 ? 'producto' : 'productos'}, guardada el ${new Date(previo.guardado).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}.`;
    aviso.hidden = false;
    bloqueado = true;
    contenedor.inert = true;
    contenedor.classList.add('opacity-50');
    const resolver = () => ((bloqueado = false), (contenedor.inert = false), contenedor.classList.remove('opacity-50'), (aviso.hidden = true));
    q('[data-continuar]').addEventListener('click', async () => {
      estado = previo!;
      for (const f of estado.filas) f.coleccionIds ??= [];
      resolver();
      await dibujarTodo();
    });
    q('[data-descartar]').addEventListener('click', async () => {
      if (!await confirmar('¿Descartar la carga sin terminar? No se puede recuperar.')) return;
      resolver();
      await idb('estado', 'readwrite', (s) => s.clear());
      await idb('fotos', 'readwrite', (s) => s.clear());
      estado = { v: 2, filas: [filaNueva()], publicarYa: false, guardado: '' };
      await dibujarTodo();
    });
  }
  estado.filas = [filaNueva()];
  await dibujarTodo();
  if (!bd) q('[data-guardado]').textContent = 'Ojo: este navegador no puede guardar el borrador.';
}
void arrancar();

addEventListener('beforeunload', (e) => {
  if (ocupado) e.preventDefault();
});
