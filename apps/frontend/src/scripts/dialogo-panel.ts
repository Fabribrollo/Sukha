// Diálogos del panel: texto seguro, foco contenido y Escape para cancelar.
let abierto = false;
function abrir(mensaje: string, inicial?: string): Promise<string | null> {
  if (abierto) return Promise.resolve(null);
  abierto = true;
  return new Promise((resolver) => {
    const anterior = document.activeElement as HTMLElement | null;
    const dialogo = document.createElement('dialog');
    dialogo.className = 'm-auto w-[calc(100%-2rem)] max-w-md rounded-2xl p-6 backdrop:bg-gray-900/50';
    dialogo.setAttribute('aria-labelledby', 'dialogo-panel-titulo');
    dialogo.setAttribute('aria-describedby', 'dialogo-panel-mensaje');
    const titulo = document.createElement('h2');
    titulo.id = 'dialogo-panel-titulo';
    titulo.className = 'mb-3 text-lg font-semibold text-gray-800';
    titulo.textContent = inicial === undefined ? 'Confirmar acción' : 'Cambiar nombre';
    const texto = document.createElement('p');
    texto.id = 'dialogo-panel-mensaje';
    texto.className = 'mb-5 whitespace-pre-line text-sm text-gray-600';
    texto.textContent = mensaje;
    const form = document.createElement('form');
    form.method = 'dialog';
    const entrada = document.createElement('input');
    if (inicial !== undefined) {
      entrada.className = 'campo mb-5'; entrada.value = inicial;
      entrada.setAttribute('aria-label', 'Nuevo nombre'); entrada.required = true; entrada.maxLength = 60;
      form.append(entrada);
    }
    const acciones = document.createElement('div');
    acciones.className = 'flex justify-end gap-3';
    const cancelar = document.createElement('button');
    cancelar.type = 'button'; cancelar.className = 'btn btn-secundario'; cancelar.textContent = 'Cancelar';
    cancelar.addEventListener('click', () => dialogo.close());
    const aceptar = document.createElement('button');
    aceptar.type = 'submit'; aceptar.className = 'btn btn-primario'; aceptar.textContent = inicial === undefined ? 'Confirmar' : 'Guardar nombre';
    form.addEventListener('submit', (e) => { e.preventDefault(); dialogo.close('aceptar'); });
    acciones.append(cancelar, aceptar); form.append(acciones); dialogo.append(titulo, texto, form);
    dialogo.addEventListener('close', () => {
      const resultado = dialogo.returnValue === 'aceptar' ? (inicial === undefined ? '' : entrada.value) : null;
      dialogo.remove(); abierto = false; anterior?.focus(); resolver(resultado);
    }, { once: true });
    document.body.append(dialogo); dialogo.showModal();
    if (inicial === undefined) cancelar.focus(); else { entrada.focus(); entrada.select(); }
  });
}
export const confirmar = async (mensaje: string) => (await abrir(mensaje)) !== null;
export const pedirTexto = (mensaje: string, inicial: string) => abrir(mensaje, inicial);
