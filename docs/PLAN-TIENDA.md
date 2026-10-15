# Plan de la tienda (vista de la clienta)

Plan para construir la tienda pública de Sukhä. Está escrito para que lo ejecute un modelo de IA de punta a punta, en fases, sin tener que preguntar decisiones de diseño. Cada fase termina con criterios verificables.

**Objetivo:** una tienda online de ropa con la estructura, las pantallas y el comportamiento de una tienda hecha en Tiendanube (tema estándar), con estética **genérica y neutra**: sin identidad visual propia todavía. La marca se aplicará más adelante cambiando solo unas variables de color y tipografía.

---

## 0. Antes de empezar (leer y respetar)

### Qué existe hoy

- Monorepo en `D:\Users\Fabri\OneDrive\Desktop\dev\Sukhaind` con workspaces npm.
- `apps/backend`: API en Cloudflare Workers (Hono + D1 + KV). **Completa.** Todas las rutas públicas están documentadas en `docs/API.md`: leerlo entero antes de escribir una línea.
- `apps/frontend`: Astro 7 en Cloudflare Workers, con Tailwind 4 ya instalado. Hoy contiene:
  - `/admin/*`: panel de administración terminado. **No tocar** salvo lo que pide la fase 1 (campos nuevos de configuración).
  - `src/pages/api/[...path].ts`: reenvía todo `/api/*` al backend. No tocar.
  - `src/pages/index.astro`: página provisoria ("API conectada"). Se reemplaza en la fase 3.
  - `src/middleware.ts`: cabeceras de seguridad para todo el sitio y verificación de sesión solo en `/admin`. La política de contenido (CSP) estricta aplica **solo a `/admin`**; la tienda no la tiene (va a necesitar Google Analytics y el píxel de Meta más adelante).
  - `src/lib/api.ts`: `api(request, ruta, cuerpo?, metodo?)` y `leer(request, ruta)` para llamar al backend **desde el servidor** (frontmatter de Astro), por el binding interno. Usarlo en todas las páginas.
  - `src/styles/panel.css`: estilos del panel. **No** reutilizarlo en la tienda: la tienda tiene su propio CSS (fase 2).
- Staging publicado: `https://sukha-frontend-staging.sukha-frontend.workers.dev`.

### Reglas del proyecto

- Todo el texto visible en **español rioplatense** (vos, "agregá", "elegí"), con tono simple.
- **Nunca** interactuar con GitHub: sin remoto, sin push. Git solo local.
- `CLAUDE.md`, `AGENTS.md` y `.claude/` van en `.gitignore` (ya lo están).
- Costo cero: no sumar servicios pagos ni que pidan tarjeta.
- **Nunca desplegar a producción** ni migrar la base de producción. Solo staging: `npm run deploy:staging -w @sukha/backend` (siempre primero) y `npm run deploy:staging -w @sukha/frontend`.
- Claves y contraseñas: nunca escribirlas en archivos versionados ni pedirlas por chat.
- Montos: la API usa **centavos enteros**. Mostrar siempre con `Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })`. Nunca hacer cuentas de dinero que decidan lo que se cobra en el navegador: el total que vale es el que devuelve el servidor.
- Antes de dar algo por terminado: `npm run check -w @sukha/backend`, `npm test -w @sukha/backend` y `npm run build` sin errores.

### Cómo levantar todo en local

```sh
npm run db:migrate                  # base local
npm run db:seed                     # talles, colores y configuración
npm run dev:backend                 # terminal 1 (http://127.0.0.1:8787)
npm run dev:frontend                # terminal 2 (http://localhost:4321)
npm run admin:crear -w @sukha/backend -- local prueba@sukha.test "Prueba"   # usuario del panel local
```

Para tener datos de prueba, cargar desde el panel local (`/admin`) unas 3 categorías, 1 colección, 8 a 12 productos con variantes, stock y fotos reales (el panel achica y convierte las fotos solo), 2 zonas de envío con códigos postales, 1 cupón y 1 banner. Algunos productos tienen que quedar en oferta, alguno destacado y alguno sin stock, para poder ver todos los estados.

---

## 1. Fase 1: lo que le falta al backend

Cambios chicos que la tienda necesita. Cada uno con su test o caso en `apps/backend/scripts/e2e.ts`, y documentado en `docs/API.md`.

1. **Buscar un pedido por número y email:** `POST /api/pedidos/buscar` con `{ numero: "SUK-0012", email }` devuelve `{ token }`.
   - Si no coincide, responde 404 con un mensaje genérico ("No encontramos un pedido con esos datos"), sin decir cuál de los dos datos falló.
   - Con el límite `limiteCheckout` (10 por minuto por IP), igual que los otros POST sensibles.
   - Lo usan la página "Buscar mi pedido" y el botón de arrepentimiento.
