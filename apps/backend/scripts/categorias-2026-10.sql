-- Cambio de categorías y colecciones (2026-10-25, propuesta aprobada por Fabrizio). Se corrió una vez en staging:
--   npx wrangler d1 execute sukha-staging --env staging --remote --file scripts/categorias-2026-10.sql
-- Las bases nuevas arrancan directo con esta estructura desde seed.sql.
-- Solo borra categorías y colecciones sin productos: si alguna tuviera, la base lo rechaza y no se toca nada.

-- Fuera las subcategorías viejas, Descanso y la colección de prueba.
DELETE FROM categoria WHERE padre_id IN (SELECT id FROM categoria WHERE slug IN ('ropa', 'accesorios', 'descanso'))
  AND NOT EXISTS (SELECT 1 FROM producto p WHERE p.categoria_id = categoria.id);
DELETE FROM categoria WHERE slug = 'descanso' AND NOT EXISTS (SELECT 1 FROM producto p WHERE p.categoria_id = categoria.id);
DELETE FROM coleccion WHERE slug = 'verano' AND NOT EXISTS (SELECT 1 FROM producto_coleccion pc WHERE pc.coleccion_id = coleccion.id);

-- Principales: Ropa, Deportivo y Accesorios.
INSERT OR IGNORE INTO categoria (nombre, slug, orden) VALUES ('Ropa', 'ropa', 1), ('Deportivo', 'deportivo', 2), ('Accesorios', 'accesorios', 3);
UPDATE categoria SET orden = 1, activa = 1 WHERE slug = 'ropa';
UPDATE categoria SET orden = 2, activa = 1 WHERE slug = 'deportivo';
UPDATE categoria SET orden = 3, activa = 1 WHERE slug = 'accesorios';

INSERT OR IGNORE INTO categoria (nombre, slug, orden, padre_id) VALUES
  ('Vestidos', 'vestidos', 1, (SELECT id FROM categoria WHERE slug = 'ropa')),
  ('Conjuntos', 'conjuntos', 2, (SELECT id FROM categoria WHERE slug = 'ropa')),
  ('Camisas y blusas', 'camisas-y-blusas', 3, (SELECT id FROM categoria WHERE slug = 'ropa')),
  ('Remeras y tops', 'remeras-y-tops', 4, (SELECT id FROM categoria WHERE slug = 'ropa')),
  ('Suéteres y tejidos', 'sueteres-y-tejidos', 5, (SELECT id FROM categoria WHERE slug = 'ropa')),
  ('Pantalones', 'pantalones', 6, (SELECT id FROM categoria WHERE slug = 'ropa')),
  ('Polleras y shorts', 'polleras-y-shorts', 7, (SELECT id FROM categoria WHERE slug = 'ropa')),
  ('Chalecos', 'chalecos', 8, (SELECT id FROM categoria WHERE slug = 'ropa')),
  ('Abrigos y camperas', 'abrigos-y-camperas', 9, (SELECT id FROM categoria WHERE slug = 'ropa')),
  -- Deportivo repite nombres de Ropa (Conjuntos, Shorts…): el slug lleva «deportivo» para no chocar.
  ('Abrigos', 'deportivo-abrigos', 1, (SELECT id FROM categoria WHERE slug = 'deportivo')),
  ('Calzas', 'calzas', 2, (SELECT id FROM categoria WHERE slug = 'deportivo')),
  ('Shorts', 'deportivo-shorts', 3, (SELECT id FROM categoria WHERE slug = 'deportivo')),
  ('Tops', 'deportivo-tops', 4, (SELECT id FROM categoria WHERE slug = 'deportivo')),
  ('Conjuntos', 'deportivo-conjuntos', 5, (SELECT id FROM categoria WHERE slug = 'deportivo')),
  ('Carteras', 'carteras', 1, (SELECT id FROM categoria WHERE slug = 'accesorios')),
  ('Cintos', 'cintos', 2, (SELECT id FROM categoria WHERE slug = 'accesorios')),
  ('Aros', 'aros', 3, (SELECT id FROM categoria WHERE slug = 'accesorios')),
  ('Collares', 'collares', 4, (SELECT id FROM categoria WHERE slug = 'accesorios')),
  ('Guantes', 'guantes', 5, (SELECT id FROM categoria WHERE slug = 'accesorios')),
  ('Bufandas y ruanas', 'bufandas-y-ruanas', 6, (SELECT id FROM categoria WHERE slug = 'accesorios')),
  ('Gorros', 'gorros', 7, (SELECT id FROM categoria WHERE slug = 'accesorios')),
  ('Otros', 'accesorios-otros', 8, (SELECT id FROM categoria WHERE slug = 'accesorios'));

-- Colecciones: ocasión o selección, no tipo de prenda.
INSERT OR IGNORE INTO coleccion (nombre, slug) VALUES
  ('Novedades', 'novedades'), ('Sale', 'sale'), ('Fiesta y salidas', 'fiesta-y-salidas'), ('Más vendidos', 'mas-vendidos');
