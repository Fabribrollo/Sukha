// Reencuadrar una foto ya subida: al tocarla se abre el recorte (3:4, como se ven en la tienda) sobre la imagen guardada
// y se reemplaza por la nueva, conservando su lugar y su color. Solo se puede achicar el encuadre: el original no se guarda.
import { recortarConEncuadre } from './recorte';
import { aWebp } from './webp';

const TAMANOS = { chico: 400, mediano: 900, grande: 1600 };

async function reencuadrar(zona: HTMLElement) {
  const estado = document.querySelector<HTMLElement>('[data-estado-fotos]');
  const decir = (t: string) => estado && (estado.textContent = t);
  try {
    // Con la original guardada se parte siempre de ella (sin perder calidad); las fotos viejas, sin original, solo se pueden achicar.
    const conOriginal = zona.dataset.original === '1';
    const origen = await fetch(conOriginal ? `/api/admin/imagenes/${zona.dataset.recortar}/original` : `/api/imagenes/${zona.dataset.clave}/grande.webp`);
    if (!origen.ok) throw new Error('No se pudo abrir la foto.');
    const blob = await origen.blob();
    const resultado = await recortarConEncuadre(new File([blob], 'foto.webp', { type: blob.type || 'image/webp' }), { aspecto: 3 / 4, encuadre: conOriginal && zona.dataset.encuadre ? JSON.parse(zona.dataset.encuadre) : null });
    if (!resultado) return;
    const nueva = resultado.archivo;
    decir('Guardando el nuevo encuadre…');
    const datos = new FormData();
    for (const [nombre, ancho] of Object.entries(TAMANOS)) datos.set(nombre, await aWebp(nueva, ancho), `${nombre}.webp`);
    if (conOriginal) datos.set('encuadre', JSON.stringify(resultado.encuadre));
    const r = await fetch(`/api/admin/imagenes/${zona.dataset.recortar}/archivos`, { method: 'PUT', body: datos });
    if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No se pudo guardar.');
    location.assign(`${location.pathname}?ok`);
  } catch (e) {
    decir(e instanceof Error ? e.message : 'No se pudo reencuadrar la foto.');
  }
}

for (const zona of document.querySelectorAll<HTMLElement>('[data-recortar]')) {
  zona.addEventListener('click', () => void reencuadrar(zona));
  zona.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), void reencuadrar(zona)));
}