2. **Catálogo:**
   - Parámetro `limite` en `GET /api/catalogo/productos` (entre 1 y 24; por defecto 24), para las sugerencias del buscador.
   - `talle` y `color` aceptan **varios ids separados por coma** (`talle=3,4`). Coincide si el producto tiene stock en cualquiera de ellos.
3. **Filtros:** `GET /api/catalogo/filtros` agrega:
   - `precio: { min, max }` en centavos, de los productos publicados.
   - Solo los talles y colores que tengan al menos una variante activa con stock en un producto publicado, para no mostrar filtros que dan cero resultados.
4. **Configuración nueva**, en `CONFIGURACION` de `tienda.validation.ts`, devuelta en `GET /api/tienda` y editable en el panel (`/admin/configuracion`, grupo que corresponda):
   - `cuotas_cantidad` (entero de 1 a 12, por defecto 3): cantidad de cuotas sin interés a mostrar cuando `cuotas_sin_interes` está activo. En `/api/tienda`: `cuotasSinInteres: null | { cantidad }`.
   - `email_contacto` (email o vacío): email público de contacto (distinto de `email_avisos`, que es privado).
   - `datos_legales` (texto): razón social, CUIT y domicilio para el pie de página.
   - Además, exponer en `/api/tienda` los tiempos de reserva que ya existen (`reservaMercadoPagoMinutos` y `reservaTransferenciaHoras`), para mostrarlos en el checkout.
5. **Sitemap:** `GET /api/catalogo/sitemap` devuelve `{ productos: [{ slug, actualizadoEn }], categorias: [slug], colecciones: [slug] }` solo de lo publicado o activo.

**Terminado cuando:** tests y e2e pasan, `docs/API.md` actualizado, el panel muestra y guarda los tres campos nuevos, y el backend está desplegado en staging.

---

## 2. Fase 2: base visual, cabecera y pie

### Decisiones técnicas

- **Páginas:** Astro con renderizado en el servidor (`export const prerender = false`). Los datos se piden en el frontmatter con `leer()` de `src/lib/api.ts`. El HTML tiene que llegar completo, por SEO.
- **Partes interactivas:** islas de **Preact** (`npx astro add preact`) solo donde hace falta: carrito, selector de variantes, buscador, cotizador de envío, checkout, filtros en el celular. Todo lo demás es HTML sin JavaScript.
- **Estado compartido del carrito:** `nanostores` + `@nanostores/preact` (el ícono de la cabecera, el carrito lateral y la ficha de producto leen el mismo estado). Nada de librerías de estado más grandes.
- **Íconos:** `@lucide/astro` en componentes Astro (ya instalado) y `lucide-preact` dentro de las islas.
- **Estilos:** Tailwind 4 con un archivo propio `src/styles/tienda.css` (`@import 'tailwindcss'`), importado solo desde el layout de la tienda. No importar `panel.css`.
- **Sin** jQuery, sin carruseles pesados, sin frameworks de componentes. Carruseles con CSS (`scroll-snap`) y, si hace falta, un script mínimo propio.

### Tokens genéricos (rebrandeables)

Todos los colores, radios y la tipografía salen de variables en `tienda.css` (`@theme`), para poder aplicar la marca después cambiando solo ese bloque:

| Token | Valor | Uso |
| --- | --- | --- |
| `--color-fondo` | `#ffffff` | Fondo general |
| `--color-texto` | `#1a1a1a` | Texto principal |
| `--color-suave` | `#6b6b6b` | Textos secundarios, precio tachado |
| `--color-linea` | `#e5e5e5` | Bordes y separadores |
| `--color-gris` | `#f5f5f5` | Fondos de secciones y de fotos mientras cargan |
| `--color-primario` | `#1a1a1a` | Botones principales, barra de anuncios |
| `--color-primario-texto` | `#ffffff` | Texto sobre primario |
| `--color-oferta` | `#d0021b` | Insignia de descuento |
| `--color-exito` | `#1e7e34` | Descuento por transferencia, "Envío gratis" |
| `--radio` | `4px` | Botones y campos (estilo sobrio, casi recto) |
| `--font-sans` | `system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif` | Tipografía |

- Contenedor centrado con ancho máximo de 1200px y 16px de margen lateral en el celular.
- Diseño **primero para el celular** (la mayoría compra desde ahí). Puntos de quiebre de Tailwind: `md` (768px) y `lg` (1024px).
- Botón principal: fondo primario, texto blanco, alto 48px, ancho completo en el celular. Botón secundario: borde de 1px, fondo blanco.

### Layout `src/layouts/Tienda.astro`

Recibe `titulo`, `descripcion`, `imagen` (para Open Graph) y `canonica`. Pide `GET /api/tienda` y `GET /api/catalogo/filtros` una vez por página para armar la cabecera y el pie.

