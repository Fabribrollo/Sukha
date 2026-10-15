import type { ContentfulStatusCode } from 'hono/utils/http-status';

// Error esperado (dato inválido, sin stock, no encontrado): se devuelve tal cual a quien llamó.
export class ErrorApp extends Error {
  constructor(
    public status: ContentfulStatusCode,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

export const noEncontrado = (que: string) => new ErrorApp(404, `No se encontró ${que}.`);

// D1 informa las violaciones de restricciones en el mensaje del error (o en su causa, vía Drizzle).
const texto = (e: unknown) => `${e} ${(e as Error)?.cause}`;
export const esDuplicado = (e: unknown) => texto(e).includes('UNIQUE');
export const violaCheck = (e: unknown, fragmento: string) => texto(e).includes('CHECK') && texto(e).includes(fragmento);
export const violaFk = (e: unknown) => texto(e).includes('FOREIGN KEY');

// Envuelve un alta o edición: convierte duplicados y referencias inválidas en errores legibles.
export async function guardando<T>(que: string, accion: () => Promise<T>): Promise<T> {
  try {
    return await accion();
  } catch (e) {
    if (esDuplicado(e)) throw new ErrorApp(409, `Ya existe ${que} con esos datos.`);
    if (violaFk(e)) throw new ErrorApp(400, `${que}: hace referencia a algo que no existe o que está en uso.`);
    if (texto(e).includes('CHECK')) throw new ErrorApp(400, `${que}: los datos no cumplen las reglas de la base.`);
    throw e;
  }
}
