import { drizzle } from 'drizzle-orm/d1';
import { expect, test } from 'vitest';
import { cabeceraResuelta } from './cabecera.service';

// D1 mínimo sobre SQLite en memoria: alcanza para las consultas de Drizzle y la lectura de `configuracion`.
const { DatabaseSync } = await import('node:sqlite' as string);
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`
CREATE TABLE configuracion (clave TEXT PRIMARY KEY, valor TEXT);
CREATE TABLE categoria (id INTEGER PRIMARY KEY, nombre TEXT, slug TEXT, padre_id INTEGER, clave_imagen TEXT, orden INTEGER DEFAULT 0, activa INTEGER DEFAULT 1);
CREATE TABLE coleccion (id INTEGER PRIMARY KEY, nombre TEXT, slug TEXT, activa INTEGER DEFAULT 1);
CREATE TABLE producto (id INTEGER PRIMARY KEY, categoria_id INTEGER, estado TEXT);
CREATE TABLE producto_coleccion (producto_id INTEGER, coleccion_id INTEGER);
CREATE TABLE imagen (id INTEGER PRIMARY KEY, producto_id INTEGER, clave TEXT, orden INTEGER DEFAULT 0);
INSERT INTO categoria (id, nombre, slug, padre_id) VALUES (1,'Ropa','ropa',NULL),(2,'Vestidos','vestidos',1),(3,'Vacía','vacia',NULL);
INSERT INTO coleccion (id, nombre, slug) VALUES (1,'Verano','verano'),(2,'Invierno','invierno');
INSERT INTO producto (id, categoria_id, estado) VALUES (1,2,'borrador');
INSERT INTO producto_coleccion VALUES (1,1);
`);
const stmt = (sql: string, params: unknown[] = []) => ({
  bind: (...p: unknown[]) => stmt(sql, p),
  all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
  raw: async () => {
    const s = sqlite.prepare(sql);
    s.setReturnArrays(true);
    return s.all(...params);
  },
  run: async () => sqlite.prepare(sql).run(...params),
});
const d1 = { prepare: (sql: string) => stmt(sql) } as unknown as D1Database;
const nombres = async () => {
  const r = await cabeceraResuelta(drizzle(d1), d1);
  return r.items.filter((i) => i.tipo !== 'enlace').map((i) => `${i.tipo}:${i.texto}`);
};

test('el menú oculta categorías y colecciones sin productos publicados, y vuelven al publicar', async () => {
  expect(await nombres()).toEqual([]);
  sqlite.exec(`UPDATE producto SET estado = 'publicado' WHERE id = 1`);
  // La principal cuenta los productos de su hija; «Vacía» e «Invierno» siguen fuera.
  expect(await nombres()).toEqual(['panel:Ropa', 'colecciones:Colecciones']);
  const r = await cabeceraResuelta(drizzle(d1), d1);
  expect(JSON.stringify(r)).not.toMatch(/vacia|invierno/);
});