**Barra de anuncios** (si `barraAnuncios` no está vacío): franja superior con fondo primario, texto chico centrado.

**Cabecera** (fija arriba al hacer scroll, fondo blanco, borde inferior):

- **Celular:**
  - Izquierda: botón de menú (hamburguesa) que abre un panel lateral con las categorías, las colecciones, "Todos los productos", "Ofertas", las páginas de información, el link a Instagram y el de WhatsApp.
  - Centro: el nombre "SUKHÄ" en texto, como logo provisorio (componente `Logo.astro`, para cambiarlo después por una imagen).
  - Derecha: lupa (abre el buscador) y bolsa del carrito con un globito con la cantidad de prendas.
- **Escritorio:**
  - Logo a la izquierda.
  - Menú horizontal al centro: "Inicio", las categorías activas (si son más de 6, las demás van en un desplegable "Más"), "Ofertas".
  - A la derecha: campo de búsqueda visible, ícono "Mi pedido" (lleva a `/pedido/buscar`) y carrito.

**Buscador** (isla `Buscador`):

- En el celular se abre como una capa a pantalla completa con el campo arriba; en escritorio es un campo con desplegable debajo.
- A partir de 2 letras, con una espera de 250 ms entre teclas, pide `GET /api/catalogo/productos?q=…&limite=5` y muestra hasta 5 resultados: foto chica, nombre y precio.
- Al final del desplegable, "Ver todos los resultados" lleva a `/buscar?q=…`. Enter hace lo mismo.
- Sin resultados: "No encontramos productos para «…»".
- Se maneja con teclado: flechas, Enter y Escape.

**Pie de página** (fondo gris claro, 4 columnas en escritorio y apiladas en el celular):

1. **Categorías:** todas las activas.
2. **Información:** Quiénes somos, Preguntas frecuentes, Cambios y devoluciones, Contacto, Buscar mi pedido y **Botón de arrepentimiento**. Este último es obligatorio por ley en Argentina (Res. 424/2020) y tiene que verse destacado.
3. **Contacto:** WhatsApp, Instagram y `email_contacto`, cada uno con su ícono, solo si están configurados.
4. **Newsletter:** "Suscribite y enterate de las novedades", campo de email y botón. Usa `POST /api/novedades` e incluye el campo señuelo `comentarioExtra` oculto (ver README). Al suscribirse muestra "¡Listo! Ya estás suscripta" sin recargar.
- **Debajo de las columnas:**
  - Medios de pago: dos íconos genéricos con texto, "Mercado Pago" y "Transferencia". No usar logos de marcas registradas descargados de internet; alcanza con texto e íconos de Lucide.
  - Medios de envío: "Correo Argentino" y "Andreani", en texto.
  - `datos_legales`, el link a Defensa del Consumidor (`https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario`) y "© {año} Sukhä".
- **Botón flotante de WhatsApp** abajo a la derecha, si `whatsapp` está configurado. Abre `https://wa.me/{numero}`.

**Página 404** (`src/pages/404.astro`): "No encontramos esta página", un botón "Volver al inicio" y una grilla de 4 productos nuevos.

**Terminado cuando:** el layout se ve bien a 375px y a 1280px, el menú del celular abre y cierra (también con Escape), el buscador sugiere productos reales, la newsletter guarda un email y el pie muestra el botón de arrepentimiento.

---

## 3. Fase 3: portada (`/`)

Reemplaza la `index.astro` provisoria. Usa `GET /api/portada` (una sola llamada).

1. **Carrusel de banners**, a todo el ancho:
   - Usa `claveMovil` en el celular si existe (con `<picture>` y `media`).
   - Cada banner es un link a su `enlace`.
   - Avanza solo cada 5 segundos y se pausa al pasar el mouse o tocarlo. Tiene puntos indicadores y flechas en escritorio, y se desliza con el dedo (`scroll-snap`).
   - Si no hay banners, no se muestra nada (no dejar un hueco).
   - La primera imagen carga con `fetchpriority="high"` y las demás con `loading="lazy"`.
2. **Categorías:** fila de tarjetas con el nombre de cada categoría sobre un fondo gris (la API no tiene foto de categoría). Deslizable en el celular, en grilla en escritorio.
3. **Destacados**, **Nuevos ingresos** y **Ofertas**: cada sección con su título y un link "Ver todos" (destacados lleva a `/productos?destacado=1`, nuevos a `/productos`, ofertas a `/ofertas`). Grilla de tarjetas de producto: 2 columnas en el celular y 4 en escritorio. Una sección vacía no se muestra.
4. **Beneficios**: tres o cuatro íconos con texto corto en una franja. Por ejemplo: "Envíos a todo el país"; "{X}% off pagando con transferencia", solo si hay descuento; "Hasta {N} cuotas sin interés", solo si están activas; "Cambios sin vueltas". Los textos salen de la configuración, no se inventan datos.

