# API de Sukhä

Todo lo que necesita la vista de la clienta. La API vive en el mismo dominio que la tienda, bajo `/api`, así que desde el navegador se llama con rutas relativas (`fetch('/api/portada')`).

- **Staging:** `https://sukha-frontend-staging.sukha-frontend.workers.dev/api`
- **Producción:** `https://sukhaind.com.ar/api` (todavía sin publicar)

## Reglas generales

- Se manda y se recibe JSON (`Content-Type: application/json`).
- **Los montos van siempre en centavos, como enteros.** `1850000` es $18.500,00. Para mostrar: `(centavos / 100).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })`.
- Las fechas son texto ISO en UTC: `2026-10-13T04:00:00.000Z`.
- Si algo sale mal, la respuesta trae un código de error y `{ "error": "mensaje para mostrarle a la clienta" }`.

| Código | Qué significa |
| --- | --- |
| 200 / 201 | Salió bien |
| 400 | Algún dato está mal (el mensaje dice cuál) |
| 404 | No existe |
| 409 | No se puede en este momento: sin stock, cupón agotado, etc. |
| 413 | El pedido a la API es demasiado grande |
| 429 | Demasiados intentos; reintentar en un minuto |

Límites por visitante: 120 llamadas por minuto en total, 3 pedidos nuevos por minuto y hasta 3 pedidos sin pagar abiertos a la vez.

## Fotos

Las fotos se devuelven como una `clave`. Cada foto de producto existe en tres tamaños:

```
/api/imagenes/{clave}/chico.webp
/api/imagenes/{clave}/mediano.webp
/api/imagenes/{clave}/grande.webp
```

Los banners traen la clave completa: `/api/imagenes/{clave}`.

## Portada y datos de la tienda

### `GET /api/portada`

Todo lo de la home en una llamada.

```json
{
  "banners": [{ "clave": "banners/…/escritorio.webp", "claveMovil": null, "textoAlternativo": "Nueva colección", "enlace": "/categoria/vestidos" }],
  "destacados": [ /* tarjetas de producto, hasta 8 */ ],
  "nuevos": [ /* hasta 8, los más recientes */ ],
  "ofertas": [ /* hasta 8, con precio de oferta */ ]
}
```

Una **tarjeta de producto** es:

```json
{
  "id": 12,
  "nombre": "Vestido Lino",
  "slug": "vestido-lino",
  "precioCentavos": 4500000,
  "precioOfertaCentavos": 3900000,
  "categoria": "vestidos",
  "foto": "productos/12/…",
  "disponible": 1
}
```

`precioOfertaCentavos` es `null` si no está en oferta (si viene, es el precio que se cobra y `precioCentavos` va tachado). `disponible` es `0` cuando está agotado: se muestra igual, con el cartel "Agotado". `foto` puede ser `null`.

### `GET /api/tienda`

Datos generales y textos que se editan desde el panel.

```json
{
  "descuentoTransferenciaPorcentaje": 10,
  "cuotasSinInteres": { "cantidad": 3 },
  "reservaMercadoPagoMinutos": 30,
  "reservaTransferenciaHoras": 48,
  "emailContacto": "hola@sukhaind.com.ar",
  "datosLegales": "Razón social, CUIT y domicilio",
  "retiro": { "direccion": "…", "horario": "…" },
  "barraAnuncios": "Envío gratis desde $100.000",
  "whatsapp": "+5493510000000",
  "instagram": "sukha.ind",
  "ultimasUnidadesUmbral": 3,
  "maxUnidadesPorPedido": 10,
  "contenido": { "contenido_quienes_somos": { }, "contenido_preguntas_frecuentes": [ ] }
}
```

`cuotasSinInteres` es `null` si las cuotas están desactivadas. `retiro` es `null` si no se ofrece retiro en persona. `emailContacto` y `datosLegales` pueden venir vacíos: en ese caso, no mostrarlos. `contenido` trae cada texto tal como se cargó en el panel.

## Catálogo

### `GET /api/catalogo/filtros`

Opciones para armar los filtros.

```json
{
  "categorias": [{ "nombre": "Ropa", "slug": "ropa", "hijas": [{ "nombre": "Vestidos", "slug": "vestidos" }] }],
  "colecciones": [{ "nombre": "Verano 2027", "slug": "verano-2027" }],
  "talles": [{ "id": 3, "nombre": "M", "orden": 3 }],
  "colores": [{ "id": 1, "nombre": "Negro", "hex": "#000000" }],
  "precio": { "min": 1500000, "max": 9000000 }
}
```

