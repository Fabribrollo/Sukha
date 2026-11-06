-- Datos iniciales. Se puede correr más de una vez: no pisa lo que ya existe.
-- Talles y colores son genéricos; se agregan más desde /admin/opciones.
-- Zonas de envío se cargan cuando estén definidas; el admin se crea con `npm run admin:crear`.

-- Valores decididos en el plan (secciones 10 y 11); se cambian desde el panel.
INSERT OR IGNORE INTO configuracion (clave, valor) VALUES
  ('reserva_mercado_pago_minutos', '30'),
  ('reserva_transferencia_horas', '48'),
  ('descuento_transferencia_porcentaje', '10'),
  ('cuotas_sin_interes', 'false'),
  ('alias_transferencia', '""'),
  -- Los pedidos se despachan desde Cipolletti.
  ('cp_origen', '"8324"');

INSERT OR IGNORE INTO talle (nombre, orden) VALUES
  ('XS', 1), ('S', 2), ('M', 3), ('L', 4), ('XL', 5), ('XXL', 6),
  ('36', 11), ('38', 12), ('40', 13), ('42', 14), ('44', 15), ('46', 16), ('48', 17);

INSERT OR IGNORE INTO color (nombre, hex) VALUES
  ('Negro', '#000000'), ('Blanco', '#FFFFFF'), ('Gris', '#808080'), ('Beige', '#D9C7A8'),
  ('Marrón', '#6B4423'), ('Azul', '#1F3A93'), ('Celeste', '#8EC5E8'), ('Verde', '#2E7D32'),
  ('Rojo', '#C62828'), ('Rosa', '#F4A6C0'), ('Amarillo', '#F2C94C'), ('Naranja', '#EF7D21'),
  ('Violeta', '#7B4BA8');

-- Categorías por defecto (ropa de mujer, propuesta del 2026-10-25). Se editan, reordenan y ocultan desde /admin/categorias.
INSERT OR IGNORE INTO categoria (nombre, slug, orden) VALUES ('Ropa', 'ropa', 1), ('Deportivo', 'deportivo', 2), ('Accesorios', 'accesorios', 3);

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
