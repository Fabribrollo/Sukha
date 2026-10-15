// Datos, validaciones y almacenamiento del checkout. Las reglas son las mismas que aplica el backend
// (ver NuevoPedido en apps/backend/src/validations/tienda.validation.ts): el servidor siempre las vuelve a revisar.

export const PROVINCIAS = [
  'Buenos Aires', 'Ciudad Autónoma de Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja',
  'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
];

export const CONDICIONES_IVA: Record<string, string> = {
  consumidor_final: 'Consumidor final',
  monotributo: 'Monotributo',
  responsable_inscripto: 'Responsable inscripto',
  exento: 'Exento',
};

export type Datos = {
  email: string;
  aceptaNovedades: boolean;
  codigoPostal: string;
  // Opción de envío elegida (id de zona), o null si es retiro o todavía no eligió.
  zonaEnvioId: number | null;
  retiro: boolean;
  nombre: string;
  telefono: string;
  dni: string;
  calle: string;
  altura: string;
  pisoDepto: string;
  localidad: string;
  provincia: string;
  indicaciones: string;
  sucursal: string;
  facturaA: boolean;
  cuit: string;
  condicionIva: string;
  metodoPago: 'mercadopago' | 'transferencia';
  cupon: string;
  acepta: boolean;
};

export const datosVacios: Datos = {
  email: '', aceptaNovedades: false, codigoPostal: '', zonaEnvioId: null, retiro: false, nombre: '', telefono: '', dni: '', calle: '', altura: '', pisoDepto: '',
  localidad: '', provincia: '', indicaciones: '', sucursal: '', facturaA: false, cuit: '', condicionIva: 'responsable_inscripto', metodoPago: 'mercadopago', cupon: '', acepta: false,
};

// ───────────── Almacenamiento (se guarda mientras dura la pestaña, para no perder lo escrito si se recarga) ─────────────
const CLAVE_DATOS = 'sukha:checkout';
const CLAVE_PEDIDO = 'sukha:clave-pedido';
const CLAVE_ULTIMOS = 'sukha:ultimos-pedidos';

const sesion = {
  leer: (clave: string) => {
    try {
      return sessionStorage.getItem(clave);
    } catch {
      return null;
    }
  },
  escribir: (clave: string, valor: string) => {
    try {
      sessionStorage.setItem(clave, valor);
    } catch {
      /* sin almacenamiento: se pierde al recargar, nada más */
    }
  },
  borrar: (clave: string) => {
    try {
      sessionStorage.removeItem(clave);
    } catch {
      /* igual */
    }
  },
};

export function cargarDatos(): Datos {
  try {
    return { ...datosVacios, ...JSON.parse(sesion.leer(CLAVE_DATOS) ?? '{}') };
  } catch {
    return { ...datosVacios };
  }
}
// El código del cupón y los datos fiscales no se guardan: no hay razón para dejarlos en el navegador.
export const guardarDatos = (d: Datos) => sesion.escribir(CLAVE_DATOS, JSON.stringify({ ...d, acepta: false, cupon: '', cuit: '' }));

// Una clave por intento de compra: si el pedido se manda dos veces (doble clic, mala conexión), no se crea dos veces.
export function claveDelPedido() {
  let clave = sesion.leer(CLAVE_PEDIDO);
  if (!clave) {
    clave = crypto.randomUUID().replaceAll('-', '');
    sesion.escribir(CLAVE_PEDIDO, clave);
  }
  return clave;
}

export function terminarCompra(pedido: { numero: string; token: string }) {
  sesion.borrar(CLAVE_PEDIDO);
  sesion.borrar(CLAVE_DATOS);
  try {
    const anteriores = JSON.parse(localStorage.getItem(CLAVE_ULTIMOS) ?? '[]') as { numero: string; token: string }[];
    const lista = [{ ...pedido, fecha: new Date().toISOString() }, ...anteriores.filter((p) => p.token !== pedido.token)].slice(0, 5);
    localStorage.setItem(CLAVE_ULTIMOS, JSON.stringify(lista));
  } catch {
    /* sin almacenamiento: igual puede buscar su pedido por número y email */
  }
}

// ───────────── Validaciones ─────────────
export type Errores = Record<string, string>;
export type Modalidad = 'domicilio' | 'sucursal' | 'retiro';

export const soloDigitos = (t: string) => t.replace(/\D/g, '');
export const cpValido = (t: string) => /^[A-Z]?\d{4}[A-Z]{0,3}$/i.test(t.trim());

export function erroresContacto(d: Datos): Errores {
  const e: Errores = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim())) e.email = 'Escribí un email válido, por ejemplo nombre@correo.com.';
  return e;
}

export function erroresEntrega(d: Datos, modalidad: Modalidad | null): Errores {
  const e: Errores = {};
  if (!cpValido(d.codigoPostal)) e.codigoPostal = 'Escribí los 4 números de tu código postal.';
  else if (!modalidad) e.envio = 'Elegí cómo querés recibir tu compra.';
  if (d.nombre.trim().length < 2) e.nombre = 'Escribí tu nombre y apellido.';
  if (!/^[0-9+() -]{6,25}$/.test(d.telefono.trim())) e.telefono = 'Escribí un teléfono, solo con números.';
  if (!/^\d{7,8}$/.test(soloDigitos(d.dni))) e.dni = 'El DNI tiene 7 u 8 números.';
  if (modalidad === 'domicilio') {
    if (!d.calle.trim()) e.calle = 'Escribí la calle.';
    if (!d.altura.trim()) e.altura = 'Escribí la altura.';
    if (!d.localidad.trim()) e.localidad = 'Escribí la localidad.';
  }
  if (modalidad === 'sucursal' && !d.sucursal.trim()) e.sucursal = 'Escribí el nombre o la dirección de la sucursal.';
  if (modalidad === 'domicilio' || modalidad === 'sucursal') {
    if (!d.provincia) e.provincia = 'Elegí la provincia.';
  }
  if (d.facturaA && !/^\d{11}$/.test(soloDigitos(d.cuit))) e.cuit = 'El CUIT tiene 11 números.';
  return e;
}

export const erroresPago = (d: Datos): Errores => (d.acepta ? {} : { acepta: 'Tenés que aceptar los términos para finalizar la compra.' });