`categorias` trae las categorías principales visibles, cada una con sus subcategorías en `hijas` (en el orden del panel). Si una principal está oculta, ni ella ni sus subcategorías aparecen. `talles` y `colores` incluyen solo los que tienen stock en algún producto publicado. `precio` es el rango (en centavos) de los productos publicados: `{ "min": 0, "max": 0 }` si no hay ninguno.

### `GET /api/catalogo/productos`

Listado paginado de a 24. Todos los parámetros son opcionales y se combinan.

| Parámetro | Ejemplo | Qué hace |
| --- | --- | --- |
| `categoria` | `vestidos` | Slug de una categoría o subcategoría. Con una principal (`ropa`) salen también los productos de sus subcategorías |
| `coleccion` | `verano-2027` | Slug de la colección |
| `talle` | `3` o `3,4` | Id del talle (varios separados por coma); solo productos con stock en alguno de ellos |
| `color` | `1` o `1,2` | Id del color (varios separados por coma); solo productos con stock en alguno de ellos |
| `min`, `max` | `2000000` | Rango de precio, en centavos |
| `q` | `lino` | Busca en el nombre |
| `oferta` | `1` | Solo productos en oferta |
| `destacado` | `1` | Solo destacados |
| `orden` | `precio_asc`, `precio_desc` | Por defecto, los más nuevos primero |
| `pagina` | `2` | Página, desde 1 |
| `limite` | `5` | Cantidad de resultados (de 1 a 24; por defecto 24). Útil para las sugerencias del buscador |

```json
{ "productos": [ /* tarjetas */ ], "total": 57, "pagina": 1, "porPagina": 24 }
```

### `GET /api/catalogo/productos/{slug}`

Ficha del producto. Da 404 si no existe o no está publicado.

```json
{
  "id": 12,
  "nombre": "Vestido Lino",
  "slug": "vestido-lino",
  "descripcion": "…",
  "material": "100% lino",
  "cuidados": "Lavar a mano",
  "precioCentavos": 4500000,
  "precioOfertaCentavos": null,
  "categoria": "Vestidos",
  "categoriaSlug": "vestidos",
  "categoriaPadre": { "nombre": "Ropa", "slug": "ropa" },
  "guiaTalles": { },
  "variantes": [{ "id": 40, "talle": "M", "color": "Negro", "colorId": 1, "hex": "#000000", "stock": 4 }],
  "imagenes": [{ "clave": "productos/12/…", "colorId": 1, "textoAlternativo": "Vestido negro de frente" }],
  "relacionados": [ /* hasta 4 tarjetas de la misma categoría */ ]
}
```

- `categoriaPadre` es la categoría principal si la del producto es una subcategoría (para las migas de pan), o `null`. `guiaTalles` usa la de la subcategoría y, si no tiene, la de su principal.
- Una **variante** es la combinación talle + color; es lo que va al carrito, por su `id`. `talle` y `color` pueden ser `null` (un accesorio sin opciones tiene una sola variante).
- `stock` es lo disponible para vender ahora. Con `0`, esa combinación está agotada. Con `stock <= ultimasUnidadesUmbral` se puede mostrar "últimas unidades".
- Las imágenes con `colorId` son de ese color; con `null` son generales.

### `GET /api/catalogo/sitemap`

Todo lo público, para armar el `sitemap.xml`.

```json
{
  "productos": [{ "slug": "vestido-lino", "actualizadoEn": "2026-10-13T04:00:00.000Z" }],
  "categorias": ["vestidos"],
  "colecciones": ["verano-2027"]
}
```

## Carrito y envío

El carrito se guarda en el navegador (por ejemplo en `localStorage`) como una lista de `{ varianteId, cantidad }`. El servidor nunca confía en los precios del navegador: siempre recalcula.

### `POST /api/envios/cotizar`

```json
{ "codigoPostal": "5000" }
```

Acepta también el formato largo (`X5000ABC`). Devuelve las opciones que llegan a ese código postal; puede venir vacío.

```json
[{ "zonaEnvioId": 2, "nombre": "Córdoba capital", "transporte": "andreani", "modalidad": "domicilio", "precioCentavos": 800000, "gratisDesdeCentavos": 10000000 }]
```

