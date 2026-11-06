-- Promociones por categoría o colección: liquidación con un porcentaje, 2x1 y 3x2. Rigen entre `desde` y `hasta`
-- (vacío = sin límite). La liquidación baja el precio que paga la clienta; el 2x1 y el 3x2 descuentan al calcular el pedido.
CREATE TABLE promocion (
  id            INTEGER PRIMARY KEY,
  nombre        TEXT    NOT NULL,
  tipo          TEXT    NOT NULL CHECK (tipo IN ('liquidacion', '2x1', '3x2')),
  porcentaje    INTEGER CHECK (porcentaje BETWEEN 1 AND 90),
  categoria_id  INTEGER REFERENCES categoria(id) ON DELETE CASCADE,
  coleccion_id  INTEGER REFERENCES coleccion(id) ON DELETE CASCADE,
  desde         TEXT,
  hasta         TEXT,
  activa        INTEGER NOT NULL DEFAULT 1,
  creado_en     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((categoria_id IS NULL) <> (coleccion_id IS NULL)),
  CHECK ((tipo = 'liquidacion') = (porcentaje IS NOT NULL))
);
