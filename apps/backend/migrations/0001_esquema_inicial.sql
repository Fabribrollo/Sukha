-- Sukhä · esquema de base de datos para Cloudflare D1 (SQLite)
-- Convenciones:
--   * Montos en centavos de peso, INTEGER, nunca decimales.
--   * Fechas en TEXT ISO-8601 UTC ('2026-10-13T04:00:00.000Z').
--   * Booleanos en INTEGER 0/1 con CHECK.
--   * Nada se borra si lo referencia un pedido: se oculta (estado/activa).
--   * actualizado_en lo escribe la aplicación en cada UPDATE.

-- D1 aplica las claves foráneas por defecto (en SQLite local: PRAGMA foreign_keys = ON).

-- ───────────── Catálogo ─────────────

CREATE TABLE categoria (
  id           INTEGER PRIMARY KEY,
  nombre       TEXT    NOT NULL,
  slug         TEXT    NOT NULL UNIQUE,
  guia_talles  TEXT    CHECK (guia_talles IS NULL OR json_valid(guia_talles)),
  orden        INTEGER NOT NULL DEFAULT 0,
  activa       INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1))
);

CREATE TABLE coleccion (
  id      INTEGER PRIMARY KEY,
  nombre  TEXT    NOT NULL,
  slug    TEXT    NOT NULL UNIQUE,
  activa  INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1))
);

CREATE TABLE producto (
  id                      INTEGER PRIMARY KEY,
  categoria_id            INTEGER NOT NULL REFERENCES categoria(id),
  nombre                  TEXT    NOT NULL,
  slug                    TEXT    NOT NULL UNIQUE,
  descripcion             TEXT,
  material                TEXT,
  cuidados                TEXT,
  precio_centavos         INTEGER NOT NULL CHECK (precio_centavos > 0),
  precio_oferta_centavos  INTEGER CHECK (precio_oferta_centavos IS NULL
                            OR (precio_oferta_centavos > 0 AND precio_oferta_centavos < precio_centavos)),
  peso_gramos             INTEGER CHECK (peso_gramos IS NULL OR peso_gramos > 0),
  estado                  TEXT    NOT NULL DEFAULT 'borrador'
                            CHECK (estado IN ('borrador', 'publicado', 'oculto')),
  creado_en               TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actualizado_en          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX producto_categoria_estado ON producto (categoria_id, estado);

CREATE TABLE producto_coleccion (
  producto_id   INTEGER NOT NULL REFERENCES producto(id)  ON DELETE CASCADE,
  coleccion_id  INTEGER NOT NULL REFERENCES coleccion(id) ON DELETE CASCADE,
  PRIMARY KEY (producto_id, coleccion_id)
) WITHOUT ROWID;
CREATE INDEX producto_coleccion_coleccion ON producto_coleccion (coleccion_id);

CREATE TABLE talle (
  id      INTEGER PRIMARY KEY,
  nombre  TEXT    NOT NULL UNIQUE,
  orden   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE color (
  id      INTEGER PRIMARY KEY,
  nombre  TEXT NOT NULL UNIQUE,
  -- D1 limita los patrones GLOB/LIKE a 50 bytes, por eso se valida en partes.
  hex     TEXT CHECK (hex IS NULL OR (length(hex) = 7 AND hex GLOB '#*' AND substr(hex, 2) NOT GLOB '*[^0-9A-Fa-f]*'))
);

-- La unidad que se vende y se cuenta. Todo producto tiene al menos una.
-- Talle y color son opcionales: un accesorio sin opciones tiene una sola variante con ambos en NULL.
CREATE TABLE variante (
  id              INTEGER PRIMARY KEY,
  producto_id     INTEGER NOT NULL REFERENCES producto(id),
  talle_id        INTEGER REFERENCES talle(id),
  color_id        INTEGER REFERENCES color(id),
  sku             TEXT    NOT NULL UNIQUE,
  stock           INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),  -- disponible para vender; la reserva ya lo descuenta
  activa          INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1)),
  actualizado_en  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
-- Una sola variante por combinación; IFNULL porque en un UNIQUE común dos NULL no chocan.
CREATE UNIQUE INDEX variante_combinacion ON variante (producto_id, IFNULL(talle_id, 0), IFNULL(color_id, 0));

CREATE TABLE imagen (
  id                 INTEGER PRIMARY KEY,
  producto_id        INTEGER NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
  color_id           INTEGER REFERENCES color(id),  -- NULL = foto general del producto
  clave              TEXT    NOT NULL UNIQUE,   -- clave en Workers KV
  orden              INTEGER NOT NULL DEFAULT 0,
  texto_alternativo  TEXT
);
CREATE INDEX imagen_producto ON imagen (producto_id, orden);

