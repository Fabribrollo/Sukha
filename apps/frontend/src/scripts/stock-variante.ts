// Stock de una variante en la ficha del producto: al cambiar el número (salir del campo o Enter) se guarda solo, como «ajuste».
for (const campo of document.querySelectorAll<HTMLInputElement>('input[data-stock]'))
  campo.addEventListener('change', () => campo.form?.requestSubmit());

// Borrar una variante pide confirmación y explica qué pasa si ya se vendió.
import { confirmar } from './dialogo-panel';
for (const form of document.querySelectorAll<HTMLFormElement>('form[data-confirmar-variante]'))
  form.addEventListener('submit', async (e) => {
    if (form.dataset.ok) return;
    e.preventDefault();
    if (!(await confirmar(`¿Borrar la variante «${form.dataset.confirmarVariante}»?\n\nSe borra con su historial de stock. Si ya tuvo ventas no se puede borrar (perderías el historial de esos pedidos): en ese caso queda pausada y deja de venderse.`))) return;
    form.dataset.ok = '1';
    form.requestSubmit();
  });