### Componente `TarjetaProducto.astro` (se usa en toda la tienda)

- Foto en proporción **3:4** con `object-cover`, fondo gris mientras carga, usando `chico.webp` y `mediano.webp` con `srcset`. Sin foto, se ve un ícono neutro.
- **Segunda foto al pasar el mouse** (solo escritorio), si el producto tiene más de una. La API de listado da una sola foto, así que esto es opcional: se omite si haría falta otra llamada por tarjeta.
- Insignias arriba a la izquierda:
  - "-{N}%" en color oferta cuando `precioOfertaCentavos` existe (`N = round((1 - oferta / precio) * 100)`).
  - "Sin stock" en gris cuando `disponible` es 0. En ese caso la foto se ve un poco atenuada.
- Debajo de la foto:
  - El nombre, en dos líneas como máximo.
  - El precio que se cobra en negrita y, si hay oferta, el precio normal tachado al lado.
  - Si hay descuento por transferencia: una línea en verde, "{precio con descuento} con transferencia".
  - Si hay cuotas: "{N} cuotas sin interés de {precio / N}".
- Toda la tarjeta es un link a `/producto/{slug}`.

**Terminado cuando:** la portada carga con datos reales, el carrusel funciona con el dedo y solo, y una sección vacía no deja huecos.

---

## 4. Fase 4: listados de productos

Todas las listas usan la misma página base y el mismo componente `Listado.astro`:

| Ruta | Qué muestra | Parámetro de la API |
| --- | --- | --- |
| `/productos` | Todos | — |
| `/categoria/[slug]` | Una categoría | `categoria=slug` |
| `/coleccion/[slug]` | Una colección | `coleccion=slug` |
| `/ofertas` | En oferta | `oferta=1` |
| `/buscar?q=` | Búsqueda | `q=` |

Si el slug no existe en `/api/catalogo/filtros`, responder 404.

**Encabezado del listado:**

- Migas de pan (Inicio › Categoría).
- Título y cantidad de resultados ("24 productos").
- A la derecha, "Ordenar por": Más nuevos, Menor precio, Mayor precio (`orden=precio_asc|precio_desc`).

**Filtros:**

- **Escritorio:** columna izquierda fija, con secciones desplegables:
  - **Categoría:** links, solo en `/productos`, `/ofertas` y `/buscar`.
  - **Talle:** botones cuadrados que se pueden marcar varios.
  - **Color:** círculos de color con el nombre al lado; se pueden marcar varios.
  - **Precio:** desde y hasta, en pesos, con botón "Aplicar".
- **Celular:** botón "Filtrar" junto a "Ordenar" que abre un panel lateral (isla `Filtros`) con las mismas secciones, el botón "Ver {N} resultados" y "Limpiar filtros".
- Los filtros activos se muestran como chips sobre la grilla, cada uno con una × para quitarlo, más "Limpiar todo".
- **Todo filtro vive en la dirección** (`?talle=3,4&color=1&min=1000000&orden=precio_asc&pagina=2`): se puede compartir, el botón "atrás" funciona y la página se arma en el servidor. Sin JavaScript, los filtros funcionan como links y formularios comunes.

**Grilla y páginas:**

- Grilla de `TarjetaProducto`: 2 columnas en el celular, 3 en tablet y 4 en escritorio.
- Paginación con números al pie (24 por página): "Anterior", 1 2 3 … y "Siguiente". Opcional: un botón "Mostrar más" que agrega la página siguiente sin recargar, sin perder la paginación por links.
- **Sin resultados:** ícono, "No encontramos productos con estos filtros", un botón "Limpiar filtros" y 4 productos nuevos.

**Terminado cuando:** cada combinación de filtros devuelve lo correcto, la dirección refleja los filtros, el botón "atrás" funciona, y en el celular los filtros se manejan desde el panel lateral.

---

## 5. Fase 5: ficha de producto (`/producto/[slug]`)

Usa `GET /api/catalogo/productos/{slug}` (404 si no existe o no está publicado). En el celular se apila; en escritorio son dos columnas: galería a la izquierda (60%) y compra a la derecha (40%, fija al hacer scroll).

### Galería

- Escritorio: foto grande con miniaturas verticales a la izquierda. Celular: fotos deslizables con puntos indicadores.
- Al tocar la foto se abre a pantalla completa (`<dialog>`), con `grande.webp`, flechas, deslizamiento y cierre con Escape.
- **Al elegir un color, la galería muestra primero las fotos de ese color** (`imagenes[].colorId`) y después las generales.

### Bloque de compra

