-- Subcategorías: una categoría puede colgar de otra (un solo nivel de profundidad, se controla en el servicio).
-- Si la categoría padre está oculta, sus subcategorías y los productos que tienen adentro también se ocultan.
ALTER TABLE categoria ADD COLUMN padre_id INTEGER REFERENCES categoria(id);
CREATE INDEX categoria_padre ON categoria (padre_id, orden);
