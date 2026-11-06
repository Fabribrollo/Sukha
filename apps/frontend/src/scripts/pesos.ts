// Campos de precio (<input data-pesos>): mientras se escribe se agregan solos los puntos de miles ("18500" → "18.500").
// La coma separa los centavos (hasta dos). El cursor se mantiene en su lugar aunque se agreguen o saquen puntos.

export function formatearPesos(entrada: HTMLInputElement) {
  const antes = entrada.value;
  const cursor = entrada.selectionStart ?? antes.length;
  // Cuántos dígitos y comas había a la izquierda del cursor: el cursor vuelve a quedar detrás de esa misma cantidad.
  const significativos = antes.slice(0, cursor).replace(/[^\d,]/g, '').length;
  const partes = antes.replace(/[^\d,]/g, '').split(',');
  const entero = partes[0].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const nuevo = partes.length > 1 ? `${entero},${partes.slice(1).join('').slice(0, 2)}` : entero;
  if (nuevo === antes) return;
  entrada.value = nuevo;
  let i = 0;
  for (let vistos = 0; i < nuevo.length && vistos < significativos; i++) if (/[\d,]/.test(nuevo[i])) vistos++;
  if (document.activeElement === entrada) entrada.setSelectionRange(i, i);
}

document.addEventListener('input', (e) => {
  const campo = e.target as HTMLInputElement;
  if (campo.matches?.('[data-pesos]')) formatearPesos(campo);
});
for (const campo of document.querySelectorAll<HTMLInputElement>('input[data-pesos]')) formatearPesos(campo);
