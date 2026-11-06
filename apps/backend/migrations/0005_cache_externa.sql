-- Caché de datos de servicios externos con vencimiento (por ejemplo, el token de MiCorreo, que dura un par de horas).
-- Va en D1 y no en KV porque el KV del backend es el de las fotos, que se sirven públicamente por su clave.
CREATE TABLE cache_externa (
  clave    TEXT PRIMARY KEY,
  valor    TEXT NOT NULL,
  vence_en TEXT NOT NULL
);
