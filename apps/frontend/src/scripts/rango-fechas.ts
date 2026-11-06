// Rango de fechas en un solo campo (flatpickr). Se usa en cualquier [data-rango="fecha|fechahora"] que tenga dos <input>
// (desde, hasta): los originales se esconden pero siguen siendo los que se envían, así el servidor no cambia.
//   data-rango="fechahora"  guarda 00:00 al empezar y 23:59 al terminar el día elegido
//   data-opcional           permite dejar el rango vacío (aparece una × para borrarlo)
//   data-etiqueta           texto de la etiqueta del campo
import flatpickr from 'flatpickr';
import { Spanish } from 'flatpickr/dist/l10n/es.js';
import 'flatpickr/dist/flatpickr.min.css';

export function iniciarRangos(raiz: ParentNode = document) {
  for (const caja of raiz.querySelectorAll<HTMLElement>('[data-rango]:not([data-rango-listo])')) {
    caja.dataset.rangoListo = '';
    const [desde, hasta] = [...caja.querySelectorAll<HTMLInputElement>('input')];
    if (!desde || !hasta) continue;
    const conHora = caja.dataset.rango === 'fechahora';
    const dia = (v: string) => v.slice(0, 10);
    // Los originales y lo que los rodea (etiqueta, ayuda) se reemplazan por un único campo.
    for (const o of [desde, hasta]) {
      const padre = o.parentElement!;
      (padre !== caja && padre.querySelectorAll('input').length === 1 ? padre : o).hidden = true;
    }
    const id = `rango-${Math.random().toString(36).slice(2, 7)}`;
    const marco = document.createElement('div');
    marco.className = 'relative col-span-2';
    marco.innerHTML = `<label for="${id}" class="etiqueta${caja.dataset.etiqueta ? '' : ' sr-only'}">${caja.dataset.etiqueta ?? 'Fechas'}</label><input id="${id}" readonly placeholder="Elegí desde y hasta" class="campo cursor-pointer ${caja.dataset.opcional !== undefined ? 'pr-10' : ''}" />${
      caja.dataset.opcional !== undefined ? '<button type="button" hidden class="btn-icono absolute right-1 bottom-1 size-9" title="Borrar fechas" aria-label="Borrar fechas">×</button>' : ''
    }`;
    caja.append(marco);
    const ver = marco.querySelector('input')!;
    const borrar = marco.querySelector('button');
    const valores = () => [desde.value, hasta.value].filter(Boolean).map((v) => dia(v));
    const selector = flatpickr(ver, {
      mode: 'range',
      locale: Spanish,
      dateFormat: 'd/m/Y',
      defaultDate: valores(),
      maxDate: desde.max || undefined,
      static: Boolean(caja.closest('dialog')), // dentro de una ventana el calendario tiene que vivir adentro, o queda tapado
      disableMobile: true, // el rango no existe en el calendario nativo del celular
      onChange(fechas) {
        if (fechas.length === 1) return; // falta el segundo día
        const [a, b] = fechas.length ? [fechas[0], fechas[1]] : [null, null];
        const ymd = (d: Date | null) => (d ? flatpickr.formatDate(d, 'Y-m-d') : '');
        desde.value = a ? ymd(a) + (conHora ? 'T00:00' : '') : '';
        hasta.value = b ? ymd(b) + (conHora ? 'T23:59' : '') : '';
        if (borrar) borrar.hidden = !a;
        desde.dispatchEvent(new Event('change', { bubbles: true }));
        hasta.dispatchEvent(new Event('change', { bubbles: true }));
      },
    });
    if (borrar) borrar.hidden = !valores().length;
    borrar?.addEventListener('click', () => selector.clear());
    // Si otro script llena los campos (editar en una ventana), el calendario se pone al día sin volver a avisar.
    const sincronizar = () => {
      selector.setDate(valores(), false);
      if (borrar) borrar.hidden = !valores().length;
    };
    desde.addEventListener('change', sincronizar);
    hasta.addEventListener('change', sincronizar);
  }
}
iniciarRangos();
