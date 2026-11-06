# Auditoría de UX/UI de Sukhä

25/10/2026. Tienda pública y panel de admin. Solo auditoría: no se cambió código.

**Cómo se hizo.** Recorrí staging en tamaño celular (375 × 812 px): portada, listado y ficha de la tienda, y el panel con el usuario de prueba (Inicio, Ventas, una venta, Productos, un producto, Envíos, Configuración y Portada), midiendo el alto de cada pantalla y qué se sale del ancho. Además leí el código de cada pantalla de la tienda y de las 20 del panel. No cambié ningún dato. Los datos de staging son de prueba (fotos de muestra), así que no juzgo el contenido, solo cómo está armado.

**Referencias que respeta este informe.** Panel con poco texto, íconos donde se entienden, ayuda detrás de la «i», altas en modales con botón, nada que ocupe media pantalla; todo pensado primero para el celular. Tienda con Fraunces (títulos, peso 400) y Figtree, sin color de acento, esquinas rectas y sin sombras.

**Cómo leer cada hallazgo.**

| Campo | Valores |
|---|---|
| Prioridad | Alta · Media · Baja |
| Lanzamiento | **Bloquea** (conviene resolverlo antes de abrir) · Después |
| Esfuerzo | S = medio día o menos · M = uno o dos días · L = tres días o más |

---

## 1. Lo que bloquea el lanzamiento

| # | Hallazgo | Esfuerzo |
|---|---|---|
| T1 | Títulos en negrita: la tienda no respeta Fraunces 400 en unos 30 títulos | S |
| T2 | Sombras, bordes redondos y fondos blancos en 11 componentes de la tienda | S |
| T3 | Botón flotante de WhatsApp verde y redondo que tapa precios y rompe la paleta | S |
| P1 | Campaña de portada: el texto va encima de la foto sin nada que asegure que se lea | S |
| P2 | Campaña: el celular descarga siempre la foto grande (la más pesada de la página) | S |
| F1 | Ficha en el celular: «Agregar al carrito» queda fuera de la pantalla | S–M |
| A4 | Panel: fotos, rangos de códigos postales y logo se borran sin confirmar | S |
| PR1 | Panel, edición de producto: cuatro botones «Guardar» separados, se pierden cambios | M |

Total aproximado: 4 a 6 días de trabajo.

---

## 2. Tienda

### 2.1 En todas las páginas

| # | Problema | Propuesta | Prioridad | Lanzamiento | Esfuerzo |
|---|---|---|---|---|---|
| T1 | Unos 30 títulos (`h1`/`h2`) llevan `font-semibold` sobre Fraunces: la identidad pide peso 400 y la regla base ya lo define. Ejemplos: ficha (`FichaProducto.tsx:178`), listado (`Listado.astro:58`), checkout, carrito, 404, páginas de texto. | Quitar `font-semibold` de los títulos y dejar una sola escala: título de página 32/44 px, título de sección 24/36 px, ambos en Fraunces 400. | Alta | **Bloquea** | S |
| T2 | 24 usos de `shadow`, `rounded-full`/`rounded-lg` y `bg-white` en 11 componentes: carrito lateral y panel de filtros en blanco (el resto es `#ebeae6`), flechas y lupa de la galería redondas con sombra, sugerencias del buscador con sombra. Se nota el cambio de tono al abrir el carrito. | Paneles con `bg-fondo` y borde fino `border-linea`; botones de ícono cuadrados y sin sombra; muestras de color siguen redondas (es un dato, no decoración). | Alta | **Bloquea** | S |
| T3 | Botón flotante de WhatsApp (`Pie.astro:85`): verde `#25d366`, redondo, con sombra. Tapa el precio de la segunda tarjeta en el listado y el pie, y va a chocar con la barra fija de compra (F1). | Botón cuadrado de 44 px en negro o arena con el ícono, más chico. No mostrarlo en ficha ni checkout: ahí ya hay «Compartir por WhatsApp» y el link del pie. | Alta | **Bloquea** | S |
| T4 | Pie muy largo en el celular: categorías, información, contacto y newsletter apilados (más de dos pantallas). | En el celular, cada grupo del pie como desplegable (`<details>`), y la newsletter afuera de los desplegables. | Media | Después | S |
| T5 | Menú del celular: una lista de texto plana. | Nombres de categoría grandes en Fraunces y una foto de campaña al pie del menú (como COS o Arket). | Baja | Después | M |

### 2.2 Portada

