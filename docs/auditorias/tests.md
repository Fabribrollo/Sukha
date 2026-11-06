# Auditoría de tests en navegador · Sukhä

Fecha: 2026-10-29 · Paquete 1.3 · Alcance: `tests/navegador/` (tienda y panel en Edge real), contra local y contra staging. Solo se cambiaron archivos de `tests/` y este informe; nada de `apps/`.

## Resumen

- **Local:** 23 de 24 pasan. Falla 1: ordenar la portada con el teclado (error real de la app, «después»).
- **Staging:** 19 de 19 pasan (el panel en la corrida completa y la tienda en una segunda corrida, ya con el último arreglo de la prueba); 5 salteadas a propósito (4 son «solo local» y 1 es retiro, que staging no tiene configurado).
- **El 500 de la portada en local** no es de la app: es el optimizador de dependencias de Vite dentro de `astro dev`. Cuando descubre una dependencia nueva a mitad de la sesión, vuelve a optimizar y el servidor sigue pidiendo los archivos viejos (`…/.vite/deps_ssr/@nanostores_preact.js?v=14753c0e`, que ya no existe). Desde ahí, toda página con islas de Preact da 500 hasta reiniciar `astro dev`. La segunda causa posible es tener el frontend levantado sin el backend.
- **Bloqueantes nuevos: ninguno.** Compra con transferencia, Mercado Pago hasta la preferencia, seguimiento, carrito recuperado y todas las pantallas del panel funcionan en staging.
- La mayoría de los fallos de la primera corrida eran de las pruebas mismas, que se habían escrito y nunca se habían corrido. Quedaron arreglados en `tests/navegador/` (lista al final).
- Staging quedó limpio (verificado con SQL, detalle en «Qué se borró de staging»).

## Contra qué se corrió

| | Local | Staging |
|---|---|---|
| URL | `http://localhost:4321` (Astro dev) + backend `wrangler dev` en `:8787` | `https://sukha-frontend-staging.sukha-frontend.workers.dev` |
| Base | D1 local `sukha` (migraciones 0001–0010 aplicadas, 68 productos, 35 publicados) | D1 `sukha-staging` |
| Versión | código del disco del 29/10 (con cambios en curso de 1.1 y 1.2) | frontend `8835a478-5e9e-49ae-8bc2-9cde256de938` y backend `1960f187-9eb5-430b-97f4-e46f86d3b34d`, las dos desplegadas el 29/10 a las 19:46Z. No es la 3fce7ad4: hubo otro deploy después. Esas versiones incluyen cambios a medio hacer de 1.1 y 1.2. |
| Corridas | 29/10, 19:20Z a 19:57Z | completa 19:59Z–20:00Z; tienda 20:02Z–20:03Z |
| Navegador | Edge (`playwright-core` 1.56.1, sin descargar navegadores) | igual |

Como staging tenía cambios a medio hacer de 1.1 y 1.2, cualquier fallo de staging se habría marcado «posible estado intermedio, re-verificar el día 5». No hubo ninguno, pero conviene repetir la corrida de staging cuando 1.1 y 1.2 hagan su deploy final.

## Cómo correr las pruebas

Una sola vez: `cd tests/navegador && npm install`. Credenciales del admin de prueba `e2e@sukha.test` en `.env.e2e`, en la raíz (ignorado por git): `E2E_CLAVE` (local) y `E2E_CLAVE_STAGING`.

**Local**

1. `npm run dev:backend` (puerto 8787) y **después** `npm run dev:frontend` (puerto 4321).
2. Calentar: abrir portada, una ficha, `/carrito`, `/checkout` y `/admin/portada`. Si la consola de `astro dev` muestra «The file does not exist … optimize deps directory», reiniciar `astro dev` (ver error 2).
3. `cd tests/navegador && npm test` (unos 4 minutos).

**Staging**

```sh
cd tests/navegador
TIENDA_URL=https://sukha-frontend-staging.sukha-frontend.workers.dev npm test
```

