// Mapa de «Probátelo en el local» (MapLibre + OpenFreeMap). Se carga recién cuando el mapa está por verse, así no pesa en el resto de
// la página; si falla, queda el cuadro beige de la portada. Lo que se ve (lugar, zoom y etiqueta) se edita en /admin/portada.
import { COLORES_MAPA, estiloMapa } from '../lib/estilo-mapa';
// El hilo que dibuja el mapa va como archivo propio del sitio (no como blob), así entra en la política de contenido.
import urlDelHilo from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

async function montar(caja: HTMLElement) {
  const lat = Number(caja.dataset.lat);
  const lng = Number(caja.dataset.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  try {
    const [modulo] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]);
    const M = (modulo as any).default ?? modulo;
    M.setWorkerUrl(urlDelHilo);
    const mapa = new M.Map({
      container: caja,
      style: estiloMapa(),
      center: [lng, lat],
      zoom: Number(caja.dataset.zoom) || 16,
      // Se arrastra y se acerca; con gestos cooperativos para que la página siga desplazándose (dos dedos en el celular, Ctrl + rueda en la computadora).
      cooperativeGestures: true,
      locale: {
        'CooperativeGesturesHandler.WindowsHelpText': 'Usá Ctrl + rueda para acercar el mapa',
        'CooperativeGesturesHandler.MacHelpText': 'Usá ⌘ + rueda para acercar el mapa',
        'CooperativeGesturesHandler.MobileHelpText': 'Usá dos dedos para mover el mapa',
        'NavigationControl.ZoomIn': 'Acercar',
        'NavigationControl.ZoomOut': 'Alejar',
      },
      attributionControl: { compact: true },
      fadeDuration: 0,
    });
    mapa.addControl(new M.NavigationControl({ showCompass: false }), 'top-right');
    // «Cómo llegar» abre la ficha del lugar en Google Maps (el enlace que se carga en la sección); sin enlace, busca las coordenadas.
    const destino = caja.dataset.enlace || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    // El pin y la etiqueta, como en el diseño; la etiqueta lleva a la ficha.
    const pin = document.createElement('div');
    pin.style.cssText = `width:14px;height:14px;border-radius:50%;background:${COLORES_MAPA.pin};box-shadow:0 0 0 3px #fff,0 0 0 14px ${COLORES_MAPA.pin}33`;
    new M.Marker({ element: pin, anchor: 'center' }).setLngLat([lng, lat]).addTo(mapa);
    if (caja.dataset.etiqueta) {
      const etiqueta = document.createElement('a');
      etiqueta.href = destino;
      etiqueta.target = '_blank';
      etiqueta.rel = 'noopener';
      etiqueta.textContent = `${caja.dataset.etiqueta} →`;
      etiqueta.style.cssText = 'background:#1e1c19;color:#f5f4f1;font:12px/1 Figtree,sans-serif;padding:8px 10px;white-space:nowrap;text-decoration:none;cursor:pointer';
      new M.Marker({ element: etiqueta, anchor: 'bottom-left', offset: [14, -14] }).setLngLat([lng, lat]).addTo(mapa);
    }
    // Botón de acción sobre el mapa.
    const cta = document.createElement('a');
    cta.href = destino;
    cta.target = '_blank';
    cta.rel = 'noopener';
    cta.textContent = 'Cómo llegar';
    cta.style.cssText = 'position:absolute;left:12px;bottom:12px;z-index:2;background:#1e1c19;color:#f5f4f1;font:500 12px/1 Figtree,sans-serif;letter-spacing:.18em;text-transform:uppercase;padding:14px 20px;text-decoration:none';
    caja.append(cta);
    (caja as any).mapa = mapa; // para las pruebas
    mapa.on('load', () => {
      caja.dataset.listo = '';
      // La atribución arranca cerrada (queda el botón «i» para abrirla), como pide el diseño minimalista.
      const atribucion = caja.querySelector('.maplibregl-ctrl-attrib');
      atribucion?.classList.remove('maplibregl-compact-show');
      atribucion?.removeAttribute('open');
    });
  } catch {
    /* sin mapa: queda el cuadro beige */
  }
}

const cajas = document.querySelectorAll<HTMLElement>('[data-mapa]');
if (cajas.length) {
  const mirar = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        mirar.unobserve(e.target);
        void montar(e.target as HTMLElement);
      }
    },
    { rootMargin: '400px' },
  );
  for (const caja of cajas) mirar.observe(caja);
}
