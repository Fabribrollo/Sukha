# Pruebas en navegador

Recorren la tienda y el panel en un navegador de verdad (Edge, que ya viene con Windows; no descarga nada).

```sh
cd tests/navegador
npm install                      # una sola vez
npm test                         # contra http://localhost:4321 (backend y frontend corriendo)
TIENDA_URL=https://sukha-frontend-staging.sukha-frontend.workers.dev npm test   # contra staging
VER=1 npm run tienda             # mirando el navegador mientras prueba
```

Necesitan un admin de prueba con email `e2e@sukha.test`. Su contraseña va en `.env.e2e`, en la raíz del repo (está en `.gitignore`):

```
E2E_EMAIL=e2e@sukha.test
E2E_CLAVE=...            # admin local (npm run admin:crear -w @sukha/backend -- local e2e@sukha.test "Pruebas")
E2E_CLAVE_STAGING=...    # el mismo usuario en staging
```

- `tienda.test.mjs`: portada, páginas fijas, categoría, filtros, ficha con cotizador, carrito, checkout con envío y con retiro, código postal inválido, transferencia, Mercado Pago hasta la preferencia (corta la salida a Mercado Pago: no se paga nada), seguimiento y link de carrito recuperado. Compra con `e2e-navegador@sukha.test` y al terminar cancela esos pedidos y los borra de la base, junto con la clienta y el carrito abandonado.
- `panel.test.mjs`: login, cada pantalla sin errores, modales de alta, alta y borrado de un producto, redirecciones, reportes, emails, portada con arrastre de secciones (solo en local, para no pisar un borrador real) y cierre de sesión.

En otra compu sin Edge: `NAVEGADOR=chrome npm test`.

## Antes de correr en local

1. Levantar primero el backend (`npm run dev:backend`, puerto 8787) y después el frontend (`npm run dev:frontend`, puerto 4321). Sin backend, las páginas dan 500 («Network connection lost»); al levantarlo, el frontend lo encuentra solo en unos 20 segundos.
2. Abrir una vez la portada, una ficha, el carrito, el checkout y `/admin/portada` en el navegador. Si en la consola de `astro dev` aparece «The file does not exist … optimize deps directory», **reiniciar `astro dev`**: Vite volvió a optimizar dependencias y hasta reiniciar las páginas con islas dan 500 y el editor de portada no carga. Ver `docs/auditorias/tests.md`.
3. Las fotos dan 404 en local (el frontend lee otro KV local que el backend): es normal y no hace fallar las pruebas.

## Staging

- Corre lo mismo salvo lo marcado «local:» (categorías y borrador de portada) y el retiro si la tienda no lo tiene.
- Mercado Pago de staging usa credenciales reales: la prueba crea la preferencia y corta la salida, nunca se paga.
- Apenas se crea o se cancela un pedido de prueba se borran sus emails pendientes (`sinEmailsDePrueba`): el aviso a la dueña de staging va a un email real y no debe salir. Al terminar se borran pedidos, clienta, carrito y emails de `e2e-navegador@sukha.test`.