Hace falta `wrangler` con sesión iniciada en la cuenta (la limpieza borra por SQL en `sukha-staging`). Conviene arrancar justo después de un múltiplo de 5 minutos UTC (ver «Emails»).

## Resultado de cada test

✔ pasa · ✖ falla · — salteado a propósito

| Test | Local | Staging |
|---|---|---|
| **panel.test.mjs** | | |
| login: sin sesión al login, contraseña mala avisa, buena entra | ✔ | ✔ |
| cada pantalla del panel carga con título y sin errores (18 pantallas + detalle de venta y producto) | ✔ | ✔ |
| ventas: buscar y filtrar | ✔ | ✔ |
| modales de alta (producto, categoría, colección) | ✔ | ✔ |
| alta de producto desde el modal y borrado | ✔ | ✔ |
| local: alta de categoría | ✔ | — |
| redirecciones: alta, la tienda la sigue (301) y borrado | ✔ | ✔ |
| reportes: cambiar rango | ✔ | ✔ |
| emails: abre el editor | ✔ | ✔ |
| local: portada, arrastrar una sección | ✔ | — |
| local: portada, ordenar con el teclado | ✖ (error 1) | — |
| cerrar sesión | ✔ | ✔ |
| **tienda.test.mjs** | | |
| portada con cabecera, menú y pie | ✔ | ✔ |
| páginas fijas (9) y 404 de producto | ✔ | ✔ |
| categoría desde el menú | ✔ | ✔ |
| filtros: talle | ✔ | ✔ |
| ficha y cotizador (CP inválido y válido) | ✔ | ✔ |
| carrito: agregar, página del carrito, cantidades, quitar | ✔ | ✔ |
| checkout a domicilio + CP inválido + transferencia | ✔ | ✔ |
| seguimiento por número y email | ✔ | ✔ |
| checkout con retiro en persona | ✔ | — (staging sin retiro configurado) |
| Mercado Pago hasta la preferencia (sin pagar) | ✔ (sin credenciales: queda pendiente) | ✔ (preferencia creada en `www.mercadopago.com.ar`, salida cortada) |
| carrito abandonado: link de recuperación | ✔ | ✔ |
| local: el carrito abandonado aparece en el panel | ✔ | — |
| **Total** | **23 ✔ · 1 ✖** | **19 ✔ · 0 ✖ · 5 —** |

## El error 500 de la portada en local

**Causa raíz (reproducida):** el optimizador de dependencias de Vite en `astro dev` con el adaptador de Cloudflare.

**Pasos para reproducir**

1. Con `apps/frontend/node_modules/.vite` vacío o viejo, levantar backend y frontend.
2. Navegar la tienda y el panel (o correr las pruebas). En la primera visita Vite descubre dependencias que no había optimizado (del lado servidor `@nanostores/preact`, del lado navegador `sortablejs`) y las vuelve a optimizar con otro número de versión (`?v=`).
3. El servidor de Astro (que corre dentro de workerd) sigue importando el archivo con el número viejo, que ya no existe. Desde ese momento:
   - toda página con islas de Preact (portada, ficha, carrito…) da 500 con «The file does not exist at …/.vite/deps_ssr/@nanostores_preact.js?v=14753c0e which is in the optimize deps directory»; también `/producto/no-existe` da 500 en lugar de 404, porque falla al cargar la ruta;
   - el script del editor de portada no carga (`sortablejs.js?v=44a3035b` 404) y la lista de secciones queda vacía.
4. Reiniciar `astro dev` lo arregla mientras no aparezcan dependencias nuevas.

**Causa secundaria:** con el frontend levantado y el backend apagado, cualquier página que no tenga los datos en memoria da 500 («Network connection lost»). Al levantar el backend, el frontend lo encuentra solo en unos 20 segundos. Antes de los cambios de 1.1 había otro camino a este mismo síntoma: `leer()` no miraba `r.ok`, y un 429 o un 503 del backend quedaba guardado un minuto como datos de la tienda (hallazgo 1 de `arquitectura.md`). Con el código actual de 1.1 (`lib/api.ts` revisa `r.ok`; `lib/tienda.ts` no guarda errores) eso ya no pasa: con el backend apagado, la portada siguió en 200 con los datos de antes.

