// Reglas de precarga instantánea de la tienda (Chrome y Edge): al apoyar el mouse o el dedo en un link, el navegador arma
// esa página por detrás. Afuera quedan las pantallas que dependen de cada clienta (carrito, checkout, pedido) y el panel.
// Viven acá y no en layouts/Tienda.astro porque astro.config.mjs calcula su huella para la política de contenido (CSP):
// con huellas en la política, Chrome ignora 'inline-speculation-rules'.
export const REGLAS_PRECARGA = JSON.stringify({
  prerender: [
    {
      where: {
        and: [
          { href_matches: '/*' },
          { not: { href_matches: ['/carrito', '/checkout', '/pedido/*', '/recuperar/*', '/admin', '/admin/*', '/api/*'] } },
          { not: { selector_matches: '[target], [download]' } },
        ],
      },
      eagerness: 'moderate',
    },
  ],
});
