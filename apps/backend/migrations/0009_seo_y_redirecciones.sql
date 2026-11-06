-- SEO: título y descripción para buscadores (vacíos = se arman solos) e imagen para compartir del producto
-- (la clave de una de sus fotos; vacía = la primera).
ALTER TABLE producto ADD COLUMN seo_titulo TEXT;
ALTER TABLE producto ADD COLUMN seo_descripcion TEXT;
ALTER TABLE producto ADD COLUMN seo_imagen TEXT;
ALTER TABLE categoria ADD COLUMN seo_titulo TEXT;
ALTER TABLE categoria ADD COLUMN seo_descripcion TEXT;
ALTER TABLE coleccion ADD COLUMN seo_titulo TEXT;
ALTER TABLE coleccion ADD COLUMN seo_descripcion TEXT;

-- Redirecciones: si una dirección de la tienda da 404, se busca acá a dónde mandar. Las automáticas se crean al cambiar
-- el slug de un producto, categoría o colección.
CREATE TABLE redireccion (
  id          INTEGER PRIMARY KEY,
  desde       TEXT    NOT NULL UNIQUE,
  hacia       TEXT    NOT NULL,
  tipo        INTEGER NOT NULL DEFAULT 301 CHECK (tipo IN (301, 302)),
  automatica  INTEGER NOT NULL DEFAULT 0 CHECK (automatica IN (0, 1)),
  creado_en   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (desde <> hacia)
);
