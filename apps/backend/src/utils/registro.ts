// Registros para Workers Logs (Cloudflare guarda lo que sale por consola): un objeto por línea con `evento` y, cuando
// hay, `pedido` con el número visible (SUK-0012). Así, en Workers Logs se filtra por número de pedido o por evento.
// Sin datos personales (nada de emails, nombres ni direcciones).
export function registrar(nivel: 'info' | 'warn' | 'error', evento: string, datos: Record<string, unknown> = {}) {
  const linea = { evento, ...datos };
  if (nivel === 'error') console.error(linea);
  else if (nivel === 'warn') console.warn(linea);
  else console.log(linea);
}

// El mensaje de un error cualquiera, corto, para registros y avisos.
export const mensajeDe = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 300);
