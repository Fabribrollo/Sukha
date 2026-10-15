import { ErrorApp } from '../utils/errores';
import { CONFIGURACION, type ClaveConfig, type Configuracion, esClaveContenido } from '../validations/tienda.validation';

type Fila = { clave: string; valor: string };

const filas = (d1: D1Database) =>
  d1
    .prepare('SELECT clave, valor FROM configuracion')
    .all<Fila>()
    .then((r) => r.results);

// Devuelve todas las claves conocidas; las que faltan o están mal guardadas toman su valor por defecto.
export async function leerConfiguracion(d1: D1Database): Promise<Configuracion> {
  const guardado = Object.fromEntries((await filas(d1)).map((f) => [f.clave, JSON.parse(f.valor)]));
  const config: Record<string, unknown> = {};
  for (const [clave, regla] of Object.entries(CONFIGURACION)) {
    const leido = regla.safeParse(guardado[clave]);
    config[clave] = leido.success ? leido.data : regla.parse(undefined);
  }
  return config as Configuracion;
}

// Textos y banners editables de la tienda (claves "contenido_*").
export async function leerContenido(d1: D1Database) {
  return Object.fromEntries(
    (await filas(d1)).filter((f) => esClaveContenido(f.clave)).map((f) => [f.clave, JSON.parse(f.valor)]),
  );
}

export async function guardarConfiguracion(d1: D1Database, clave: string, valor: unknown) {
  let limpio = valor;
  if (clave in CONFIGURACION) {
    const leido = CONFIGURACION[clave as ClaveConfig].safeParse(valor);
    if (!leido.success) throw new ErrorApp(400, `${clave}: ${leido.error.issues[0].message}`);
    limpio = leido.data;
  } else if (!esClaveContenido(clave) || valor === undefined) {
    throw new ErrorApp(400, `"${clave}" no es una clave de configuración conocida.`);
  }
  await d1
    .prepare('INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor')
    .bind(clave, JSON.stringify(limpio))
    .run();
  return { clave, valor: limpio };
}