`modalidad` es `domicilio` o `sucursal`. `gratisDesdeCentavos` es el subtotal desde el que ese envío sale gratis (`null` si no tiene).

### `POST /api/carrito/validar`

Para mostrar el carrito y el resumen del checkout con el total real.

```json
{
  "items": [{ "varianteId": 40, "cantidad": 2 }],
  "cupon": "HOLA10",
  "zonaEnvioId": 2,
  "codigoPostal": "5000",
  "metodoPago": "transferencia"
}
```

Solo `items` es obligatorio. `metodoPago` es `mercadopago` (por defecto) o `transferencia`.

```json
{
  "lineas": [{ "varianteId": 40, "sku": "P12-T3-C1", "nombre": "Vestido Lino", "talle": "M", "color": "Negro", "precioCentavos": 4500000, "cantidad": 2 }],
  "problemas": [{ "varianteId": 41, "motivo": "Vestido Lino: quedan 1.", "disponible": 1 }],
  "subtotalCentavos": 9000000,
  "descuentoCentavos": 1710000,
  "envioCentavos": 800000,
  "totalCentavos": 8090000,
  "descuentos": [{ "tipo": "cupon", "descripcion": "Cupón HOLA10", "montoCentavos": 900000 }],
  "cuponRechazado": null,
  "envio": { "zonaEnvioId": 2, "nombre": "Córdoba capital", "precioCentavos": 800000 }
}
```

- `problemas` lista lo que no se puede comprar tal como está (agotado, queda menos, ya no existe). Esas variantes no entran en `lineas` ni en el total: hay que avisarle a la clienta y ajustar el carrito.
- `cuponRechazado` trae el motivo si el cupón no se aplicó.

## Pedido

### `POST /api/pedidos`

Crea el pedido y reserva el stock.

```json
{
  "claveIdempotencia": "f3b1c2d4e5a697887766554433221100",
  "items": [{ "varianteId": 40, "cantidad": 2 }],
  "nombre": "María Pérez",
  "email": "maria@ejemplo.com",
  "telefono": "351 555-0000",
  "dni": "30111222",
  "entrega": {
    "metodoEntrega": "domicilio",
    "zonaEnvioId": 2,
    "calle": "San Martín",
    "altura": "123",
    "pisoDepto": "2 B",
    "localidad": "Córdoba",
    "provincia": "Córdoba",
    "codigoPostal": "5000",
    "indicaciones": "Timbre roto"
  },
  "metodoPago": "mercadopago",
  "cupon": "HOLA10",
  "aceptaNovedades": false,
  "comentarioExtra": ""
}
```

- **`claveIdempotencia`**: generala una sola vez al abrir el checkout (`crypto.randomUUID().replaceAll('-', '')`) y mandá siempre la misma mientras sea el mismo intento de compra. Si la clienta hace doble clic o se corta la conexión y reintenta, no se crea un segundo pedido: vuelve el mismo, con código 200.
- **`entrega`** tiene tres formas:
  - `domicilio`: `zonaEnvioId`, `calle`, `altura`, `localidad`, `provincia`, `codigoPostal`; opcionales `pisoDepto`, `indicaciones`.
  - `sucursal`: `zonaEnvioId`, `sucursalCorreo`, `provincia`, `codigoPostal`; opcional `localidad`.
  - `retiro`: solo `{ "metodoEntrega": "retiro" }`. Requiere que el retiro esté habilitado (ver `/api/tienda`).
- La `zonaEnvioId` tiene que ser una de las que devolvió `/api/envios/cotizar` para ese código postal y coincidir con la modalidad.
- `cupon`, `aceptaNovedades`, `cuit` (11 números) y `condicionIva` son opcionales.
- **`comentarioExtra`** es el campo señuelo contra bots: va oculto en el formulario y se manda tal cual. Si llega con texto, el pedido se rechaza. Ver el `README.md`.

Respuesta (201):

```json
{
  "numero": "SUK-0012",
  "token": "9f1c…64 caracteres…",
  "urlPago": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=…",
  "pedido": { /* igual que el seguimiento */ }
}
```

Qué hacer después:

- **Mercado Pago:** redirigir a `urlPago`. Al terminar, Mercado Pago devuelve a la clienta a `/pedido/{token}`. Si `urlPago` vino `null` (Mercado Pago no respondió), el pedido igual existe: mostrar el seguimiento con un botón que llame a `POST /api/pedidos/{token}/pago`.
- **Transferencia:** ir a `/pedido/{token}` y mostrar `pedido.transferencia` (alias, titular y monto).
- En los dos casos, vaciar el carrito y guardar el `token`: es la única llave para ver ese pedido.

