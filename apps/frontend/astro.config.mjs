// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

import preact from '@astrojs/preact';

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({ imageService: 'passthrough' }),

  vite: {
    plugins: [tailwindcss()],
    // Los scripts van siempre en archivos aparte: la política de contenido del panel no permite scripts dentro de la página.
    build: { assetsInlineLimit: 0 },
  },

  integrations: [preact()],
});