-- ───────────── Envíos y promociones ─────────────

-- Una fila por zona, correo y modalidad: la clienta elige en el checkout.
CREATE TABLE zona_envio (
  id                     INTEGER PRIMARY KEY,
  nombre                 TEXT    NOT NULL,
  transporte             TEXT    NOT NULL CHECK (transporte IN ('correo_argentino', 'andreani')),
  modalidad              TEXT    NOT NULL CHECK (modalidad IN ('domicilio', 'sucursal')),
  precio_centavos        INTEGER NOT NULL CHECK (precio_centavos >= 0),
  gratis_desde_centavos  INTEGER CHECK (gratis_desde_centavos IS NULL OR gratis_desde_centavos > 0),
  activa                 INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1)),
  UNIQUE (nombre, transporte, modalidad)
);

-- Rangos sobre los 4 dígitos del código postal. La aplicación impide rangos superpuestos.
CREATE TABLE rango_cp (
  id             INTEGER PRIMARY KEY,
  zona_envio_id  INTEGER NOT NULL REFERENCES zona_envio(id) ON DELETE CASCADE,
  cp_desde       INTEGER NOT NULL CHECK (cp_desde BETWEEN 1000 AND 9999),
  cp_hasta       INTEGER NOT NULL CHECK (cp_hasta BETWEEN 1000 AND 9999),
  CHECK (cp_hasta >= cp_desde)
);
CREATE INDEX rango_cp_busqueda ON rango_cp (cp_desde, cp_hasta);

CREATE TABLE cupon (
  id               INTEGER PRIMARY KEY,
  codigo           TEXT    NOT NULL UNIQUE CHECK (codigo = upper(codigo)),
  tipo             TEXT    NOT NULL CHECK (tipo IN ('porcentaje', 'monto', 'envio_gratis')),
  valor            INTEGER NOT NULL DEFAULT 0 CHECK (valor >= 0),  -- % o centavos según tipo
  minimo_centavos  INTEGER NOT NULL DEFAULT 0 CHECK (minimo_centavos >= 0),
  usos_maximos     INTEGER CHECK (usos_maximos IS NULL OR usos_maximos > 0),
  usos             INTEGER NOT NULL DEFAULT 0 CHECK (usos >= 0 AND (usos_maximos IS NULL OR usos <= usos_maximos)),
  vence_en         TEXT,
  activo           INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_en        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (tipo <> 'porcentaje' OR valor BETWEEN 1 AND 100),
  CHECK (tipo <> 'monto' OR valor > 0)
);

-- ───────────── Clientas y pedidos ─────────────

-- Sin login: una fila por email, se crea o actualiza en cada compra o suscripción.
CREATE TABLE clienta (
  id                   INTEGER PRIMARY KEY,
  email                TEXT    NOT NULL UNIQUE CHECK (email = lower(trim(email)) AND email LIKE '%_@_%._%'),
  nombre               TEXT,
  telefono             TEXT,
  dni                  TEXT,
  acepta_novedades     INTEGER NOT NULL DEFAULT 0 CHECK (acepta_novedades IN (0, 1)),
  acepta_novedades_en  TEXT,
  token_baja           TEXT    NOT NULL UNIQUE,  -- link para darse de baja de novedades
  creado_en            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actualizado_en       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (acepta_novedades = 0 OR acepta_novedades_en IS NOT NULL)
);

