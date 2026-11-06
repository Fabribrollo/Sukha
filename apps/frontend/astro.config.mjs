// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

import preact from '@astrojs/preact';
import { createHash } from 'node:crypto';
import { REGLAS_PRECARGA } from './src/lib/precarga.mjs';

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({ imageService: 'passthrough' }),

  // La barra de herramientas de astro dev tapa lo de abajo en el celular («Crear borrador», la barra de guardado). No existe publicado.
  devToolbar: { enabled: false },

  vite: {
    plugins: [tailwindcss()],
    // Los scripts van siempre en archivos aparte: la política de contenido del panel no permite scripts dentro de la página.
    build: { assetsInlineLimit: 0 },
  },

  integrations: [preact()],

  // Política de seguridad de contenido (CSP) de la tienda: solo corren los scripts propios y los que arma Astro (las islas),
  // que van con su huella (hash) en la cabecera. Un script inyectado en un texto cargado no corre ni puede mandar datos
  // afuera. El panel tiene una política propia, más estricta, que pone middleware.ts. Rige solo publicado (no en astro dev).
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        // data: y blob: para las vistas previas de fotos; la AFIP para la imagen de Data Fiscal del pie.
        "img-src 'self' data: blob: https://www.afip.gob.ar",
        'font-src https://fonts.gstatic.com',
        // El mapa del local (MapLibre) baja sus datos de OpenFreeMap y dibuja en un hilo propio.
        "connect-src 'self' https://cloudflareinsights.com https://tiles.openfreemap.org",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ],
      // Además de los scripts propios, las reglas de precarga instantánea (src/lib/precarga.mjs), por su huella.
      scriptDirective: { resources: ["'self'", 'https://static.cloudflareinsights.com'], hashes: [`sha256-${createHash('sha256').update(REGLAS_PRECARGA).digest('base64')}`] },
      // Las islas y los colores de las muestras usan style="…"; las tipografías vienen de Google Fonts.
      styleDirective: { resources: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'] },
    },
  },
});