1. Migas de pan y nombre (`h1`).
2. Precio: el que se cobra grande; si hay oferta, el normal tachado y la insignia "-{N}%".
3. Debajo:
   - "{precio con transferencia} pagando con transferencia" (si hay descuento).
   - "{N} cuotas sin interés de {…}" (si están activas).
   - Link "Ver medios de pago", que abre un modal con los dos medios y sus condiciones (los textos salen de `/api/tienda`).
4. **Selector de variantes** (isla `SelectorVariantes`):
   - **Color:** círculos con el color (`hex`) y el texto "Color: Negro" encima. Si solo hay un color o ninguno, no se muestra.
   - **Talle:** botones con el nombre del talle. Los que no tienen stock para el color elegido se ven tachados y no se pueden elegir. Si solo hay un talle o ninguno, no se muestra.
   - Al lado del título del talle, link "Guía de talles" que abre un modal con `guiaTalles` (texto; respetar saltos de línea). Si no hay guía, no se muestra.
   - Mientras falte elegir talle o color, el botón dice "Elegí un talle" y está deshabilitado.
   - Con stock entre 1 y `ultimasUnidadesUmbral`: "¡Últimas {n} unidades!" en color oferta. Con stock 0 en la combinación: "Sin stock".
   - La combinación elegida se refleja en la dirección (`?variante=40`), así se puede compartir.
5. **Cantidad:** controles − y + entre 1 y el stock disponible (y nunca más que `maxUnidadesPorPedido`).
6. **"Agregar al carrito":** botón principal de ancho completo. Al tocarlo suma la variante al carrito y abre el **carrito lateral** (fase 6). Si el producto entero está sin stock, el botón dice "Sin stock" y está deshabilitado.
7. **"Calculá el envío"** (isla `CotizadorEnvio`):
   - Campo de código postal con botón "Calcular", que llama a `POST /api/envios/cotizar`.
   - Muestra cada opción con su ícono (domicilio o sucursal), el correo, el nombre de la zona y el precio. Si el precio de esta compra llega a `gratisDesdeCentavos`, dice "Gratis".
   - Si el retiro está habilitado, suma "Retiro en persona — Gratis" con la dirección.
   - Guarda el código postal en `localStorage` para reutilizarlo en el carrito y en el checkout.
   - Link "No sé mi código postal" a `https://www.correoargentino.com.ar/formularios/cpa`.
8. Compartir: botón de WhatsApp con el link del producto.

### Debajo

- Pestañas, o secciones desplegables en el celular: **Descripción**, **Material y cuidados** y **Cambios y devoluciones** (el texto de `contenido_politica_cambios`, resumido con link a la página). Las secciones vacías no se muestran.
- **"También te puede gustar":** `relacionados`, en una fila deslizable.

### SEO

- `<title>` "{nombre} | Sukhä" y descripción con los primeros 155 caracteres de la descripción del producto.
- Open Graph con la primera foto `grande.webp`.
- JSON-LD `Product` con `offers` (precio, `ARS`, `availability` según stock).

**Terminado cuando:** elegir color cambia las fotos, los talles sin stock no se pueden elegir, el aviso de "últimas unidades" aparece cuando corresponde, agregar abre el carrito lateral con la prenda correcta y el cotizador muestra las zonas reales.

---

## 6. Fase 6: carrito

### Estado (`src/lib/carrito.ts`)

- `nanostores` con persistencia en `localStorage`, en la clave `sukha:carrito`.
- Cada línea guarda `{ varianteId, cantidad }` más una copia para mostrar al instante: nombre, slug, talle, color, foto y precio. **Esa copia es solo visual: los totales siempre salen de `POST /api/carrito/validar`.**
- Funciones: `agregar`, `cambiarCantidad`, `quitar`, `vaciar` y `validar(cp?, zonaEnvioId?, cupon?, metodoPago?)`.
- Si se agrega una variante que ya está en el carrito, se suma la cantidad. El total nunca supera el stock ni `maxUnidadesPorPedido`.

### Carrito lateral (isla `CarritoLateral`, montada en el layout)

- Se abre desde la derecha, ocupando todo el ancho en el celular y unos 420px en escritorio, con un fondo oscuro detrás. Se cierra con ×, tocando afuera o con Escape. El foco queda atrapado adentro mientras está abierto.
- Título "Tu carrito ({n})".
- Una fila por prenda: foto, nombre, talle y color, precio unitario, controles − y +, y un ícono de tacho para quitarla.
- Al abrirse valida con la API:
  - Si una prenda ya no está o quedan menos, se muestra un aviso en esa fila ("Quedan 2" o "Ya no está disponible"), con el ajuste ya hecho o el botón para quitarla.
  - Mientras valida, los montos muestran un esqueleto de carga.
- Subtotal (el que devuelve la API).
- Botones: "Iniciar compra" (principal, lleva a `/checkout`) y "Ver carrito" (secundario, lleva a `/carrito`).
- Vacío: ícono, "Tu carrito está vacío" y botón "Ver productos".