-- El número visible (SUK-0001) se arma en la aplicación a partir del id.
CREATE TABLE pedido (
  id                    INTEGER PRIMARY KEY,
  token_seguimiento     TEXT    NOT NULL UNIQUE,  -- aleatorio, va en el link de seguimiento
  clave_idempotencia    TEXT    NOT NULL UNIQUE,  -- evita pedidos duplicados por doble clic
  clienta_id            INTEGER NOT NULL REFERENCES clienta(id),
  estado                TEXT    NOT NULL DEFAULT 'pendiente_pago' CHECK (estado IN (
                          'pendiente_pago', 'pagado', 'en_preparacion', 'enviado', 'listo_para_retirar',
                          'entregado', 'cancelado', 'reembolsado', 'a_revisar')),
  -- Copia de los datos de contacto al momento de la compra
  nombre                TEXT    NOT NULL,
  email                 TEXT    NOT NULL,
  telefono              TEXT    NOT NULL,
  dni                   TEXT    NOT NULL,
  -- Entrega
  metodo_entrega        TEXT    NOT NULL CHECK (metodo_entrega IN ('domicilio', 'sucursal', 'retiro')),
  calle                 TEXT,
  altura                TEXT,
  piso_depto            TEXT,
  localidad             TEXT,
  provincia             TEXT,
  codigo_postal         TEXT,
  indicaciones          TEXT,
  sucursal_correo       TEXT,  -- nombre o código de la sucursal elegida
  zona_envio_id         INTEGER REFERENCES zona_envio(id),
  numero_seguimiento    TEXT,  -- del correo
  -- Pago y montos
  metodo_pago           TEXT    NOT NULL CHECK (metodo_pago IN ('mercadopago', 'transferencia')),
  subtotal_centavos     INTEGER NOT NULL CHECK (subtotal_centavos >= 0),
  descuento_centavos    INTEGER NOT NULL DEFAULT 0 CHECK (descuento_centavos >= 0),
  envio_centavos        INTEGER NOT NULL DEFAULT 0 CHECK (envio_centavos >= 0),
  total_centavos        INTEGER NOT NULL CHECK (total_centavos >= 0),
  -- Facturación (opcional; solo si la compradora pide factura con CUIT)
  cuit                  TEXT,
  condicion_iva         TEXT CHECK (condicion_iva IS NULL OR condicion_iva IN (
                          'consumidor_final', 'monotributo', 'responsable_inscripto', 'exento')),
  factura_numero        TEXT,
  reserva_vence_en      TEXT,
  creado_en             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actualizado_en        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (descuento_centavos <= subtotal_centavos),
  CHECK (total_centavos = subtotal_centavos - descuento_centavos + envio_centavos),
  CHECK (metodo_entrega <> 'domicilio' OR (
    calle IS NOT NULL AND altura IS NOT NULL AND localidad IS NOT NULL
    AND provincia IS NOT NULL AND codigo_postal IS NOT NULL AND zona_envio_id IS NOT NULL)),
  CHECK (metodo_entrega <> 'sucursal' OR (
    sucursal_correo IS NOT NULL AND provincia IS NOT NULL
    AND codigo_postal IS NOT NULL AND zona_envio_id IS NOT NULL)),
  CHECK (metodo_entrega <> 'retiro' OR zona_envio_id IS NULL),
  CHECK (estado <> 'pendiente_pago' OR reserva_vence_en IS NOT NULL)
);
CREATE INDEX pedido_vencimiento ON pedido (estado, reserva_vence_en);  -- tarea que libera reservas
CREATE INDEX pedido_clienta ON pedido (clienta_id, creado_en);
CREATE INDEX pedido_fecha ON pedido (creado_en);

CREATE TABLE pedido_item (
  id                        INTEGER PRIMARY KEY,
  pedido_id                 INTEGER NOT NULL REFERENCES pedido(id),
  variante_id               INTEGER NOT NULL REFERENCES variante(id),
  -- Copia al momento de la compra
  nombre_producto           TEXT    NOT NULL,
  talle                     TEXT,
  color                     TEXT,
  sku                       TEXT    NOT NULL,
  precio_unitario_centavos  INTEGER NOT NULL CHECK (precio_unitario_centavos >= 0),
  cantidad                  INTEGER NOT NULL CHECK (cantidad > 0),
  UNIQUE (pedido_id, variante_id)
);
CREATE INDEX pedido_item_variante ON pedido_item (variante_id);

CREATE TABLE pedido_descuento (
  id              INTEGER PRIMARY KEY,
  pedido_id       INTEGER NOT NULL REFERENCES pedido(id),
  tipo            TEXT    NOT NULL CHECK (tipo IN ('cupon', 'transferencia', 'promo')),
  cupon_id        INTEGER REFERENCES cupon(id),
  descripcion     TEXT    NOT NULL,
  monto_centavos  INTEGER NOT NULL CHECK (monto_centavos > 0),
  CHECK ((tipo = 'cupon') = (cupon_id IS NOT NULL))
);
CREATE INDEX pedido_descuento_pedido ON pedido_descuento (pedido_id);
CREATE INDEX pedido_descuento_cupon ON pedido_descuento (cupon_id);
CREATE UNIQUE INDEX un_cupon_por_pedido ON pedido_descuento (pedido_id) WHERE tipo = 'cupon';

