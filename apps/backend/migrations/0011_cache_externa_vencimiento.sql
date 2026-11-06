-- La caché externa ahora guarda también las sugerencias de Georef (muchas filas). La tarea programada borra lo vencido
-- cada 5 minutos: con este índice lee solo esas filas y no la tabla entera (el plan gratis cuenta las filas leídas).
CREATE INDEX cache_externa_vence_en ON cache_externa (vence_en);
