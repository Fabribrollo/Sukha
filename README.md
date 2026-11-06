# Sukhä

Tienda online en Cloudflare (plan gratuito), dominio `sukhaind.com.ar`.

- `apps/frontend`: Astro en Cloudflare Workers. Tienda y panel. Reenvía `/api/*` al backend por service binding.
- `apps/backend`: Worker con Hono. D1 (`DB`), KV para las fotos (`IMAGENES`), Resend y Mercado Pago. Sin URL pública.

## Desarrollo

```sh
npm install
npm run db:migrate     # crea la base D1 local
npm run db:seed        # carga talles y configuración inicial
npm run dev:backend    # terminal 1
npm run dev:frontend   # terminal 2 → http://localhost:4321
npm run check          # tipos del backend y de las islas de la tienda + build del frontend
```

Panel: `/admin/login`. El usuario admin se crea a mano (pide la contraseña por teclado):

```sh
npm run admin:crear -w @sukha/backend -- local tu@email.com "Tu Nombre"   # o staging / prod
```

Las rutas de la API están listadas en `apps/backend/src/routes/` (`tienda.routes.ts` son las públicas, `admin.routes.ts` las del panel).

Prueba de punta a punta (carga un catálogo, compra, paga, vence y reembolsa contra el backend local):

```sh
cd apps/backend
npx wrangler dev --test-scheduled          # terminal 1
E2E_EMAIL=tu@email.com E2E_CLAVE=... npm run e2e   # terminal 2, con un admin local
npm test                                   # tests de totales, estados, firma del webhook y emails
```

Secretos locales: copiar `apps/backend/.dev.vars.example` a `apps/backend/.dev.vars`.

## Tienda (`apps/frontend`)

Rutas públicas: `/`, `/productos`, `/ofertas`, `/buscar?q=`, `/categoria/[slug]`, `/coleccion/[slug]`, `/producto/[slug]`, `/carrito`, `/checkout`, `/pedido/[token]` (seguimiento), `/pedido/buscar`, `/arrepentimiento`, `/quienes-somos`, `/preguntas-frecuentes`, `/cambios-y-devoluciones`, `/contacto`, `/novedades/baja/[token]`, `/robots.txt` y `/sitemap.xml`. El plan con las decisiones de diseño está en `docs/PLAN-TIENDA.md` y los contratos de la API en `docs/API.md`.

- Colores, tipografía y bordes son variables en `src/styles/tienda.css` (`@theme`): cambiar la identidad visual es tocar ese archivo.
- El carrito vive en el navegador (`localStorage`, clave `sukha:carrito`); los totales los calcula siempre el backend.
- Las páginas del pedido (`/pedido/*`) no se indexan ni llevan analítica: la dirección contiene el token.

Datos de prueba para ver la tienda con productos (solo local, con un admin ya creado):

```sh
cp apps/frontend/scripts/demo-datos.js apps/frontend/public/_demo-datos.js
# entrar a /admin con el usuario local y, en la consola del navegador:
#   const m = await import('/_demo-datos.js'); m.sembrar();
rm apps/frontend/public/_demo-datos.js    # antes de publicar (los deploy lo verifican)
```

Recorrido de la clienta contra una tienda ya cargada (local o staging; crea un pedido de prueba `e2e@sukha.test`):

```sh
TIENDA_URL=http://localhost:4321 npm run e2e -w @sukha/frontend
```

## Antes del primer deploy

1. `wrangler secret put` para `RESEND_API_KEY`, `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET`.
2. `wrangler d1 migrations apply sukha --remote`.
3. Deploy del backend primero, después el frontend.

**Cotización automática con MiCorreo (opcional):** con `wrangler secret put` cargar `MICORREO_USUARIO`, `MICORREO_CLAVE` y `MICORREO_CUSTOMER_ID`, y `MICORREO_URL` (ya está definida en `wrangler.jsonc`: pruebas en staging, producción arriba). El `customerId` se obtiene con `npm run micorreo:cliente -w @sukha/backend -- pruebas`. Después, en el panel (Envíos > Bultos y peso) cargar el código postal de origen y los tamaños de bulto. Sin esos datos, o si la API falla, la tienda usa los precios de la tabla de zonas.

