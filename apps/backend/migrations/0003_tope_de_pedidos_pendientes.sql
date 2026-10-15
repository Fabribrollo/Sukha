-- Para limitar cuántos pedidos sin pagar puede tener abiertos un mismo visitante.
-- Se guarda una huella (hash) de la IP, no la IP.
ALTER TABLE pedido ADD COLUMN ip_hash TEXT;
CREATE INDEX pedido_ip_pendiente ON pedido (ip_hash, estado);
CREATE INDEX pedido_email_pendiente ON pedido (email, estado);
