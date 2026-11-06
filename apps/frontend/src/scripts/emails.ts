// Editor de plantillas de email: vista previa en vivo con datos de ejemplo, variables que se insertan donde está el cursor
// y «Enviarme una prueba» con el texto tal como está (aunque no esté guardado).
const form = document.querySelector<HTMLFormElement>('form[data-plantilla]')!;
const tipo = form.dataset.plantilla!;
const asunto = form.querySelector<HTMLInputElement>('[name=asunto]')!;
const texto = form.querySelector<HTMLTextAreaElement>('[name=texto]')!;
const estado = form.querySelector<HTMLElement>('[data-estado]')!;
let ultimo: HTMLInputElement | HTMLTextAreaElement = texto;
let sucio = false;

const decir = (t: string, error = false) => {
  estado.textContent = t;
  estado.className = `text-sm empty:hidden ${error ? 'text-error-600' : 'text-success-600'}`;
};
const pedir = async (accion: string) => {
  const r = await fetch(`/api/admin/plantillas/${tipo}/${accion}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ asunto: asunto.value, texto: texto.value }) });
  const j = (await r.json().catch(() => null)) as any;
  if (!r.ok) throw new Error(j?.error ?? 'No se pudo completar.');
  return j;
};

let espera: ReturnType<typeof setTimeout> | undefined;
async function actualizar() {
  try {
    const v = await pedir('vista-previa');
    const iframe = document.querySelector<HTMLIFrameElement>('[data-vista-email]');
    if (iframe) iframe.srcdoc = v.html;
    const a = document.querySelector('[data-vista-asunto]');
    if (a) a.textContent = v.asunto;
    const m = document.querySelector('[data-vista-mensaje]');
    if (m) m.textContent = v.texto;
  } catch {
    /* mientras se escribe, un texto vacío no se puede previsualizar */
  }
}
form.addEventListener('input', () => {
  sucio = true;
  clearTimeout(espera);
  espera = setTimeout(actualizar, 350);
});
for (const campo of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-campo]')) campo.addEventListener('focus', () => (ultimo = campo));

// Variables: se insertan donde estaba el cursor del último campo tocado.
for (const boton of form.querySelectorAll<HTMLButtonElement>('[data-variable]')) {
  boton.addEventListener('click', () => {
    const v = boton.dataset.variable!;
    const desde = ultimo.selectionStart ?? ultimo.value.length;
    const hasta = ultimo.selectionEnd ?? desde;
    ultimo.setRangeText(v, desde, hasta, 'end');
    ultimo.focus();
    ultimo.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

form.querySelector('[data-probar]')?.addEventListener('click', async (e) => {
  const boton = e.currentTarget as HTMLButtonElement;
  boton.disabled = true;
  try {
    const r = await pedir('prueba');
    decir(`Te mandamos la prueba a ${r.enviadoA}.`);
  } catch (err) {
    decir(err instanceof Error ? err.message : 'No se pudo enviar la prueba.', true);
  } finally {
    boton.disabled = false;
  }
});

// Vista en compu o celular.
for (const boton of document.querySelectorAll<HTMLButtonElement>('[data-ancho]')) {
  boton.addEventListener('click', () => {
    for (const b of document.querySelectorAll('[data-ancho]')) b.setAttribute('aria-pressed', String(b === boton));
    const marco = document.querySelector<HTMLElement>('[data-marco]');
    if (marco) marco.style.width = boton.dataset.ancho!;
  });
}

form.addEventListener('submit', () => (sucio = false));
addEventListener('beforeunload', (e) => sucio && e.preventDefault());
void actualizar();
