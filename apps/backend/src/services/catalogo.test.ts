import { drizzle } from 'drizzle-orm/d1';
import { expect, test } from 'vitest';
import { producto } from '../db/schema';
import { nombreContiene } from './catalogo.service';

// La consulta que arma Drizzle se corre en SQLite real (en memoria), que trata LIKE y ESCAPE igual que D1.
const { DatabaseSync } = await import('node:sqlite' as string);

test('buscar "50%" no toma el % como comodín', () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE producto (id INTEGER PRIMARY KEY, nombre TEXT)');
  for (const n of ['Remera 50% algodón', 'Remera 500', 'Buzo 50_50', 'Buzo 5050', 'Top a\\b']) sqlite.prepare('INSERT INTO producto (nombre) VALUES (?)').run(n);
  const buscar = (q: string) => {
    const { sql, params } = drizzle({} as D1Database).select({ nombre: producto.nombre }).from(producto).where(nombreContiene(q)).toSQL();
    return sqlite.prepare(sql).all(...params).map((f: { nombre: string }) => f.nombre);
  };
  expect(buscar('50%')).toEqual(['Remera 50% algodón']);
  expect(buscar('50_5')).toEqual(['Buzo 50_50']);
  expect(buscar('a\\b')).toEqual(['Top a\\b']);
  expect(buscar('remera')).toEqual(['Remera 50% algodón', 'Remera 500']);
});