### Página `/carrito`

- Lo mismo que el carrito lateral, en una página: tabla en escritorio y tarjetas en el celular.
- Suma el **cotizador de envío** (precompletado con el código postal guardado), con el que se elige la opción de envío, y muestra el total estimado con envío.
- A la derecha (o abajo en el celular), un resumen con subtotal, envío ("A calcular" si no hay código postal) y total, más el botón "Iniciar compra".
- Debajo, una fila de 4 productos nuevos.

**Terminado cuando:** el contador de la cabecera, el carrito lateral y la página muestran siempre lo mismo (también entre pestañas del navegador, con el evento `storage`); si cambia el stock, el carrito lo avisa y se corrige; y recargar la página no pierde el carrito.

---

## 7. Fase 7: checkout (`/checkout`)

Estilo checkout de Tiendanube: **cabecera mínima** (solo el logo, sin menú ni buscador, y la leyenda "Compra 100% segura" con un candado), una columna de pasos y una columna de resumen. Es una isla `Checkout` grande; la página del servidor solo le pasa `/api/tienda`.

Si el carrito está vacío, redirigir a `/carrito`.

### Resumen (columna derecha en escritorio; en el celular, una barra plegable arriba: "Ver resumen · $ 80.900")

- Prendas con foto chica, nombre, talle, color y cantidad (con un número en un globito sobre la foto, como en Tiendanube), y el precio.
- "¿Tenés un cupón de descuento?": se despliega un campo con el botón "Aplicar". Si la API devuelve `cuponRechazado`, se muestra ese motivo en rojo debajo del campo.
- Subtotal, cada descuento por separado (`descuentos[]`: el cupón y el descuento por transferencia), envío y **Total**. Siempre de `POST /api/carrito/validar`, que se vuelve a llamar cada vez que cambia el cupón, la entrega o el medio de pago.

### Pasos (todos en la misma página, cada uno se completa y se pliega mostrando un resumen con "Editar")

1. **Contacto:**
   - Email (con tipo email).
   - Casilla "Quiero recibir novedades y promociones" (`aceptaNovedades`), sin marcar por defecto.
   - Botón "Continuar".
2. **Entrega:**
   - Código postal (precompletado si está guardado). Al ingresarlo, se listan las opciones de `POST /api/envios/cotizar` como tarjetas que se eligen (radio): ícono, correo, modalidad, nombre, precio o "Gratis". Si el retiro está habilitado, se suma "Retiro en persona" con dirección y horario.
   - Según lo elegido:
     - **Domicilio:** nombre y apellido, teléfono, DNI, calle, altura, piso y depto (opcional), localidad, provincia (desplegable con las 24 jurisdicciones) e indicaciones (opcional). El código postal ya está cargado.
     - **Sucursal:** nombre y apellido, teléfono, DNI, sucursal del correo (texto, con la ayuda "Escribí el nombre o la dirección de la sucursal donde querés retirar"), provincia y localidad.
     - **Retiro:** nombre y apellido, teléfono y DNI.
   - Plegado: "Factura A (opcional)", con CUIT y condición frente al IVA.
   - Botón "Continuar".
3. **Pago:**
   - Dos tarjetas que se eligen:
     - **Mercado Pago:** "Tarjetas de crédito, débito, dinero en cuenta y efectivo"; si hay cuotas, "Hasta {N} cuotas sin interés".
     - **Transferencia bancaria:** con la etiqueta verde "{X}% OFF". Al elegirla, el resumen se actualiza con el descuento.
   - Texto de la reserva: "Reservamos tus prendas por {X} minutos con Mercado Pago y por {Y} horas con transferencia", con los valores de `/api/tienda` (fase 1).
   - Casilla obligatoria: "Acepto los términos y la política de cambios", con link.
   - Botón **"Finalizar compra"**.

### Validaciones

- Mismas reglas que el backend (ver `NuevoPedido` en `docs/API.md`):
  - DNI de 7 u 8 números.
  - Teléfono de 6 a 25 caracteres.
  - Email válido.
  - Campos obligatorios según la forma de entrega.
- Los mensajes van debajo de cada campo, en rojo, y se muestran al salir del campo o al tocar "Continuar", no mientras se escribe.
- Si el servidor rechaza el pedido (código 400 o 409), mostrar su mensaje arriba del botón. Si el problema es de stock, ofrecer "Volver al carrito".

### Al finalizar

