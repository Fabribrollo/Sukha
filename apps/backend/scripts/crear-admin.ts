// Crea (o le cambia la contraseña a) un usuario admin. La contraseña se pide por teclado y no se guarda.
//   npm run admin:crear -w @sukha/backend -- local|staging|prod email "Nombre"
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { hashContrasena } from '../src/utils/crypto.ts';

const [entorno, email, nombre] = process.argv.slice(2);
const destinos: Record<string, string[]> = {
  local: ['sukha', '--local'],
  staging: ['sukha-staging', '--env', 'staging', '--remote'],
  prod: ['sukha', '--remote'],
};
const destino = destinos[entorno];
if (!destino || !email?.includes('@') || !nombre) {
  console.error('Uso: npm run admin:crear -- local|staging|prod email "Nombre"');
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stderr });
const contrasena = (await rl.question('Contraseña (mínimo 12 caracteres, se ve al escribir): ')).trim();
// En producción se pide confirmar a mano: este comando escribe en la base real.
if (entorno === 'prod') {
  const ok = (await rl.question('Esto escribe en la base de PRODUCCIÓN. Escribí "produccion" para seguir: ')).trim().toLowerCase();
  if (ok !== 'produccion') {
    console.error('Cancelado: no se tocó nada.');
    process.exit(1);
  }
}
rl.close();
if (contrasena.length < 12) {
  console.error('La contraseña tiene que tener al menos 12 caracteres.');
  process.exit(1);
}

// Email y nombre van como texto SQL: se restringen para que no puedan romper la consulta ni el shell.
const seguro = /^[\p{L}\p{N} .@_+-]+$/u;
if (!seguro.test(email) || !seguro.test(nombre)) {
  console.error('Email y nombre solo pueden tener letras, números, espacios y . @ _ + -');
  process.exit(1);
}
const hash = await hashContrasena(contrasena); // solo hex, $ y letras
const sql =
  `INSERT INTO admin (email, nombre, hash_contrasena) VALUES ('${email.trim().toLowerCase()}', '${nombre}', '${hash}') ` +
  'ON CONFLICT (email) DO UPDATE SET nombre = excluded.nombre, hash_contrasena = excluded.hash_contrasena, activo = 1;\n' +
  // Cambiar la contraseña cierra todas las sesiones abiertas de ese usuario.
  `DELETE FROM sesion WHERE admin_id = (SELECT id FROM admin WHERE email = '${email.trim().toLowerCase()}');`;

// El SQL va por archivo temporal: evita problemas de comillas y de `$` en la línea de comandos.
const dir = mkdtempSync(join(tmpdir(), 'sukha-admin-'));
const archivo = join(dir, 'admin.sql');
writeFileSync(archivo, sql);
const r = spawnSync('npx', ['wrangler', 'd1', 'execute', ...destino, '--yes', '--file', `"${archivo}"`], {
  stdio: ['ignore', 'ignore', 'inherit'],
  shell: true,
});
rmSync(dir, { recursive: true });
console.error(r.status === 0 ? `Admin ${email} listo en ${entorno}.` : 'No se pudo crear el admin.');
process.exit(r.status ?? 1);