| # | Problema | Propuesta | Prioridad | Lanzamiento | Esfuerzo |
|---|---|---|---|---|---|
| P1 | La campaña (`Campana.astro`) pone etiqueta, título y botón encima de la foto, en el color del texto (casi negro), sin capa de contraste. Con una foto oscura no se lee; en staging el título se pisa con la imagen. | Degradé suave abajo de la foto y elegir texto claro u oscuro por sección desde el panel. En el celular, alternativa: texto debajo de la foto. | Alta | **Bloquea** | S |
| P2 | La campaña carga `grande.webp` (1600 px) en todos los tamaños. Es lo primero que se pinta, así que define cuánto tarda en verse la página. | `srcset` con mediano y grande como ya hacen las tarjetas, y opcionalmente una foto vertical para el celular (`<picture>`). | Alta | **Bloquea** | S |
| P3 | Categorías sin foto: bloques beige con el nombre chiquito en una esquina. Parecen fotos que no cargaron. | Sin foto, mostrar una lista tipográfica (nombres grandes en Fraunces con una flecha) en lugar de cajas vacías. | Media | Después | S |
| P4 | La newsletter aparece dos veces si la portada tiene la sección (portada y pie). | Si la portada la tiene, el pie no la repite. | Media | Después | S |
| P5 | «Lo nuevo» con una o dos prendas deja media pantalla vacía. | Mostrar la sección desde 4 prendas, o pasarla a fila deslizable. | Baja | Después | S |

### 2.3 Listados (todos los productos, categoría, colección, ofertas, búsqueda)

| # | Problema | Propuesta | Prioridad | Lanzamiento | Esfuerzo |
|---|---|---|---|---|---|
| L1 | La tarjeta muestra hasta cuatro líneas de precio: precio, tachado y porcentaje, precio con transferencia y cuotas. En celular, con dos columnas, es lo que más se ve. | Nombre y precio (y tachado si hay oferta). El «10% off con transferencia» se dice una vez en la barra de anuncios y en la ficha. | Media | Después | S |
| L2 | El descuento «−90 %» va con espacio y del mismo tamaño que el precio. | Insignia chica y cuadrada «−90%» en la esquina de la foto, sin color. | Baja | Después | S |
| L3 | No hay segunda foto al pasar el mouse ni muestras de color en la tarjeta, dos cosas que esperan las clientas de tiendas de ropa. | Segunda foto en hover (escritorio) y hasta 4 puntitos de color debajo del precio. Requiere que la API devuelva la segunda foto y los colores. | Media | Después | M |
| L4 | En escritorio los filtros se aplican solos, pero sigue el botón «Aplicar filtros». | En escritorio, sacar el botón; en el celular dejar «Ver N resultados», que está muy bien. | Baja | Después | S |

### 2.4 Ficha de producto

| # | Problema | Propuesta | Prioridad | Lanzamiento | Esfuerzo |
|---|---|---|---|---|---|
| F1 | En el celular la foto ocupa la primera pantalla y el botón queda abajo: en staging, con un producto sin talles ni colores, el botón empieza a los 829 px en una pantalla de 812. Con talles y colores queda todavía más abajo. | Barra fija abajo, solo en el celular, con precio y «Agregar al carrito». Aparece cuando el botón original sale de la pantalla (`IntersectionObserver`). | Alta | **Bloquea** | S–M |
| F2 | La galería del celular usa puntitos: no se nota que hay más fotos. | Galería con desplazamiento nativo (`scroll-snap`) que deje ver el borde de la foto siguiente, o un contador «1/5». | Media | Después | S |
| F3 | El descuento aparece dos veces (insignia negra sobre la foto y al lado del precio). | Dejar solo el del precio. | Baja | Después | S |
| F4 | Precio en 30 px y negrita: pesado para una estética premium. | Figtree 400 de 20 a 22 px; el tachado más chico al lado. | Media | Después | S |
| F5 | La guía de talles es texto libre en un modal. | Tabla de medidas (talle por fila, medida por columna), cargada desde la categoría. | Media | Después | M |
| F6 | No hay «Avisame cuando vuelva» en talles agotados. | Pedido de email en el talle tachado. Necesita una tabla y un envío en el backend. | Baja | Después | M |
| F7 | Con una sola unidad dice «¡Últimas 1 unidad!». | «¡Última unidad!» con 1 y «Quedan 3» con más. | Baja | Después | S |

Lo que está bien y conviene no tocar: el texto del botón cambia a «Elegí un talle» mientras falta algo, los talles agotados se ven tachados, la combinación elegida queda en la dirección y el cotizador de envío está en la misma ficha.

### 2.5 Carrito y checkout

