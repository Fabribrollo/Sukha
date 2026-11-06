// Estilo del mapa de «Probátelo en el local»: un mapa vectorial minimalista (calles blancas sobre fondo beige, sin comercios ni
// íconos) con los colores de la tienda. Los datos salen de OpenFreeMap (gratis, sin clave) y los colores se cambian acá.
export const COLORES_MAPA = {
  fondo: '#e3dccd',
  manzana: '#d9d3c8',
  parque: '#d6cfbd',
  agua: '#cbc3b2',
  calle: '#f5f4f1',
  texto: '#67625a',
  pin: '#a4532f',
};

const CLASES_CALLE = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'];
// Ancho de la calle según el zoom: [zoom, píxeles].
const ancho = (chico: number, grande: number) => ['interpolate', ['exponential', 1.6], ['zoom'], 12, chico * 0.3, 16, chico, 19, grande] as unknown;

export function estiloMapa(): Record<string, unknown> {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      openmaptiles: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      },
    },
    layers: [
      { id: 'fondo', type: 'background', paint: { 'background-color': COLORES_MAPA.fondo } },
      { id: 'agua', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': COLORES_MAPA.agua } },
      { id: 'parques', type: 'fill', source: 'openmaptiles', 'source-layer': 'park', paint: { 'fill-color': COLORES_MAPA.parque } },
      { id: 'edificios', type: 'fill', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': COLORES_MAPA.manzana, 'fill-opacity': 0.7 } },
      {
        id: 'calles-menores',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': COLORES_MAPA.calle, 'line-width': ancho(5, 16) },
      },
      {
        id: 'calles-mayores',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', CLASES_CALLE.filter((c) => !['minor', 'service', 'tertiary'].includes(c))]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': COLORES_MAPA.calle, 'line-width': ancho(9, 26) },
      },
      {
        id: 'nombres-de-calles',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        minzoom: 15,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-letter-spacing': 0.12,
          'text-transform': 'uppercase',
        },
        paint: { 'text-color': COLORES_MAPA.texto, 'text-halo-color': COLORES_MAPA.calle, 'text-halo-width': 1.2 },
      },
    ],
  };
}
