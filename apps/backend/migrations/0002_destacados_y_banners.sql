-- Portada estilo Tiendanube: productos destacados y carrusel de banners.

ALTER TABLE producto ADD COLUMN destacado INTEGER NOT NULL DEFAULT 0 CHECK (destacado IN (0, 1));

-- Banners de la portada. Imágenes en KV.
CREATE TABLE banner (
  id                 INTEGER PRIMARY KEY,
  clave              TEXT    NOT NULL UNIQUE,   -- imagen para escritorio
  clave_movil        TEXT    UNIQUE,            -- NULL = usa la de escritorio
  texto_alternativo  TEXT,
  enlace             TEXT,                      -- ruta interna, por ejemplo /categoria/vestidos
  orden              INTEGER NOT NULL DEFAULT 0,
  activo             INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  desde              TEXT,                      -- NULL = sin fecha de inicio
  hasta              TEXT,
  CHECK (desde IS NULL OR hasta IS NULL OR desde < hasta)
);
