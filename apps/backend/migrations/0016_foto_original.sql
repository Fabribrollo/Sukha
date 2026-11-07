-- Foto original sin recortar de cada foto de producto: `original` es su clave en KV ("productos/12/…/original.webp"; vacío = la
-- foto se subió sin original, y reencuadrar solo puede achicar). `encuadre` es el recorte que se le aplicó, como JSON con
-- x, y, ancho y alto entre 0 y 1 (proporciones de la original), para volver a abrirlo donde se dejó.
ALTER TABLE imagen ADD COLUMN original TEXT;
ALTER TABLE imagen ADD COLUMN encuadre TEXT;