| # | Problema | Propuesta | Prioridad | Lanzamiento | Esfuerzo |
|---|---|---|---|---|---|
| C1 | El carrito no dice cuánto falta para el envío gratis, y el dato existe (cada zona tiene «gratis desde»). | Una línea con barra fina: «Te faltan $ 12.000 para el envío gratis». | Media | Después | S |
| C2 | «Iniciar compra» y «Ver carrito» tienen el mismo peso. | «Ver carrito» como link de texto. | Baja | Después | S |
| K1 | «Sucursal del correo» es texto libre: la clienta no sabe el nombre exacto y el despacho puede salir mal. | Selector de sucursales por código postal, o como mínimo un link al buscador oficial del correo. | Media | Después | M–L |
| K2 | Los pasos usan círculos y el check en círculo. | Cuadrados, como el resto de la identidad. | Baja | Después | S |

El checkout está bien resuelto: una sola página con pasos plegables, resumen plegable en el celular, autocompletado de localidad y calle, errores que aparecen al salir del campo y el total en el botón final.

---

## 3. Panel de admin

### 3.1 En todas las pantallas

| # | Problema | Propuesta | Prioridad | Lanzamiento | Esfuerzo |
|---|---|---|---|---|---|
| A1 | Quedan 9 párrafos de ayuda fijos: 6 en Envíos, 1 en la edición de producto (fotos), 1 en la venta (reembolso) y 1 en el alta de producto. | Pasarlos a la «i» (`Ayuda.astro`), como el resto. | Media | Después | S |
| A2 | Altas siempre abiertas al pie de la pantalla: «Nuevo cupón», «Nueva zona», «Nueva redirección», «Nuevo talle» y «Nuevo color». Ediciones dentro de desplegables (cupones, zonas). | Botón «+ Nuevo» arriba a la derecha que abre un modal, como ya hacen Productos y Categorías. La edición, en el mismo modal. | Alta | Después | M |
| A3 | Después de guardar, la página se recarga entera, vuelve arriba y muestra un cartel verde «Guardado» que empuja todo. | Aviso flotante abajo que se va solo, y volver a la tarjeta que se estaba editando (ancla `#variantes`, `#fotos`). | Media | Después | S |
| A4 | Confirmaciones de borrado distintas: Productos pide «¿Borrar?» en dos pasos, pero fotos, rangos de código postal y logo se borran con un toque. Borrar un rango deja sin envío a toda una zona sin aviso. | El mismo patrón de dos pasos en todos los borrados. | Alta | **Bloquea** | S |
| A5 | Las tablas de Productos, Ventas y Variantes tienen 4 o 5 columnas: en el celular se desplazan de costado. En staging, en Ventas queda cortada la columna Estado (la más importante) y en Productos el precio. | En pantallas chicas, cada fila como tarjeta: foto, nombre, estado y monto. | Alta | Después | M |
| A6 | Las métricas usan azul, verde y violeta sin significado, y compiten con los colores de los estados. | Métricas en gris; el color queda solo para estados y alertas. | Baja | Después | S |
| A7 | Las pestañas de estado de Ventas y Productos no dicen cuántos hay (Carritos sí). | Cantidad al lado de cada pestaña: «Por despachar 3». | Media | Después | S |
| A8 | No hay búsqueda global. | Atajo `Ctrl+K` que busque ventas, productos y clientas. | Baja | Después | M |

### 3.2 Pantalla por pantalla

