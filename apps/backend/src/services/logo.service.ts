import { archivoWebp } from '../utils/imagen';
import { guardarConfiguracion, leerConfiguracion } from './configuracion.service';

// El logo y el favicon son un solo WebP en KV ({clave}/grande.webp). La clave se guarda en la configuración; al cambiarlo se usa
// una clave nueva (las imágenes se cachean para siempre por dirección) y se borra el archivo anterior.
const archivo = (clave: string) => `${clave}/grande.webp`;
type Imagen = { campo: 'logo' | 'favicon'; config: 'logo_clave' | 'favicon_clave' };
const LOGO: Imagen = { campo: 'logo', config: 'logo_clave' };
const FAVICON: Imagen = { campo: 'favicon', config: 'favicon_clave' };

async function subir(kv: KVNamespace, d1: D1Database, form: FormData, { campo, config }: Imagen) {
  const webp = (await archivoWebp(form, campo, true))!;
  const clave = `${campo}/${crypto.randomUUID()}`;
  await kv.put(archivo(clave), webp.stream(), { metadata: { tipo: 'image/webp' } });
  const anterior = (await leerConfiguracion(d1))[config];
  await guardarConfiguracion(d1, config, clave);
  if (anterior) await kv.delete(archivo(anterior));
  return { clave };
}

async function quitar(kv: KVNamespace, d1: D1Database, { config }: Imagen) {
  const anterior = (await leerConfiguracion(d1))[config];
  await guardarConfiguracion(d1, config, '');
  if (anterior) await kv.delete(archivo(anterior));
  return { ok: true };
}

export const subirLogo = (kv: KVNamespace, d1: D1Database, form: FormData) => subir(kv, d1, form, LOGO);
export const quitarLogo = (kv: KVNamespace, d1: D1Database) => quitar(kv, d1, LOGO);
export const subirFavicon = (kv: KVNamespace, d1: D1Database, form: FormData) => subir(kv, d1, form, FAVICON);
export const quitarFavicon = (kv: KVNamespace, d1: D1Database) => quitar(kv, d1, FAVICON);
