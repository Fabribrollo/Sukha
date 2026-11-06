# Paquete 4.3 · Envíos y Configuración ordenados

Resuelve el ítem D15 y las filas «Envíos» y «Configuración» de [ux-ui.md](ux-ui.md) (más A1 y A2 en Envíos). Sin cambios en el backend ni en la base.

## Qué cambió

- **Envíos** con pestañas Zonas · Retiro · Bultos · Precios. La pestaña queda en la dirección (`/admin/envios#bultos`) y se vuelve a ella después de guardar o si hubo un error. Cambiar de pestaña no recarga: lo escrito en otra pestaña sigue ahí.
  - Zonas: lista compacta (ícono de entrega, nombre, correo, «Pausada» / «Sin códigos», precio). Cada zona se edita en su ventana, con precios por peso y códigos postales (borrar un rango sigue pidiendo dos toques). Después de agregar o quitar códigos, o de crear una zona, su ventana se vuelve a abrir sola (`?zona=id`). «+ Nueva» abre el alta en una ventana (antes estaba siempre abierta al pie).
  - Bultos: cada bulto en una fila que entra en el celular, con tacho para quitarlo. Se guarda con la barra «Cambios sin guardar», que también avisa al salir.
  - Los párrafos de ayuda pasaron a la «i».
- **Configuración** por secciones (Tienda, Logo, Pagos, Reserva, Comercio, Avisos y un link a Textos): en el celular, pestañas que se desplazan de costado; en escritorio, submenú a la izquierda. Cada sección tiene su «Guardar», y la barra guarda todas las que cambiaron juntas y avisa al salir.
- **Preguntas frecuentes** (en Textos y legales): lista de preguntas. Se toca una para editarla, «Agregar pregunta», borrar en dos toques y ordenar arrastrando o con las flechas sobre el asa. Se guarda igual que antes (lista de `{ pregunta, respuesta }` en `contenido_preguntas_frecuentes`); la respuesta ahora puede tener varios párrafos. Si quedó guardado el formato viejo (texto con una pregunta por bloque), la tienda y el panel lo leen. Textos y legales también usa la barra de guardado y ya no se sale de ancho en el celular (medía 797 px a 375).

## Alto de Envíos a 375 px (local, 39 zonas de prueba)

| | Antes | Después |
|---|---|---|
| Zonas | 16.620 px (todo junto) | 2.843 px |
| Retiro | | 812 px |
| Bultos | | 1.327 px |
| Precios | | 812 px |

## Archivos

- Nuevos: `components/panel/Pestanas.astro`, `scripts/pestanas.ts`, `tests/navegador/panel-envios-config.test.mjs`.
- Cambiados: `pages/admin/envios.astro`, `pages/admin/configuracion.astro`, `pages/admin/textos.astro`, `lib/textos.ts` (lee el formato viejo).
- Compartidos, con cambios mínimos: `scripts/barra-guardado.ts` (al recargar conserva `?t=` y `#pestaña`; manda el botón que envió el formulario, para «Restaurar el original»), `scripts/fotos.ts` (al subir el logo vuelve a `#imagen`), `scripts/alta.ts` (respeta `autofocus`, para que abrir una zona no abra el teclado), `scripts/ordenable.ts` (las flechas también andan en filas agregadas después), `tests/navegador/panel-guardado.test.mjs` (rangos dentro de la ventana de la zona, logo en `#imagen`).

## Quedó afuera

- Agrupar o filtrar zonas por correo: con muchas zonas la lista es larga (en local hay 39 de prueba). Se puede sumar un filtro «Correo Argentino · Andreani» si hace falta.
- Si se borran todas las preguntas y se guarda, la tienda muestra las originales (así funcionaba antes).
- Los datos escritos en el alta de zona se pierden si el servidor la rechaza (la ventana se vuelve a abrir vacía), como en las otras altas.
