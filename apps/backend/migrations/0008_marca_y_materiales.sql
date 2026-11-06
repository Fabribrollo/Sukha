-- Marca o distribuidor de cada producto: dato solo del panel, nunca sale en la API pública.
CREATE TABLE marca (
  id     INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL COLLATE NOCASE UNIQUE
);
ALTER TABLE producto ADD COLUMN marca_id INTEGER REFERENCES marca(id);
CREATE INDEX producto_marca ON producto (marca_id);

-- Materiales: lista que se arma sola; cada producto elige uno o varios.
CREATE TABLE material (
  id     INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL COLLATE NOCASE UNIQUE
);
CREATE TABLE producto_material (
  producto_id INTEGER NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES material(id),
  PRIMARY KEY (producto_id, material_id)
);
CREATE INDEX producto_material_material ON producto_material (material_id);

-- Lo que ya estaba cargado como texto pasa a la lista nueva (cada texto distinto es un material; sin perder nada).
-- producto.material queda en la tabla sin usarse, como respaldo.
INSERT OR IGNORE INTO material (nombre)
  SELECT DISTINCT trim(material) FROM producto WHERE trim(coalesce(material, '')) <> '';
INSERT OR IGNORE INTO producto_material (producto_id, material_id)
  SELECT p.id, m.id FROM producto p JOIN material m ON m.nombre = trim(p.material)
  WHERE trim(coalesce(p.material, '')) <> '';
