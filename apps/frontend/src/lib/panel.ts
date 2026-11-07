// Utilidades de las páginas del panel: leer formularios, mostrar montos y fechas, nombres de estados.
import { TRANSICIONES } from '../../../backend/src/compartido';

// ───────────── Formularios ─────────────

export const txt = (f: FormData, campo: string) => String(f.get(campo) ?? '').trim() || null;
export const entero = (f: FormData, campo: string) => {
  const valor = txt(f, campo);
  return valor !== null && /^-?\d+$/.test(valor) ? Number(valor) : null;
};
export const marcado = (f: FormData, campo: string) => f.get(campo) !== null;

// "18.500,50", "18500,5" o "18500" → 1850050 centavos. Devuelve null si está vacío y NaN si no se entiende.
export function centavos(f: FormData, campo: string) {
  const valor = txt(f, campo);
  if (valor === null) return null;
  const limpio = valor.replace(/[$\s]/g, '');
  const normal = limpio.includes(',') ? limpio.replace(/\./g, '').replace(',', '.') : /^\d+\.\d{1,2}$/.test(limpio) ? limpio : limpio.replace(/\./g, '');
  return /^\d+(\.\d{1,2})?$/.test(normal) ? Math.round(Number(normal) * 100) : NaN;
}

// Resultado de una acción del panel: si falló, trae el mensaje para mostrar.
export async function errorDe(r: Response) {
  if (r.ok) return '';
  const cuerpo = (await r.json().catch(() => null)) as { error?: string } | null;
  return cuerpo?.error ?? 'No se pudo guardar.';
}

// ───────────── Cómo se muestran las cosas ─────────────

export const pesos = (c: number | null | undefined) =>
  c == null ? '' : `$ ${(c / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Para precargar un campo de precio: 1850050 → "18500,50"
export const enCampo = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));

const ZONA = 'America/Argentina/Cordoba';
export const fecha = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('es-AR', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
export const dia = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
// Fecha ISO → valor para <input type="datetime-local"> en hora de Argentina (UTC-3, sin horario de verano).
export const paraCampoFecha = (iso: string | null | undefined) =>
  iso ? new Date(new Date(iso).getTime() - 3 * 3_600_000).toISOString().slice(0, 16) : '';
export const deCampoFecha = (valor: string | null) => (valor ? new Date(`${valor}:00-03:00`).toISOString() : null);

export const ESTADOS: Record<string, string> = {
  pendiente_pago: 'Esperando pago',
  pagado: 'Pagado',
  en_preparacion: 'En preparación',
  enviado: 'Enviado',
  listo_para_retirar: 'Listo para retirar',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
  reembolsado: 'Reembolsado',
  a_revisar: 'A revisar',
};

// A qué estados se puede pasar desde cada uno: la misma regla que aplica el backend (apps/backend/src/compartido.ts).
export const SIGUIENTES: Record<string, string[] | undefined> = TRANSICIONES;

// Texto del botón que lleva a cada estado.
export const ACCIONES: Record<string, string> = {
  pagado: 'Marcar como pagado',
  en_preparacion: 'Pasar a preparación',
  enviado: 'Marcar como enviado',
  listo_para_retirar: 'Listo para retirar',
  entregado: 'Marcar como entregado',
  cancelado: 'Cancelar pedido',
  reembolsado: 'Registrar reembolso',
  a_revisar: 'Dejar a revisar',
};

export const ENTREGAS: Record<string, string> = { domicilio: 'Envío a domicilio', sucursal: 'Envío a sucursal', retiro: 'Retiro en persona' };
export const PAGOS: Record<string, string> = { mercadopago: 'Mercado Pago', transferencia: 'Transferencia' };
// Ventas cargadas a mano en el panel (las de la tienda son «web» y no llevan marca).
export const CANALES: Record<string, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', otro: 'Venta manual' };
export const TRANSPORTES: Record<string, string> = { correo_argentino: 'Correo Argentino', andreani: 'Andreani' };
export const ESTADOS_PRODUCTO: Record<string, string> = { borrador: 'Borrador', publicado: 'Publicado', oculto: 'Oculto' };
export const MOVIMIENTOS: Record<string, string> = {
  carga: 'Carga',
  reserva: 'Reserva de pedido',
  liberacion: 'Reserva liberada',
  devolucion: 'Devolución',
  ajuste: 'Ajuste',
  venta_local: 'Venta en el local',
};

export const foto = (clave: string | null | undefined, tamano = 'chico') => (clave ? `/api/imagenes/${clave}/${tamano}.webp` : null);

// Categorías para un <select>: cada principal seguida de sus subcategorías, con el camino completo ("Ropa › Vestidos").
export function categoriasParaElegir(categorias: { id: number; nombre: string; padreId: number | null }[]) {
  const principales = categorias.filter((c) => !c.padreId);
  return principales.flatMap((p) => [
    { id: p.id, etiqueta: p.nombre, corto: p.nombre, padreId: null as number | null },
    ...categorias.filter((h) => h.padreId === p.id).map((h) => ({ id: h.id, etiqueta: `${p.nombre} › ${h.nombre}`, corto: h.nombre, padreId: p.id as number | null })),
  ]);
}
