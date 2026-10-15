import { MAX_BYTES_FOTO } from '../config';
import { ErrorApp } from './errores';

// Un WebP empieza con "RIFF", cuatro bytes de tamaño y "WEBP".
async function esWebp(archivo: File) {
  const b = new Uint8Array(await archivo.slice(0, 12).arrayBuffer());
  const ascii = (desde: number) => String.fromCharCode(...b.slice(desde, desde + 4));
  return b.length === 12 && ascii(0) === 'RIFF' && ascii(8) === 'WEBP';
}

// Toma un archivo del formulario y verifica que sea una imagen WebP de tamaño razonable.
// No se confía en el tipo que declara el navegador: se miran los primeros bytes del archivo.
export async function archivoWebp(form: FormData, campo: string, obligatorio: boolean): Promise<File | null> {
  const archivo = form.get(campo);
  if (!(archivo instanceof File) || archivo.size === 0) {
    if (obligatorio) throw new ErrorApp(400, `Falta el archivo "${campo}".`);
    return null;
  }
  if (archivo.size > MAX_BYTES_FOTO) throw new ErrorApp(400, `"${campo}" pesa más de 2 MB.`);
  if (!(await esWebp(archivo))) throw new ErrorApp(400, `"${campo}" tiene que ser una imagen WebP.`);
  return archivo;
}