- `claveIdempotencia`: se genera una vez al entrar al checkout (`crypto.randomUUID()` sin guiones), se guarda en `sessionStorage` y se reutiliza en cada reintento del mismo intento de compra. Se borra al recibir la respuesta exitosa.
- Incluir el campo señuelo `comentarioExtra`: un campo oculto fuera de pantalla, nunca con `display:none`, cuyo valor se manda tal cual.
- El botón se deshabilita y dice "Procesando…" mientras espera.
- Respuesta 201 o 200:
  - Se vacía el carrito.
  - Se guarda `{ numero, token }` en `localStorage` (`sukha:ultimos-pedidos`, hasta 5), para que "Buscar mi pedido" pueda ofrecerlos.
  - **Mercado Pago** con `urlPago`: redirigir ahí. Sin `urlPago`: ir a `/pedido/{token}`, donde está el botón para reintentar.
  - **Transferencia:** ir a `/pedido/{token}`.
- Persistir los datos ya cargados en `sessionStorage`, para que un error o una recarga no obliguen a volver a escribir todo.

### Accesibilidad

- Cada campo con su `<label>` y `autocomplete` correcto (`email`, `name`, `tel`, `postal-code`, `address-line1`, `address-level2`, `address-level1`).
- `inputmode="numeric"` en DNI, código postal y altura.

**Terminado cuando:** se puede comprar de punta a punta en local con transferencia y con retiro; con Mercado Pago redirige (en staging, con el token de prueba); un doble clic no crea dos pedidos; recargar a mitad de camino no pierde los datos; y en el celular el resumen se pliega y se despliega.

---

## 8. Fase 8: después de la compra

### `/pedido/[token]`: seguimiento (página obligatoria)

Los emails y Mercado Pago llevan acá. Usa `GET /api/pedidos/{token}`; si no existe, mostrar un 404 propio.

- **No** cargar Google Analytics ni el píxel de Meta en esta página: la dirección lleva el token del pedido.
- Encabezado según el estado:
  - `pendiente_pago` con transferencia: "¡Recibimos tu pedido!" y una caja destacada con el monto, el alias con botón **"Copiar"**, el titular, el aviso "Mandanos el comprobante por WhatsApp" (botón de WhatsApp con un mensaje prearmado que incluye el número de pedido) y la cuenta regresiva hasta `reservaVenceEn`.
  - `pendiente_pago` con Mercado Pago: "Tu pago está pendiente", botón **"Pagar ahora"** (`POST /api/pedidos/{token}/pago` y redirigir a `urlPago`) y el vencimiento.
  - `pagado` o `en_preparacion`: "¡Gracias por tu compra!".
  - `enviado`: número de seguimiento con botón "Copiar".
  - `listo_para_retirar`: dirección y horario de retiro.
  - `cancelado`: "Tu pedido se canceló porque no recibimos el pago a tiempo".
  - `a_revisar`: "Estamos revisando tu pago, te vamos a escribir".
- **Línea de pasos** con íconos: Pedido recibido, Pagado, En preparación, Enviado o Listo para retirar, Entregado. Las fechas salen de `historial`.
- Detalle: prendas, descuentos, envío, total, forma de entrega y medio de pago.
- Si el estado lo permite (pagado, en preparación, enviado, listo para retirar o entregado): botón "Solicitar un cambio o devolución", que abre un formulario con el tipo (cambio o devolución), las prendas con su cantidad y el motivo, y llama a `POST /api/pedidos/{token}/solicitudes`. Al enviarlo muestra "Recibimos tu solicitud. Te vamos a contactar".

### `/pedido/buscar`: buscar mi pedido

- Formulario con número de pedido (SUK-0012) y email, que usa `POST /api/pedidos/buscar` (fase 1) y redirige a `/pedido/{token}`.
- Si hay pedidos guardados en `localStorage`, se ofrecen arriba: "Tus pedidos recientes en este dispositivo".

### `/arrepentimiento`: botón de arrepentimiento

- Texto legal breve: "Tenés 10 días corridos desde que recibiste tu compra para arrepentirte, sin costo. Ley 24.240, art. 34".
- Formulario con número de pedido, email y motivo (opcional). Busca el pedido y crea la solicitud con `tipo: 'arrepentimiento'` y todas las prendas.
- Muestra un código de confirmación: el id de la solicitud que devuelve la API.

**Terminado cuando:** cada estado se ve bien (forzándolos desde el panel local), copiar el alias funciona, "Pagar ahora" redirige y una solicitud aparece en `/admin/solicitudes`.

---

## 9. Fase 9: páginas de información y extras