**Lo que no era:** las migraciones de la D1 local estaban todas aplicadas («No migrations to apply»), la base tenía datos, los bindings estaban bien y la falta de `.dev.vars` no causa 500 (solo deja sin Mercado Pago, Resend y MiCorreo). No hizo falta tocar la base local.

## Errores encontrados

### 1. El asa de arrastre de la portada no responde al teclado

- **Dónde:** local (en staging la prueba está salteada para no pisar el borrador real; el código es el mismo).
- **Severidad:** después. Los botones «Subir» y «Bajar» de cada fila sí funcionan con el teclado.
- **Pasos:** panel → Portada → Tab hasta el asa (ícono de puntos) de la primera sección → flecha abajo. No pasa nada.
- **Causa:** `apps/frontend/src/scripts/ordenable.ts:37-56` engancha el teclado a los botones de arrastre que existen *en el momento de llamarla*. En `apps/frontend/src/scripts/portada.ts:228` se llama `ordenable(lista, …)` con la lista todavía vacía: el primer `dibujarLista()` es en `:572`, y `dibujarLista()` (`:198-200`) borra y recrea las filas en cada cambio. Por eso ningún asa de la portada tiene el manejador.
- **Arreglo propuesto:** en `ordenable.ts`, un solo `keydown` sobre la lista (delegación) en lugar de uno por botón: `lista.addEventListener('keydown', (e) => { const boton = (e.target as HTMLElement).closest(asa); const item = boton?.closest('[data-id]'); if (!item || item.parentElement !== lista) return; … })`. Así sirve también para listas que se redibujan.
- **Paquete:** 1.4 (panel).

### 2. `astro dev`: 500 en páginas con islas después de que Vite reoptimiza dependencias

- **Dónde:** solo local. El build de producción no usa el optimizador.
- **Severidad:** después. No afecta a la tienda publicada, pero hace perder tiempo y hace fallar las pruebas locales.
- **Pasos y causa:** ver la sección anterior.
- **Arreglo propuesto (a probar):** declarar de antemano las dependencias en `apps/frontend/astro.config.mjs`, para que Vite no las descubra a mitad de camino: `vite.optimizeDeps.include: ['sortablejs', 'preact', 'preact/hooks', 'nanostores', '@nanostores/preact', '@nanostores/persistent', 'lucide-preact']`, y lo mismo para el entorno del servidor (`vite.environments.ssr.optimizeDeps.include`). Mientras tanto: reiniciar `astro dev` (anotado en `tests/navegador/README.md`).
- **Paquete:** paquete nuevo (entorno local).

### 3. Las fotos dan 404 en la tienda local

- **Dónde:** solo local.
- **Severidad:** después.
- **Pasos:** subir una foto desde el panel local y ver el producto en `localhost:4321`: la foto da 404.
- **Causa:** el backend guarda las fotos en su KV local (`apps/backend/.wrangler/state/v3/kv`, 294 archivos) y el frontend las lee de otro KV local (`apps/frontend/.wrangler/state/v3/kv`, casi vacío). Son dos carpetas de estado distintas para el mismo binding `IMAGENES`.
- **Arreglo propuesto:** que los dos procesos compartan la carpeta de estado (por ejemplo `wrangler dev --persist-to` hacia una carpeta común y la misma ruta en la configuración del adaptador de Astro), o que en desarrollo la ruta `/api/imagenes/*` del frontend le pida la foto al backend.
- **Paquete:** paquete nuevo (entorno local).

### 4. Un toque en «Agregar al carrito» antes de que cargue la página se pierde

