-- Notas del pedido: la que deja la clienta en el checkout (opcional, se ve en el panel y en el remito) y una interna que
-- solo se edita y se ve en el panel.
ALTER TABLE pedido ADD COLUMN nota_clienta TEXT;
ALTER TABLE pedido ADD COLUMN nota_interna TEXT;
