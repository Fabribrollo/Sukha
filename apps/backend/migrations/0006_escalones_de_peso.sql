-- Precio de envío por peso. `zona_envio.precio_centavos` es el precio hasta 1 kg; acá van los tramos de más peso.
-- Más de 10 kg no se ofrece envío (se consulta por WhatsApp).
CREATE TABLE escalon_envio (
  zona_envio_id    INTEGER NOT NULL REFERENCES zona_envio(id) ON DELETE CASCADE,
  hasta_gramos     INTEGER NOT NULL CHECK (hasta_gramos IN (3000, 5000, 10000)),
  precio_centavos  INTEGER NOT NULL CHECK (precio_centavos >= 0),
  PRIMARY KEY (zona_envio_id, hasta_gramos)
);