- **Dónde:** se vio en local (Vite dev es lento); en producción la ventana es más corta, pero existe en un celular con mala conexión.
- **Severidad:** después.
- **Pasos:** abrir una ficha con la variante elegida (`/producto/x?variante=n`) y tocar «Agregar al carrito» apenas se ve. En local, 2 de 3 intentos no abrieron el carrito.
- **Causa:** la ficha (`FichaProducto`, `client:load`) llega armada del servidor con el botón habilitado, pero el clic no hace nada hasta que Preact termina de hidratarla (`apps/frontend/src/pages/producto/[slug].astro:59`).
- **Arreglo propuesto:** que el botón empiece deshabilitado o con «Cargando…» y se habilite en un `useEffect` al hidratar (en `apps/frontend/src/components/tienda/FichaProducto.tsx`, cerca de `:283`).
- **Paquete:** 1.5 (visual / componentes de la tienda).

### 5. Error de consola «Transition was aborted» al abrir un link de carrito recuperado

- **Dónde:** local, intermitente (1 de 3 corridas).
- **Severidad:** después. La clienta no lo ve; ensucia la consola y Workers Logs no lo registra (es del navegador).
- **Pasos:** abrir `/recuperar/<código válido>` en Edge.
- **Causa:** la tienda activa las transiciones entre páginas (`@view-transition` en `apps/frontend/src/styles/tienda.css:109`) y `apps/frontend/src/pages/recuperar/[codigo].astro` hace `location.replace('/checkout')` apenas carga, en medio de la transición.
- **Arreglo propuesto:** en esa página, apagar la transición (`@view-transition { navigation: none; }` solo ahí) o hacer el salto después del evento `pagereveal`.
- **Paquete:** 1.5. La prueba deja pasar solo ese mensaje, con un comentario que apunta acá.

### 6. `astro dev` se cerró solo una vez (código 0xC0000409)

- **Dónde:** local, Windows. Pasó una vez en unos 40 minutos, a mitad de una corrida.
- **Severidad:** después; solo se anota.
- **Causa probable:** caída nativa de workerd o esbuild en Windows (`STATUS_STACK_BUFFER_OVERRUN`), no del código de la tienda.
- **Paquete:** ninguno por ahora. Si se repite, entra en el paquete nuevo de entorno local.

### 7. Staging no tiene retiro en persona configurado

- **Dónde:** staging.
- **Severidad:** después. Es un hueco de cobertura, no un error.
- **Consecuencia:** la prueba de checkout con retiro no corre en staging (en local pasa).
- **Arreglo propuesto:** cargar una dirección de retiro de prueba en la configuración de staging cuando Fabrizio lo decida.
- **Paquete:** 1.4.

### Localidad en staging (pedido del coordinador)

El hilo 1.1 vio que en staging «checkout a domicilio» y «Mercado Pago» no lograban elegir la localidad. **La causa era la prueba, no `Checkout.tsx`.** La prueba buscaba `getByRole('option').first()`, y la primera «option» de la página es una `<option>` oculta del select de provincia, no una sugerencia del autocompletado. La espera vencía, el `mousedown` caía en esa opción, `localidadValida` quedaba en `false` y el checkout mostraba «Elegí tu localidad de la lista». La API de localidades respondía bien (`200`, «Córdoba · Capital»). Quedó arreglado en `tests/navegador/tienda.test.mjs` (función `direccion()`), que ahora busca la sugerencia dentro de `#localidad-lista [role=option]`. Pasa en local y en staging. No hay que tocar `Checkout.tsx`.

## Arreglos hechos en las pruebas (`tests/navegador/`)

| Problema de la prueba | Arreglo |
|---|---|
| Hacía clic en «Agregar al carrito» antes de que la ficha se hidratara (error 4) | `hidratada()` en `comun.mjs`: espera a que las islas `client:load` y `client:only` pierdan el atributo `ssr`. |
| Elegía la primera opción de envío, que mientras se cotiza es «Retiro en persona» | Busca la opción con «A domicilio» o «A sucursal» y espera a que llegue. |
| La localidad tomaba la `<option>` del select de provincia | Busca dentro de `#localidad-lista`. |
| El checkout recordaba el email de la compra anterior (`sessionStorage`) | `limpiarCarrito()` también vacía `sessionStorage`. |
| Buscaba textos que también están en el carrito lateral cerrado (oculto) | Filtra solo lo visible. |
| Leía la respuesta de `POST /api/pedidos` después de que la página ya había navegado | La copia al pasar, interceptando la ruta. |
| `localStorage` en la página de error que queda al cortar la salida a Mercado Pago | Vuelve a la tienda antes de limpiar. |
| En staging, un pedido por transferencia encola un aviso a `email_avisos`, que es un Gmail real | `sinEmailsDePrueba()` borra los emails pendientes de los pedidos de prueba apenas se crea o se cancela cada pedido. |
| `limpiarCarrito()` se cortaba si la página estaba navegando | Espera a que termine de cargar. |