| Pantalla | Problema | Propuesta | Prioridad | Lanzamiento | Esfuerzo |
|---|---|---|---|---|---|
| **Inicio** | 8 tarjetas de números antes de lo pendiente; en el celular las 4 primeras ocupan toda la pantalla y lo pendiente queda abajo. «Más vendidos» repite Reportes. | Arriba, una franja «Para hacer» solo con lo que tiene algo (transferencias, por despachar, pagos a revisar, post-venta). Después dos números (hoy y 30 días) y el gráfico. | Media | Después | S |
| **Ventas** | Además de A5 y A7, el período solo se elige al exportar. | Chips de período (hoy, 7 días, 30 días) y «Confirmar transferencia» desde la lista. | Media | Después | M |
| **Venta (detalle)** | Las prendas van al final y sin foto: al armar el paquete es fácil equivocarse de prenda. El número de seguimiento se carga en dos lugares. No hay botón de WhatsApp a la clienta. | Orden: estado y acción, prendas con foto, clienta/entrega/pago, historial. Un solo campo de seguimiento. Botón de WhatsApp (la función ya existe en Carritos) y «Copiar dirección». | Alta | Después | S |
| **Productos** | Bien resuelta: pestañas, buscador, alta en modal. Faltan acciones sobre varios a la vez. | Casillas por fila para publicar, ocultar o subir precios en %. | Media | Después | M |
| **Producto (edición)** | **PR1.** Cuatro formularios con su propio «Guardar» (Datos, Variantes, Foto, Buscadores): si se cambia Datos y se toca el «Guardar» de Buscadores, lo de Datos se pierde. | Una barra fija «Cambios sin guardar · Descartar · Guardar» que guarda todo junto, y aviso al salir con cambios (como Shopify). | Alta | **Bloquea** | M |
| | **PR4.** En el celular, la tarjeta «Buscadores y redes» es más ancha que la pantalla: los campos y la vista previa de Google quedan cortados a la derecha (la vista previa mide 384 px fijos). | Que la vista previa ocupe como máximo el ancho disponible (`w-full max-w-sm` y `min-w-0` en la tarjeta). | Alta | Después | S |
| | **PR2.** Las fotos van al final; en ropa son lo primero. En el celular la página mide 3.100 px (casi 4 pantallas) y las fotos aparecen recién a los 1.900. | En escritorio, dos columnas: principal (Fotos, Datos, Variantes) y lateral (Estado, categoría, colecciones, marca, Buscadores plegado). | Media | Después | M |
| | **PR3.** «Mover stock» son tres íconos (caja, local, controles) que no se entienden sin el mouse y en el celular no tienen texto. | Un botón «Mover stock» por variante que abre un modal con las tres opciones escritas. | Media | Después | M |
| **Carga rápida** | Se arma en el navegador; hay que verla en vivo para opinar del flujo. La barra fija de arriba está muy bien. | Revisarla en vivo con datos reales. | — | — | — |
| **Categorías** | Es el mejor ejemplo del panel: alta y edición en modal, arrastre para ordenar. La guía de talles es texto libre (ver F5). | Usarla como modelo para las demás. | — | — | — |
| **Talles y colores** | No se pueden editar, borrar ni ordenar. El orden de los talles se ve en filtros y ficha (XS, S, M… y no por fecha de alta). | Arrastrar para ordenar (ya existe `ordenable.ts`) y editar en modal. | Media | Después | S |
| **Portada** | El editor con vista previa está muy bien en escritorio. En el celular la vista previa arranca en modo escritorio, achicada a una franja que no se puede leer; el panel de campos flota sobre la vista y la lista queda abajo. Nueva sección = un select con 11 tipos. | En el celular, arrancar en vista «Celular» y usar pestañas «Secciones · Vista previa». «+ Sección» abre un modal con miniaturas de cada tipo. | Media | Después | M |
| **Cupones** | Alta abierta al pie (A2). El campo «Valor» sirve para porcentaje y pesos y lo explica una ayuda. | Prefijo `%` o `$` que cambia según el tipo elegido. | Media | Después | S |
| **Envíos** | La pantalla más larga y técnica: retiro, zonas (cada una con códigos postales, formulario y edición), actualización de precios con un párrafo largo, bultos y nueva zona. En staging mide 18.100 px de alto en el celular: unas 22 pantallas. | Pestañas «Zonas · Retiro · Bultos · Precios». Zonas como lista compacta con edición en modal. Párrafos a la «i». | Alta | Después | M |
| **Configuración** | Seis tarjetas con seis «Guardar». Las preguntas frecuentes se escriben en un cuadro de texto separadas por líneas en blanco: es fácil romperlas. | Submenú (Pagos, Reserva, Tienda, Avisos, Textos), una sección por vez. Preguntas como lista de pregunta y respuesta con «+ Agregar». | Media | Después | M |
| **Carritos abandonados** | Bien resuelta (Gmail, WhatsApp, cantidades por estado). El botón «Gmail» y el ícono de correo hacen casi lo mismo. | Dejar uno. | Baja | Después | S |
| **Post-venta** | Todas las solicitudes juntas; las resueltas se mezclan con las abiertas. | Pestañas por estado con cantidades, como Carritos. | Media | Después | S |
| **Reportes** | Completa. | Sin cambios. | — | — | — |

---

## 4. Referencias

Paneles de administración:

