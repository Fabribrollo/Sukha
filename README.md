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
npm run check          # tipos del backend + build del frontend
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

3. `wrangler secret put` para `RESEND_API_KEY`, `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET`.
4. `wrangler d1 migrations apply sukha --remote`.
5. Deploy del backend primero, después el frontend.

## Entornos

- **Staging:** https://sukha-frontend-staging.sukha-frontend.workers.dev, base `sukha-staging`.
- **Producción:** `sukhaind.com.ar`, base `sukha`. Todavía sin desplegar ni migrar.

```sh
npm run db:migrate:staging -w @sukha/backend
npm run deploy:staging -w @sukha/backend    # siempre antes que el frontend
npm run deploy:staging -w @sukha/frontend
```

## Campo señuelo contra bots (honeypot)

`POST /api/pedidos` y `POST /api/novedades` aceptan el campo `comentarioExtra`. Si llega con texto, el backend rechaza el formulario. En la tienda va como un campo oculto para las personas, que los bots sí completan:

```html
<input type="text" name="comentarioExtra" tabindex="-1" autocomplete="off"
       aria-hidden="true" style="position:absolute; left:-9999px">
```

Ocultarlo fuera de pantalla y no con `display:none` (muchos bots saltean los campos invisibles), y mandar su valor tal cual en el pedido.
