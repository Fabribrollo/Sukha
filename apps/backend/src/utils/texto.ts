// "Remera Básica Ñandú" → "remera-basica-nandu"
export const aSlug = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// El número visible del pedido se arma a partir del id: 12 → "SUK-0012".
export const numeroPedido = (id: number) => `SUK-${String(id).padStart(4, '0')}`;

// 1234500 → "$ 12.345,00"
export const enPesos = (centavos: number) =>
  `$ ${(centavos / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Para insertar texto de terceros (nombres, direcciones) en el HTML de los emails.
export const escaparHtml = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Los 4 dígitos del código postal, acepte "5000" o el CPA "X5000ABC".
export function digitosCp(codigoPostal: string) {
  const digitos = codigoPostal.match(/\d{4}/)?.[0];
  return digitos ? Number(digitos) : null;
}