| Referencia | Qué tomar |
|---|---|
| [Shopify Polaris](https://polaris.shopify.com) | Barra de guardado contextual (PR1), página con columna lateral para producto (PR2), listas que pasan a tarjetas en el celular (A5), filtros con cantidades (A7). |
| [Tiendanube](https://www.tiendanube.com) | Lista de ventas con acción rápida por estado y foco en «por despachar»; la referencia de funciones que ya eligió Fabrizio. |
| [Empretienda](https://www.empretienda.com) | Panel muy simple, pensado para el celular, con pocas opciones por pantalla. |
| [VTEX](https://vtex.com) | Su sistema de diseño de admin (Shoreline): tablas densas, acciones masivas y filtros guardados. |
| [Medusa Admin](https://medusajs.com) | Editor de producto con fotos arriba y variantes en tabla editable. |
| [TailAdmin](https://tailadmin.com) | Base visual actual del panel (tokens, tarjetas, insignias). |

Tiendas de ropa de mujer premium:

| Tienda | Qué tomar |
|---|---|
| [COS](https://www.cos.com) | Tarjeta solo con nombre y precio; menú del celular con imagen; filtros en panel lateral. |
| [Arket](https://www.arket.com) | Muestras de color debajo de la tarjeta; galería que deja ver la foto siguiente. |
| [Toteme](https://toteme.com) | Serif grande con mucho aire, grilla sin bordes, sin colores de acento. |
| [The Frankie Shop](https://thefrankieshop.com) | Barra fija de compra en la ficha del celular. |
| [Sézane](https://www.sezane.com) | «Avisame cuando vuelva» por talle y guía de talles en tabla. |

---

## 5. Librerías de componentes

**Restricciones del proyecto.** Las islas de la tienda son **Preact**, no React. El panel son páginas `.astro` sin framework y su política de seguridad solo admite scripts propios en archivos aparte (por eso no se usa Alpine). Tailwind 4 y costo cero.

| Librería | Cómo funciona | Encaja | Por qué |
|---|---|---|---|
| shadcn/ui | Componentes React sobre Radix que se copian al proyecto | No | Pide React (o `preact/compat`, con fallas conocidas) y su estilo trae sombras y esquinas redondas que habría que deshacer. |
| Radix / Headless UI | Lógica sin estilo para React | No | Mismo problema: React. Sumaría ~40 KB a cada isla. |
| daisyUI 5 | Plugin de Tailwind 4, solo CSS | Parcial | Sin JavaScript y con temas (esquinas en 0 y sin sombras se configuran). Pero reemplaza los tokens de TailAdmin: sería rehacer el panel. |
| Flowbite | Tailwind + JavaScript propio por atributos | Parcial | Sirve en `.astro`, pero trae su propio estilo y JavaScript para cosas que el navegador ya hace (modales, menús). |
| Preline | Tailwind 4 + plugins en JavaScript | Parcial | El más completo (selector con buscador, fechas, subida de archivos), pero pisa lo que ya resuelve `combo.ts` y es pesado. |
| TailAdmin | Plantilla Tailwind | Ya se usa | La versión gratis trae Alpine, así que solo se puede copiar el marcado y los estilos (como se hace hoy). |
| Basecoat | Estilo shadcn en HTML + Tailwind 4, JavaScript chico aparte | Parcial | Es el único con estilo shadcn sin React ni Alpine. Tiene sentido solo si un día se quiere cambiar el aspecto del panel. |

**Recomendación: no sumar una librería; completar el kit propio con lo que ya trae el navegador.**

- **Tienda.** La identidad (esquinas en 0, sin sombras, sin acento) es justamente lo opuesto al estilo por defecto de todas estas librerías: habría que deshacer más de lo que se gana. Con `<dialog>`, `<details>`, Popover API y `scroll-snap` se resuelve todo lo de este informe. Si la galería necesita más, [Embla Carousel](https://www.embla-carousel.com) (sin framework, licencia MIT) es la única pieza externa que vale la pena.
- **Panel.** Seguir con TailAdmin y sumar cinco piezas propias, cada una de pocas líneas sobre algo nativo: modal genérico (ya existe `alta.ts`), aviso flotante (A3), barra de guardado (PR1), menú con Popover API (en lugar de los `<details>` que hoy hacen de menú) y lista que pasa a tarjetas en el celular (A5).
- **Si más adelante se quiere una librería**, la candidata es Basecoat para el panel: no pide React ni Alpine, funciona con la política de scripts actual y usa Tailwind 4. Implica cambiar el aspecto del panel, así que es una decisión de diseño, no un arreglo.

**Skills de diseño.** En este entorno solo están las de artifacts y gráficos; ninguna específica de UX para e-commerce que valga la pena instalar.

---

## 6. Orden sugerido

1. Antes de lanzar (4 a 6 días): T1, T2, T3, P1, P2, F1, A4, PR1.
2. Primer mes: A2 y A5 (el panel desde el celular), venta en detalle con fotos, Envíos y Configuración con pestañas, C1 (envío gratis).
3. Después: L3, F5, F6, K1, acciones masivas, búsqueda global.
