-- Datos iniciales. Se puede correr más de una vez: no pisa lo que ya existe.
-- Talles y colores son genéricos; se agregan más desde /admin/opciones.
-- Zonas de envío se cargan cuando estén definidas; el admin se crea con `npm run admin:crear`.

-- Valores decididos en el plan (secciones 10 y 11); se cambian desde el panel.
INSERT OR IGNORE INTO configuracion (clave, valor) VALUES
  ('reserva_mercado_pago_minutos', '30'),
  ('reserva_transferencia_horas', '48'),
  ('descuento_transferencia_porcentaje', '10'),
  ('cuotas_sin_interes', 'false'),
  ('alias_transferencia', '""');

INSERT OR IGNORE INTO talle (nombre, orden) VALUES
  ('XS', 1), ('S', 2), ('M', 3), ('L', 4), ('XL', 5), ('XXL', 6),
  ('36', 11), ('38', 12), ('40', 13), ('42', 14), ('44', 15), ('46', 16), ('48', 17);

INSERT OR IGNORE INTO color (nombre, hex) VALUES
  ('Negro', '#000000'), ('Blanco', '#FFFFFF'), ('Gris', '#808080'), ('Beige', '#D9C7A8'),
  ('Marrón', '#6B4423'), ('Azul', '#1F3A93'), ('Celeste', '#8EC5E8'), ('Verde', '#2E7D32'),
  ('Rojo', '#C62828'), ('Rosa', '#F4A6C0'), ('Amarillo', '#F2C94C'), ('Naranja', '#EF7D21'),
  ('Violeta', '#7B4BA8');

-- Categorías por defecto (ropa de mujer). Se editan, reordenan y ocultan desde /admin/categorias.
INSERT OR IGNORE INTO categoria (nombre, slug, orden) VALUES
  ('Ropa', 'ropa', 1), ('Accesorios', 'accesorios', 2), ('Descanso', 'descanso', 3);

-- Subcategorías: cuelgan de la categoría principal por su slug.
INSERT OR IGNORE INTO categoria (nombre, slug, orden, padre_id) VALUES
  ('Remeras y tops', 'remeras-y-tops', 1, (SELECT id FROM categoria WHERE slug = 'ropa')),
  ('Camisas y blusas', 'camisas-y-blusas', 2, (SELECT id FROM categoria WHERE slug = 'ropa')),
  ('Vestidos', 'vestidos', 3, (SELECT id FROM categoria WHERE slug = 'ropa')),
  ('Polleras', 'polleras', 4, (SELECT id FROM categoria WHERE slug = 'ropa')),
  ('Pantalones', 'pantalones', 5, (SELECT id FROM categoria WHERE slug = 'ropa')),
  ('Shorts', 'shorts', 6, (SELECT id FROM categoria WHERE slug = 'ropa')),
  ('Buzos y sweaters', 'buzos-y-sweaters', 7, (SELECT id FROM categoria WHERE slug = 'ropa')),
  ('Camperas y abrigos', 'camperas-y-abrigos', 8, (SELECT id FROM categoria WHERE slug = 'ropa')),
  ('Conjuntos', 'conjuntos', 9, (SELECT id FROM categoria WHERE slug = 'ropa')),
  ('Carteras y bolsos', 'carteras-y-bolsos', 1, (SELECT id FROM categoria WHERE slug = 'accesorios')),
  ('Cinturones', 'cinturones', 2, (SELECT id FROM categoria WHERE slug = 'accesorios')),
  ('Pañuelos y bufandas', 'panuelos-y-bufandas', 3, (SELECT id FROM categoria WHERE slug = 'accesorios')),
  ('Bijouterie', 'bijouterie', 4, (SELECT id FROM categoria WHERE slug = 'accesorios')),
  ('Pijamas', 'pijamas', 1, (SELECT id FROM categoria WHERE slug = 'descanso')),
  ('Camisones', 'camisones', 2, (SELECT id FROM categoria WHERE slug = 'descanso')),
  ('Ropa interior', 'ropa-interior', 3, (SELECT id FROM categoria WHERE slug = 'descanso'));