CREATE TABLE pago (
  id                   INTEGER PRIMARY KEY,
  pedido_id            INTEGER NOT NULL REFERENCES pedido(id),
  proveedor            TEXT    NOT NULL CHECK (proveedor IN ('mercadopago', 'transferencia')),
  id_externo           TEXT,  -- id del pago en Mercado Pago; NULL en transferencias
  estado               TEXT    NOT NULL CHECK (estado IN ('pendiente', 'aprobado', 'rechazado', 'reembolsado')),
  monto_centavos       INTEGER NOT NULL CHECK (monto_centavos > 0),
  respuesta_proveedor  TEXT    CHECK (respuesta_proveedor IS NULL OR json_valid(respuesta_proveedor)),
  creado_en            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actualizado_en       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (proveedor, id_externo)  -- un aviso repetido no crea un segundo pago
);
CREATE INDEX pago_pedido ON pago (pedido_id);

CREATE TABLE solicitud_postventa (
  id                  INTEGER PRIMARY KEY,
  pedido_id           INTEGER NOT NULL REFERENCES pedido(id),
  tipo                TEXT    NOT NULL CHECK (tipo IN ('arrepentimiento', 'cambio', 'devolucion')),
  motivo              TEXT,
  estado              TEXT    NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'aprobada', 'rechazada', 'resuelta')),
  reembolso_centavos  INTEGER CHECK (reembolso_centavos IS NULL OR reembolso_centavos > 0),
  creado_en           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actualizado_en      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX solicitud_pedido ON solicitud_postventa (pedido_id);

-- Qué prendas del pedido entran en la solicitud (permite devoluciones parciales).
CREATE TABLE solicitud_item (
  solicitud_id    INTEGER NOT NULL REFERENCES solicitud_postventa(id) ON DELETE CASCADE,
  pedido_item_id  INTEGER NOT NULL REFERENCES pedido_item(id),
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  PRIMARY KEY (solicitud_id, pedido_item_id)
) WITHOUT ROWID;

-- ───────────── Panel y operación ─────────────

CREATE TABLE admin (
  id                INTEGER PRIMARY KEY,
  email             TEXT    NOT NULL UNIQUE CHECK (email = lower(trim(email))),
  nombre            TEXT    NOT NULL,
  hash_contrasena   TEXT    NOT NULL,
  activo            INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  ultimo_acceso_en  TEXT,
  creado_en         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Se guarda el hash del token de sesión, nunca el token.
CREATE TABLE sesion (
  token_hash  TEXT    PRIMARY KEY,
  admin_id    INTEGER NOT NULL REFERENCES admin(id) ON DELETE CASCADE,
  creado_en   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  vence_en    TEXT    NOT NULL
) WITHOUT ROWID;

CREATE TABLE historial_estado (
  id               INTEGER PRIMARY KEY,
  pedido_id        INTEGER NOT NULL REFERENCES pedido(id),
  admin_id         INTEGER REFERENCES admin(id),  -- NULL = cambio automático
  estado_anterior  TEXT,
  estado_nuevo     TEXT    NOT NULL,
  nota             TEXT,
  creado_en        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX historial_pedido ON historial_estado (pedido_id, creado_en);

-- Libro de stock: cada cambio con signo (-2 reserva, +2 liberación).
-- El stock es compartido con el local físico: sus ventas se cargan a mano como venta_local.
CREATE TABLE movimiento_stock (
  id           INTEGER PRIMARY KEY,
  variante_id  INTEGER NOT NULL REFERENCES variante(id),
  pedido_id    INTEGER REFERENCES pedido(id),
  admin_id     INTEGER REFERENCES admin(id),
  tipo         TEXT    NOT NULL CHECK (tipo IN ('carga', 'reserva', 'liberacion', 'devolucion', 'ajuste', 'venta_local')),
  cantidad     INTEGER NOT NULL CHECK (cantidad <> 0),
  nota         TEXT,
  creado_en    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX movimiento_variante ON movimiento_stock (variante_id, creado_en);
CREATE INDEX movimiento_pedido ON movimiento_stock (pedido_id);

-- Cola de emails: Resend gratis permite 100 por día; lo que no sale hoy se reintenta.
CREATE TABLE email_saliente (
  id                 INTEGER PRIMARY KEY,
  pedido_id          INTEGER REFERENCES pedido(id),
  destinatario       TEXT    NOT NULL,
  tipo               TEXT    NOT NULL,
  estado             TEXT    NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviado', 'fallido')),
  intentos           INTEGER NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  proximo_intento_en TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  enviado_en         TEXT,
  error              TEXT,
  creado_en          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX email_cola ON email_saliente (estado, proximo_intento_en);

-- Valores que se cambian desde el panel (minutos de reserva, alias, % de transferencia,
-- cuotas sin interés: desactivadas por defecto...).
CREATE TABLE configuracion (
  clave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL CHECK (json_valid(valor))
) WITHOUT ROWID;
