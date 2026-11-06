// Sugerencias de localidad y calle para el checkout, con Georef Argentina (https://apis.datos.gob.ar/georef), la API
// pública del Estado: gratis y sin clave. Georef no trae códigos postales ni valida alturas: las sugerencias ayudan a
// escribir bien, pero la clienta siempre puede escribir otra cosa. Si Georef falla o tarda, se devuelve null.
const BASE = 'https://apis.datos.gob.ar/georef/api';
const ESPERA_MS = 4000;

const PROVINCIAS = [
  'Buenos Aires', 'Ciudad Autónoma de Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja',
  'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
];
const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const provinciaValida = (p: string) => PROVINCIAS.find((x) => sinTildes(x).toLowerCase() === sinTildes(p).trim().toLowerCase()) ?? null;
// Los textos de Georef vienen en mayúsculas ("SAN MARTIN"): se pasan a "San Martin".
export const aTitulo = (t: string) => t.toLowerCase().replace(/(^|[\s.-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\b(De|Del|La|Las|Los|Y)\b(?!$)/g, (m, _x, i) => (i === 0 ? m : m.toLowerCase()));

export type Localidad = { nombre: string; detalle: string; censalId: string | null };
export type Calle = { nombre: string };

async function pedir(ruta: string, fetchFn: typeof fetch): Promise<any | null> {
  try {
    const r = await fetchFn(`${BASE}/${ruta}`, { headers: { 'user-agent': 'sukha-tienda/1.0' }, signal: AbortSignal.timeout(ESPERA_MS) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Devuelve null si Georef no respondió (distinto de una lista vacía, que es «no hay localidades con ese nombre»): el checkout
// deja escribir la localidad a mano solo cuando el servicio no está disponible.
export async function buscarLocalidades(provincia: string, q: string, fetchFn: typeof fetch = fetch): Promise<Localidad[] | null> {
  const prov = provinciaValida(provincia);
  const texto = q.trim();
  if (!prov || texto.length < 3 || texto.length > 40) return [];
  const campos = 'id,nombre,departamento.nombre,municipio.nombre,localidad_censal.id';
  const j = await pedir(`localidades?nombre=${encodeURIComponent(sinTildes(texto))}&provincia=${encodeURIComponent(sinTildes(prov))}&max=10&orden=nombre&aplanar=true&campos=${campos}`, fetchFn);
  if (!j) return null;
  // Georef repite una localidad como asentamiento y como localidad censal: se queda una por nombre y departamento, con su id censal.
  const vistas = new Map<string, Localidad>();
  for (const l of (j?.localidades ?? []) as any[]) {
    const nombre = aTitulo(String(l.nombre ?? ''));
    if (!nombre) continue;
    const zona = aTitulo(String(l.departamento_nombre ?? l.municipio_nombre ?? ''));
    const clave = `${nombre}|${zona}`;
    const censalId = l.localidad_censal_id ? String(l.localidad_censal_id) : null;
    const previa = vistas.get(clave);
    if (!previa) vistas.set(clave, { nombre, detalle: zona && zona !== nombre ? zona : '', censalId });
    else if (!previa.censalId && censalId) previa.censalId = censalId;
  }
  return [...vistas.values()].slice(0, 8);
}

export async function buscarCalles(provincia: string, q: string, censalId: string | null, fetchFn: typeof fetch = fetch): Promise<Calle[] | null> {
  const prov = provinciaValida(provincia);
  const texto = q.trim();
  if (!prov || texto.length < 3 || texto.length > 40) return [];
  // Con la localidad elegida las calles son de esa localidad; sin ella, de toda la provincia.
  const donde = censalId && /^\d{5,12}$/.test(censalId) ? `localidad_censal=${censalId}` : `provincia=${encodeURIComponent(sinTildes(prov))}`;
  const j = await pedir(`calles?nombre=${encodeURIComponent(sinTildes(texto))}&${donde}&max=30&orden=nombre&aplanar=true&campos=nombre`, fetchFn);
  if (!j) return null;
  const nombres = new Set<string>();
  for (const c of (j.calles ?? []) as any[]) {
    const nombre = aTitulo(String(c.nombre ?? ''));
    if (nombre) nombres.add(nombre);
  }
  return [...nombres].slice(0, 8).map((nombre) => ({ nombre }));
}
