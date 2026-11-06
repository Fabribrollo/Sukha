// Achica una foto y la convierte a WebP en el navegador, antes de subirla (así se guardan archivos livianos sin pagar ningún servicio).
const CALIDAD = 0.82;

export async function aWebp(archivo: File, anchoMaximo: number): Promise<Blob> {
  const imagen = await createImageBitmap(archivo);
  const escala = Math.min(1, anchoMaximo / imagen.width);
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  lienzo.getContext('2d')!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  imagen.close();
  const blob = await new Promise<Blob | null>((listo) => lienzo.toBlob(listo, 'image/webp', CALIDAD));
  // Safari viejo no sabe generar WebP y devuelve PNG: mejor avisar que subir algo que el servidor va a rechazar.
  if (!blob || blob.type !== 'image/webp') throw new Error('Este navegador no puede convertir fotos a WebP. Probá con Chrome o Firefox.');
  return blob;
}

