-- Carritos abandonados: se guarda el email (y lo que haya del carrito) al seguir del paso 1 del checkout. Un carrito por
-- email: si vuelve a empezar, se actualiza. Aparece en el panel a los 60 minutos y se borra a los 30 días.
-- Pasa a «recuperada» cuando se crea un pedido con ese email. El código va en el link de recuperación y no revela el email.
CREATE TABLE carrito_abandonado (
  id               INTEGER PRIMARY KEY,
  codigo           TEXT    NOT NULL UNIQUE,
  email            TEXT    NOT NULL UNIQUE,
  nombre           TEXT,
  telefono         TEXT,
  items            TEXT    NOT NULL,  -- JSON: [{ varianteId, cantidad }]
  total_centavos   INTEGER NOT NULL DEFAULT 0,
  estado           TEXT    NOT NULL DEFAULT 'sin_contactar' CHECK (estado IN ('sin_contactar', 'contactada', 'recuperada')),
  creado_en        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actualizado_en   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  contactado_en    TEXT
);
CREATE INDEX carrito_abandonado_fecha ON carrito_abandonado (actualizado_en);