La reserva dura 30 minutos con Mercado Pago y 48 horas con transferencia. Si no se paga, el pedido se cancela solo y el stock vuelve.

### `GET /api/pedidos/{token}`

Seguimiento. La página `/pedido/{token}` de la tienda tiene que existir, porque los emails y Mercado Pago llevan ahí.

```json
{
  "numero": "SUK-0012",
  "estado": "pendiente_pago",
  "creadoEn": "2026-10-13T04:00:00.000Z",
  "nombre": "María Pérez",
  "metodoEntrega": "domicilio",
  "numeroSeguimiento": null,
  "metodoPago": "transferencia",
  "subtotalCentavos": 9000000,
  "descuentoCentavos": 1710000,
  "envioCentavos": 800000,
  "totalCentavos": 8090000,
  "reservaVenceEn": "2026-10-15T04:00:00.000Z",
  "items": [{ "id": 77, "nombre": "Vestido Lino", "talle": "M", "color": "Negro", "precioUnitarioCentavos": 4500000, "cantidad": 2 }],
  "descuentos": [{ "descripcion": "Cupón HOLA10", "montoCentavos": 900000 }],
  "historial": [{ "estado": "pendiente_pago", "fecha": "2026-10-13T04:00:00.000Z" }],
  "transferencia": { "alias": "sukha.ind", "titular": "…", "montoCentavos": 8090000 },
  "retiro": null
}
```

Estados posibles: `pendiente_pago`, `pagado`, `en_preparacion`, `enviado`, `listo_para_retirar`, `entregado`, `cancelado`, `reembolsado`, `a_revisar` (este último mostralo como "estamos revisando tu pago").

`transferencia` solo viene mientras el pedido espera una transferencia. `reservaVenceEn` solo mientras está pendiente de pago.

> No cargues Google Analytics ni el píxel de Meta en esta página: la dirección contiene el `token`, que es la llave del pedido.

### `POST /api/pedidos/buscar`

Para encontrar un pedido sin el link (por ejemplo, si la clienta perdió el email).

```json
{ "numero": "SUK-0012", "email": "maria@ejemplo.com" }
```

Devuelve `{ "token": "…" }`, con el que se arma `/pedido/{token}`. El número se acepta como "SUK-0012" o "12"; el email, sin importar mayúsculas. Si no coincide, responde 404 con "No encontramos un pedido con esos datos", siempre el mismo mensaje.

### `POST /api/pedidos/{token}/pago`

Sin cuerpo. Devuelve `{ "urlPago": "…" }` para reintentar el pago con Mercado Pago mientras dure la reserva.

### `POST /api/pedidos/{token}/solicitudes`

Botón de arrepentimiento, cambio o devolución. Solo para pedidos ya pagados.

```json
{ "tipo": "devolucion", "motivo": "No me quedó", "items": [{ "pedidoItemId": 77, "cantidad": 1 }] }
```

`tipo` es `arrepentimiento`, `cambio` o `devolucion`. Sin `items` (o vacío), la solicitud abarca todo el pedido. `pedidoItemId` es el `id` de cada ítem del seguimiento. Devuelve `{ "id": 5, "numero": "SUK-0012" }`.

## Novedades

### `POST /api/novedades`

```json
{ "email": "maria@ejemplo.com", "comentarioExtra": "" }
```

Suscribe al newsletter. `comentarioExtra` es el mismo campo señuelo del pedido.

### `POST /api/novedades/baja/{token}`

Da de baja; el token llega en el link de cada email de novedades.

## Páginas que la tienda tiene que tener

Estas direcciones están "prometidas" por el backend, así que tienen que existir en la vista de la clienta:

| Dirección | Quién manda ahí |
| --- | --- |
| `/pedido/{token}` | Los emails de pedido y la vuelta de Mercado Pago |
| Las que pongas en `enlace` de cada banner | El carrusel de la portada (por ejemplo `/categoria/vestidos`) |

Todo lo que empiece con `/admin` y `/api` está reservado.

## Panel

Las rutas `/api/admin/*` son del panel de administración, exigen sesión y no hacen falta para la tienda. Están listadas en `apps/backend/src/routes/admin.routes.ts`.