- `/quienes-somos`, `/cambios-y-devoluciones`: el texto de `contenido_quienes_somos` y `contenido_politica_cambios`, respetando párrafos (cortar por líneas vacías y renderizar como `<p>`). **Nunca** insertarlos como HTML.
- `/preguntas-frecuentes`: `contenido_preguntas_frecuentes` es una lista `[{ pregunta, respuesta }]`. Se muestra como acordeón con `<details>`.
- `/contacto`: tarjetas con WhatsApp, Instagram y email (solo las configuradas) y el horario de retiro si aplica. No hay formulario de contacto en la API: no inventar uno.
- `/novedades/baja/[token]`: llama a `POST /api/novedades/baja/{token}` y muestra "Te diste de baja. No vas a recibir más novedades".
- Cada página con su `<title>` y descripción.
- `robots.txt`: permite todo salvo `/admin`, `/api`, `/checkout`, `/carrito` y `/pedido`, y apunta al sitemap.
- `/sitemap.xml`: generado en el servidor con `GET /api/catalogo/sitemap` (fase 1). Incluye inicio, listados, productos, categorías, colecciones y páginas de información.

---

## 10. Fase 10: calidad, pruebas y publicación

1. **Accesibilidad:**
   - Contraste AA.
   - Foco visible en todo lo que se toca.
   - Los paneles laterales y los modales atrapan el foco y se cierran con Escape.
   - Textos alternativos en las fotos (`textoAlternativo`, o el nombre del producto si no hay).
   - Botones de solo ícono con `aria-label`.
2. **Rendimiento:**
   - Todas las fotos con `width` y `height` (o `aspect-ratio`) para que no salte el diseño, y `loading="lazy"` salvo la primera de la página.
   - Las islas se hidratan con `client:idle` o `client:visible`, salvo el carrito, que usa `client:load`.
   - El JavaScript total de una ficha de producto no debería pasar de unos 60 KB comprimidos.
3. **Celular primero:** revisar cada pantalla a 375px, 768px y 1280px. Nada se desborda de costado, y todo lo que se toca mide al menos 44px.
4. **Prueba de punta a punta:** extender o sumar un script (estilo `apps/backend/scripts/e2e.ts`, o con el Chromium preinstalado y Playwright si está disponible) que recorra: portada → categoría → filtro → producto → agregar → carrito → checkout con transferencia → seguimiento.
5. **Checks:** `npm run check -w @sukha/backend`, `npm test -w @sukha/backend` y `npm run build` sin errores ni advertencias nuevas.
6. **Publicar en staging** (backend primero, después frontend) y recorrer la tienda ahí: comprar con transferencia y, si Fabrizio cargó el token de prueba, con Mercado Pago.
7. Actualizar `README.md` con las rutas de la tienda y cómo cargar datos de prueba.

---

## Resumen de pantallas

| Ruta | Pantalla |
| --- | --- |
| `/` | Portada |
| `/productos`, `/ofertas`, `/buscar?q=` | Listados |
| `/categoria/[slug]`, `/coleccion/[slug]` | Listados por categoría o colección |
| `/producto/[slug]` | Ficha de producto |
| `/carrito` | Carrito (además del carrito lateral) |
| `/checkout` | Checkout |
| `/pedido/[token]` | Seguimiento y confirmación |
| `/pedido/buscar` | Buscar mi pedido |
| `/arrepentimiento` | Botón de arrepentimiento |
| `/quienes-somos`, `/preguntas-frecuentes`, `/cambios-y-devoluciones`, `/contacto` | Información |
| `/novedades/baja/[token]` | Baja de newsletter |
| `/404` | No encontrado |
| `/robots.txt`, `/sitemap.xml` | SEO |

## Componentes e islas

| Nombre | Tipo | Dónde |
| --- | --- | --- |
| `Tienda.astro` | Layout | Todas las páginas salvo el checkout |
| `Checkout.astro` | Layout mínimo | `/checkout` |
| `Logo`, `BarraAnuncios`, `Cabecera`, `MenuMovil`, `Pie`, `WhatsappFlotante` | Astro | Layout |
| `TarjetaProducto`, `Grilla`, `Precio`, `Insignia`, `Migas`, `Paginacion`, `Vacio` | Astro | En toda la tienda |
| `Carrusel`, `FilaDeslizable` | Astro + script mínimo | Portada, ficha |
| `Buscador` | Isla Preact | Cabecera |
| `ContadorCarrito`, `CarritoLateral` | Islas Preact | Cabecera y layout |
| `Filtros` (celular) | Isla Preact | Listados |
| `Galeria`, `SelectorVariantes`, `CotizadorEnvio` | Islas Preact | Ficha (el cotizador también en el carrito) |
| `Checkout` | Isla Preact | `/checkout` |
| `Newsletter`, `CopiarTexto`, `CuentaRegresiva` | Islas chicas | Pie y seguimiento |

## Fuera de alcance (no hacer ahora)

- Cuentas de clientas con login, lista de favoritos, reseñas de productos, recuperación de carrito abandonado, sincronización con Instagram o Facebook, multi-idioma y modo oscuro de la tienda.
- Logo, colores y tipografía de la marca: se aplican después, cambiando los tokens de `tienda.css` y el componente `Logo`.
- Google Analytics y el píxel de Meta: se suman después, en el layout, salvo en `/pedido/*`.
