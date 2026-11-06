-- Los colores se ordenan arrastrando desde el panel (como los talles). Al empezar quedan por nombre, como se veían hasta ahora.
ALTER TABLE color ADD COLUMN orden INTEGER NOT NULL DEFAULT 0;
UPDATE color SET orden = (SELECT count(*) FROM color c WHERE c.nombre < color.nombre COLLATE NOCASE) + 1;
