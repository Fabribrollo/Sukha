import { expect, test } from 'vitest';
import { hashContrasena, verificarContrasena } from './crypto';

test('la contraseña correcta verifica y la incorrecta no', async () => {
  const hash = await hashContrasena('una-clave-larga');
  expect(hash).not.toContain('una-clave-larga');
  expect(await verificarContrasena('una-clave-larga', hash)).toBe(true);
  expect(await verificarContrasena('otra-clave', hash)).toBe(false);
  expect(await verificarContrasena('una-clave-larga', 'basura')).toBe(false);
});
