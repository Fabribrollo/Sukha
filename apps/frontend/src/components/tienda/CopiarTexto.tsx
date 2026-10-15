// Botón que copia un texto (el alias, el número de seguimiento) y confirma con un "¡Copiado!".
import { Check, Copy } from 'lucide-preact';
import { useState } from 'preact/hooks';

export default function CopiarTexto({ texto, etiqueta = 'Copiar' }: { texto: string; etiqueta?: string }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Sin permiso para el portapapeles (por ejemplo, en una página sin HTTPS): se selecciona un campo temporal.
      const campo = document.createElement('textarea');
      campo.value = texto;
      campo.style.position = 'fixed';
      campo.style.opacity = '0';
      document.body.append(campo);
      campo.select();
      document.execCommand('copy');
      campo.remove();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <button type="button" onClick={copiar} class="boton boton-secundario min-h-11 px-4" aria-live="polite">
      {copiado ? <Check class="text-exito size-4" aria-hidden="true" /> : <Copy class="size-4" aria-hidden="true" />}
      {copiado ? '¡Copiado!' : etiqueta}
    </button>
  );
}
