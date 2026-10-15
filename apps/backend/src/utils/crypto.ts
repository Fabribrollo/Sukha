// Contraseñas con PBKDF2 (WebCrypto) y sesiones con token aleatorio; en la base se guarda solo el hash.
const ITERACIONES = 100_000; // el máximo que acepta WebCrypto en Workers
const enc = new TextEncoder();

const aHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const deHex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));

async function derivar(contrasena: string, sal: Uint8Array, iteraciones: number) {
  const clave = await crypto.subtle.importKey('raw', enc.encode(contrasena), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones },
    clave,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashContrasena(contrasena: string) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERACIONES}$${aHex(sal)}$${aHex(await derivar(contrasena, sal, ITERACIONES))}`;
}

export async function verificarContrasena(contrasena: string, guardado: string) {
  const [algoritmo, iteraciones, sal, hash] = guardado.split('$');
  if (algoritmo !== 'pbkdf2' || !sal || !hash) return false;
  const a = await derivar(contrasena, deHex(sal), Number(iteraciones));
  const b = deHex(hash);
  if (a.length !== b.length) return false;
  let distinto = 0; // comparación en tiempo constante
  for (let i = 0; i < a.length; i++) distinto |= a[i] ^ b[i];
  return distinto === 0;
}

export const nuevoToken = () => aHex(crypto.getRandomValues(new Uint8Array(32)));

export async function sha256Hex(texto: string) {
  return aHex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(texto))));
}
