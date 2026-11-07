import { confirmar } from './dialogo-panel';
// Barra de guardado (components/panel/BarraGuardado.astro). Los <form data-pendiente="Nombre"> de la página no se guardan
// solos: al cambiar algo aparece la barra, y «Guardar» (o el botón propio del formulario) manda los cambiados uno por uno a
// la misma página, pidiendo JSON. Si uno falla, dice cuál y deja lo escrito como está. «Descartar» vuelve a cargar la página.
// Con cambios sin guardar, salir (un link, otro formulario, cerrar la pestaña) pide confirmar. Los links del panel abren
// páginas ya preparadas (speculation rules), pero el clic pasa igual por acá.

const barra = document.querySelector<HTMLElement>('[data-barra-guardado]')!;
const texto = barra.querySelector<HTMLElement>('[data-barra-texto]')!;
const botones = barra.querySelectorAll('button');
const formularios = [...document.querySelectorAll<HTMLFormElement>('form[data-pendiente]')];
const valores = (f: HTMLFormElement) => JSON.stringify([...new FormData(f)]);
const cargados = new Map(formularios.map((f) => [f, valores(f)]));
const cambiado = (f: HTMLFormElement) => valores(f) !== cargados.get(f);
const PREGUNTA = 'Tenés cambios sin guardar. Si salís, se pierden. ¿Salir igual?';
let saliendo = false;

const decir = (mensaje: string, error = false) => {
  texto.textContent = mensaje;
  texto.classList.toggle('text-error-600', error);
};
const avisar = (e: BeforeUnloadEvent) => !saliendo && !barra.hidden && e.preventDefault();
const revisar = () => {
  const hay = formularios.some(cambiado);
  if (hay === !barra.hidden) return;
  barra.hidden = !hay;
  decir('Cambios sin guardar');
  // El aviso del navegador solo mientras hay cambios: con él puesto, algunos navegadores no guardan la página en memoria.
  if (hay) addEventListener('beforeunload', avisar);
  else removeEventListener('beforeunload', avisar);
};
// Después del evento, para ver también lo que cambian otros scripts (etiquetas de materiales, combos que crean opciones).
for (const f of formularios) for (const tipo of ['input', 'change', 'click']) f.addEventListener(tipo, () => setTimeout(revisar));

async function guardar(extra?: HTMLFormElement, boton?: HTMLElement | null) {
  const lista = formularios.filter((f) => f === extra || cambiado(f));
  if (!lista.every((f) => f.reportValidity())) return;
  botones.forEach((b) => (b.disabled = true));
  decir('Guardando…');
  for (const f of lista) {
    // El botón que mandó el formulario viaja con él (por ejemplo «Restaurar el original» en Textos).
    const r = await fetch(location.pathname, { method: 'POST', body: new FormData(f, f === extra ? boton : null), headers: { accept: 'application/json' } }).catch(() => null);
    // Sin JSON (sesión vencida que manda al login, corte) también es error: nunca se da por guardado.
    const cuerpo = (await r?.json().catch(() => null)) as { error?: string } | null;
    if (!r?.ok || !cuerpo) {
      decir(`${f.dataset.pendiente}: ${cuerpo?.error ?? 'no se pudo guardar. Probá de nuevo.'}`, true);
      botones.forEach((b) => (b.disabled = false));
      return;
    }
    cargados.set(f, valores(f));
  }
  saliendo = true;
  // Se vuelve a la misma pantalla, con lo que estaba elegido (?t=…, #pestaña), y el aviso de guardado.
  const otros = location.search.slice(1).split('&').filter((p) => p && p !== 'ok');
  const destino = `${location.pathname}?${[...otros, 'ok'].join('&')}${location.hash}`;
  // A la misma dirección con # el navegador no recarga: solo saltaría a la pestaña.
  if (destino === location.pathname + location.search + location.hash) location.reload();
  else location.assign(destino);
}

barra.querySelector('[data-guardar]')!.addEventListener('click', () => guardar());
barra.querySelector('[data-descartar]')!.addEventListener('click', () => {
  saliendo = true;
  location.reload();
});

document.addEventListener(
  'submit',
  async (e) => {
    const form = e.target as HTMLFormElement;
    if (formularios.includes(form)) {
      e.preventDefault();
      guardar(form, (e as SubmitEvent).submitter);
    } else if (!barra.hidden && !saliendo && !form.dataset.subida) {
      // Las fotos se suben sin salir de la página (scripts/fotos.ts); cualquier otro formulario recarga y perdería lo escrito.
      e.preventDefault();
      const boton = (e as SubmitEvent).submitter;
      if (await confirmar(PREGUNTA)) { saliendo = true; form.requestSubmit(boton as HTMLButtonElement | null); }
    }
  },
  true,
);

document.addEventListener(
  'click',
  async (e) => {
    const a = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || barra.hidden || saliendo || a.target || a.hasAttribute('download') || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (a.pathname === location.pathname && a.search === location.search && a.hash) return;
    e.preventDefault();
    if (await confirmar(PREGUNTA)) { saliendo = true; location.assign(a.href); }
  },
  true,
);