Además se actualizó `tests/navegador/README.md` con los pasos previos para local y las notas de staging. Para levantar los servidores desde Claude se sumó la configuración «backend» a `.claude/launch.json` (ignorado por git).

## Qué se borró de staging

Todo por la limpieza de las propias pruebas, en las dos corridas:

- **Por SQL** (`comun.mjs`, `borrarPedidosDePrueba` y `sinEmailsDePrueba`), solo filas de `e2e-navegador@sukha.test`:
  - `DELETE FROM email_saliente WHERE estado = 'pendiente' AND pedido_id IN (pedidos de esa clienta)`, después de crear y de cancelar cada pedido;
  - `DELETE` en `historial_estado`, `movimiento_stock`, `pedido_item`, `pedido_descuento`, `pago` y `email_saliente` de los pedidos de esa clienta;
  - `DELETE FROM email_saliente WHERE destinatario = 'e2e-navegador@sukha.test'`;
  - `DELETE FROM pedido`, `clienta` y `carrito_abandonado` con ese email.
- **Lo que se borró:** 4 pedidos de prueba (por corrida, uno por transferencia y uno por Mercado Pago), con sus prendas, pagos, historial, reservas y devoluciones de stock, y sus emails. Además, 1 clienta y 1 carrito abandonado por corrida. Antes de borrarlos se cancelaron desde la API, lo que devolvió el stock; reserva y devolución se borran juntas, así que el stock quedó igual.
- **Desde el panel** (por la propia prueba; el panel corrió una sola vez en staging): 1 borrador de producto «E2E Remera …» (la prueba verifica el 404 después de borrarlo) y 1 redirección `/e2e-viejo-…`.
- **No se creó en staging:** categorías, cambios de portada ni suscripciones a la newsletter.

**Verificación final (20:03Z):** 0 pedidos, clientas, carritos y emails con `@sukha.test`; 0 emails pendientes; 0 emails creados en las últimas 2 horas; 0 productos «E2E»; 0 redirecciones `/e2e-`; 0 filas huérfanas en `movimiento_stock`, `pago` y `pedido_item`; total de pedidos de staging igual que antes (9).

**Mercado Pago:** quedaron 2 preferencias de pago creadas y nunca pagadas en la cuenta real. No cobran nada y vencen solas; no hay nada que borrar.

**Emails:** no puedo asegurar al 100% que ningún aviso haya salido. La corrida completa terminó a las 20:00:40Z y el cron corre a las 20:00:00Z. Si justo cayó en los segundos entre crear el pedido por transferencia y borrar su email pendiente, pudo salir un «aviso_transferencia» al `email_avisos` de staging. Se puede confirmar en Workers Logs de `sukha-backend-staging` (ejecución programada de las 20:00Z). La segunda corrida (20:02–20:03Z) no se cruzó con ningún cron.

**Base local:** se borraron a mano las 3 categorías «E2E Categoría …» (ids 92, 93 y 94, sin productos ni subcategorías) que crea la prueba del panel. Los pedidos de prueba locales se limpiaron solos, salvo uno de una corrida cortada que se canceló y borró con las mismas funciones.

## Pendientes para después

- Repetir la corrida de staging cuando 1.1 y 1.2 hagan su deploy final («re-verificar el día 5»).
- Error 1 (teclado en la portada): paquete 1.4.
- Errores 4 y 5: paquete 1.5.
- Errores 2, 3 y 6: paquete nuevo «entorno local» (no bloquea el lanzamiento).
- Retiro en staging (7), para cubrir esa prueba.
