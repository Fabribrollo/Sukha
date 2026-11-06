// Obtiene el `customerId` de MiCorreo (el que va en el secreto MICORREO_CUSTOMER_ID).
//   npm run micorreo:cliente -w @sukha/backend -- pruebas|produccion
// Pide por teclado el usuario y la clave de la API (los que mandó Correo Argentino) y el email y la contraseña de la
// cuenta de MiCorreo. Nada se guarda ni se imprime, salvo el resultado. Corre en tu compu: las claves no pasan por ningún chat.
//
// ponytail: el formato de /users/validate sale de la documentación (apiMiCorreo.pdf) leída en la investigación, no de una
// prueba real. Si Correo cambió algo, el script muestra la respuesta tal cual para ver qué campo es el customerId.
import { createInterface } from 'node:readline/promises';

const entorno = process.argv[2];
const URLS: Record<string, string> = {
  pruebas: 'https://apitest.correoargentino.com.ar/micorreo/v1',
  produccion: 'https://api.correoargentino.com.ar/micorreo/v1',
};
const base = URLS[entorno];
if (!base) {
  console.error('Uso: npm run micorreo:cliente -- pruebas|produccion');
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stderr });
// Las claves no se ven al escribirlas.
const original = (rl as any)._writeToOutput;
let ocultar = false;
(rl as any)._writeToOutput = (t: string) => (ocultar ? undefined : original.call(rl, t));
const preguntar = async (texto: string, secreto = false) => {
  process.stderr.write(texto);
  ocultar = secreto;
  const r = (await rl.question('')).trim();
  ocultar = false;
  if (secreto) process.stderr.write('\n');
  return r;
};

const usuario = await preguntar('Usuario de la API: ');
const clave = await preguntar('Clave de la API: ', true);
const email = await preguntar('Email de tu cuenta de MiCorreo: ');
const contrasena = await preguntar('Contraseña de tu cuenta de MiCorreo: ', true);
rl.close();

const t = await fetch(`${base}/token`, { method: 'POST', headers: { Authorization: `Basic ${btoa(`${usuario}:${clave}`)}` } });
if (!t.ok) {
  console.error(`No se pudo obtener el token (${t.status}). Revisá el usuario y la clave de la API, y que sean los de ${entorno}.`);
  process.exit(1);
}
const { token } = (await t.json()) as { token?: string };

const v = await fetch(`${base}/users/validate`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ email, password: contrasena }),
});
const cuerpo = await v.json().catch(() => null);
if (!v.ok) {
  console.error(`No se pudo validar la cuenta (${v.status}):`, JSON.stringify(cuerpo));
  process.exit(1);
}
console.log('\nRespuesta de MiCorreo:', JSON.stringify(cuerpo, null, 2));
console.log(`\ncustomerId: ${(cuerpo as any)?.customerId ?? '(no vino con ese nombre: mirá la respuesta de arriba)'}`);
