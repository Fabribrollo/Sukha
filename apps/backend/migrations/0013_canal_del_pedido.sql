-- Por dónde llegó el pedido: la tienda o una venta cargada a mano desde el panel (WhatsApp, Instagram u otro).
ALTER TABLE pedido ADD COLUMN canal TEXT NOT NULL DEFAULT 'web' CHECK (canal IN ('web', 'whatsapp', 'instagram', 'otro'));
