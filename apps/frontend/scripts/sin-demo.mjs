// Corta el deploy si quedó el cargador de datos de prueba dentro de public/ (se publicaría junto con la tienda).
import { existsSync } from 'node:fs';

if (existsSync(new URL('../public/_demo-datos.js', import.meta.url))) {
  console.error('Borrá apps/frontend/public/_demo-datos.js antes de publicar.');
  process.exit(1);
}
