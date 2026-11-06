// Abre el modal de alta con el botón [data-alta="id-del-dialog"] y lo cierra con [data-cerrar]. Sin JavaScript no hay botón que abra nada.
for (const boton of document.querySelectorAll<HTMLElement>('[data-alta]')) {
  const ventana = document.getElementById(boton.dataset.alta!) as HTMLDialogElement | null;
  if (!ventana) continue;
  boton.addEventListener('click', () => {
    ventana.showModal();
    // Un [autofocus] (por ejemplo, la × de una ventana que solo se consulta) evita que el celular abra el teclado.
    (ventana.querySelector<HTMLElement>('[autofocus]') ?? ventana.querySelector<HTMLElement>('input:not([type=hidden]), select'))?.focus();
  });
  for (const cerrar of ventana.querySelectorAll('[data-cerrar]')) cerrar.addEventListener('click', () => ventana.close());
}
// Si el servidor devolvió un error, el modal vuelve a abrirse con lo que se había escrito.
document.querySelectorAll<HTMLDialogElement>('dialog[data-abrir]').forEach((v) => v.showModal());
// Editar en modal: el botón [data-editar="id-del-dialog"] lleva en data-datos un JSON {campo: valor}; se vuelcan en los campos
// del formulario del modal con ese name (casillas con true/false) y los [data-texto="campo"] muestran el valor como texto.
for (const boton of document.querySelectorAll<HTMLElement>('[data-editar]')) {
  const ventana = document.getElementById(boton.dataset.editar!) as HTMLDialogElement | null;
  if (!ventana) continue;
  boton.addEventListener('click', () => {
    const datos = JSON.parse(boton.dataset.datos ?? '{}') as Record<string, string | number | boolean | null>;
    for (const campo of ventana.querySelectorAll<HTMLInputElement>('input[name], select[name], textarea[name]')) {
      const valor = datos[campo.name];
      if (valor === undefined) continue;
      if (campo.type === 'checkbox') campo.checked = Boolean(valor);
      else campo.value = valor === null ? '' : String(valor);
      campo.dispatchEvent(new Event('change'));
    }
    for (const t of ventana.querySelectorAll<HTMLElement>('[data-texto]')) t.textContent = String(datos[t.dataset.texto!] ?? '');
    ventana.showModal();
  });
  for (const cerrar of ventana.querySelectorAll('[data-cerrar]')) cerrar.addEventListener('click', () => ventana.close());
}