## Precios de envío

Los precios por zona se actualizan desde **Envíos > Actualizar precios** en el panel: consulta la calculadora pública de Shipy (tarifa pública de Andreani y Correo, no oficial), muestra el precio actual contra el nuevo por zona y aplica al confirmar. Solo consulta al tocar el botón (con caché de 24 horas), nunca en cada compra. Para armar un CSV con otros pesos o código postal de origen:

```sh
npm run envios:tabla -w @sukha/backend -- --origen 8300 --pesos 500,1000,2000 --salida tabla.csv
```

Las zonas y los códigos postales de muestra están en `apps/backend/scripts/zonas-envio.json`. Cargar las zonas por primera vez (también en producción), desde `apps/backend`: `wrangler d1 execute sukha --remote --file zonas-envio.sql`.

## Primer administrador en producción

Se hace una sola vez, con la base de producción ya migrada y el backend desplegado. **No lo corre nadie hasta que Fabrizio lo pida.**

```sh
npm run db:migrate:prod -w @sukha/backend                          # si faltan migraciones
npm run admin:crear -w @sukha/backend -- prod tu@email.com "Tu Nombre"
```

El comando pide la contraseña por teclado (mínimo 12 caracteres, no queda guardada en ningún archivo) y después pide escribir `produccion` para confirmar. Si el email ya existe, le cambia la contraseña y cierra sus sesiones. Después se entra por `https://sukhaind.com.ar/admin/login`. La contraseña la escribe Fabrizio, nunca se pasa por chat.

## Entornos

- **Staging:** https://sukha-frontend-staging.sukha-frontend.workers.dev, base `sukha-staging`.
- **Producción:** `sukhaind.com.ar`, base `sukha`. Todavía sin desplegar ni migrar.

Staging corre en `workers.dev`, donde la Cache API de Cloudflare no guarda nada: ahí no se prueba la caché de fotos ni la de los datos de la tienda (`leerDelBorde` en `apps/frontend/src/lib/api.ts`). Para probarla hace falta el dominio propio; con `wrangler dev` en local sí funciona.

```sh
npm run db:migrate:staging -w @sukha/backend
npm run deploy:staging -w @sukha/backend    # siempre antes que el frontend
npm run deploy:staging -w @sukha/frontend
```

## Registros y avisos de fallas

- **Registros:** los dos workers guardan sus registros en Workers Logs (panel de Cloudflare > Workers > Logs). Los del backend son objetos con `evento` (`pedido_creado`, `aviso_de_pago`, `cambio_de_estado`, `email_enviado`, `email_fallido`, `alerta`…) y, cuando corresponde, `pedido` con el número visible: se busca `pedido = "SUK-0012"`. No llevan emails ni nombres.
- **Avisos por email a `email_avisos`** (Configuración del panel), directo por Resend y como mucho uno cada 3 horas por tipo: un aviso de Mercado Pago que no se pudo procesar o con firma inválida, un email que se dio por perdido o que espera más de 2 horas, y un paso de la tarea programada que falló (`apps/backend/src/services/alertas.service.ts`).
- **Prioridad de la cola de emails:** los de pedidos salen primero. Un email de marketing (recordatorio, newsletter, "volvió el talle") se encola con un tipo que empieza con `marketing_` y solo sale mientras queden 30 del cupo de 100 por día de Resend (`TOPE_EMAILS_DIA` y `RESERVA_EMAILS_PEDIDOS` en `apps/backend/src/config/index.ts`).

## Campo señuelo contra bots (honeypot)

`POST /api/pedidos` y `POST /api/novedades` aceptan el campo `comentarioExtra`. Si llega con texto, el backend rechaza el formulario. En la tienda va como un campo oculto para las personas, que los bots sí completan:

```html
<input type="text" name="comentarioExtra" tabindex="-1" autocomplete="off"
       aria-hidden="true" style="position:absolute; left:-9999px">
```

Ocultarlo fuera de pantalla y no con `display:none` (muchos bots saltean los campos invisibles), y mandar su valor tal cual en el pedido.
