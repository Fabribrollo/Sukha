// Espejo en Drizzle de migrations/*.sql, que son la fuente de verdad (los CHECK viven solo ahí).
// Al agregar una migración, actualizar este archivo a mano.
import { sql } from "drizzle-orm"
import { sqliteTable, AnySQLiteColumn, integer, text, index, foreignKey, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core"


export const categoria = sqliteTable("categoria", {
	id: integer().primaryKey(),
	nombre: text().notNull(),
	slug: text().notNull(),
	guiaTalles: text("guia_talles"),
	orden: integer().default(0).notNull(),
	activa: integer().default(1).notNull(),
	padreId: integer("padre_id").references((): AnySQLiteColumn => categoria.id),
	claveImagen: text("clave_imagen"),
	seoTitulo: text("seo_titulo"),
	seoDescripcion: text("seo_descripcion"),
},
(table) => [
]);

export const coleccion = sqliteTable("coleccion", {
	id: integer().primaryKey(),
	nombre: text().notNull(),
	slug: text().notNull(),
	activa: integer().default(1).notNull(),
	seoTitulo: text("seo_titulo"),
	seoDescripcion: text("seo_descripcion"),
},
(table) => [
]);

export const producto = sqliteTable("producto", {
	id: integer().primaryKey(),
	categoriaId: integer("categoria_id").notNull().references(() => categoria.id),
	nombre: text().notNull(),
	slug: text().notNull(),
	descripcion: text(),
	// Legado: lo reemplaza la lista de materiales (producto_material); queda como respaldo y ya no se usa.
	material: text(),
	// Marca o distribuidor: solo del panel, nunca en la API pública.
	marcaId: integer("marca_id").references(() => marca.id),
	// Para buscadores y redes; vacíos se arman solos (nombre, descripción, primera foto).
	seoTitulo: text("seo_titulo"),
	seoDescripcion: text("seo_descripcion"),
	seoImagen: text("seo_imagen"),
	cuidados: text(),
	precioCentavos: integer("precio_centavos").notNull(),
	precioOfertaCentavos: integer("precio_oferta_centavos"),
	pesoGramos: integer("peso_gramos"),
	destacado: integer().default(0).notNull(),
	estado: text().default("borrador").notNull(),
	creadoEn: text("creado_en").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	actualizadoEn: text("actualizado_en").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
},
(table) => [
	index("producto_categoria_estado").on(table.categoriaId, table.estado),
]);

export const marca = sqliteTable("marca", {
	id: integer().primaryKey(),
	nombre: text().notNull(),
});

export const material = sqliteTable("material", {
	id: integer().primaryKey(),
	nombre: text().notNull(),
});

export const productoMaterial = sqliteTable("producto_material", {
	productoId: integer("producto_id").notNull().references(() => producto.id, { onDelete: "cascade" } ),
	materialId: integer("material_id").notNull().references(() => material.id),
},
(table) => [
	primaryKey({ columns: [table.productoId, table.materialId], name: "producto_material_pk"})
]);

export const productoColeccion = sqliteTable("producto_coleccion", {
	productoId: integer("producto_id").notNull().references(() => producto.id, { onDelete: "cascade" } ),
	coleccionId: integer("coleccion_id").notNull().references(() => coleccion.id, { onDelete: "cascade" } ),
},
(table) => [
	index("producto_coleccion_coleccion").on(table.coleccionId),
	primaryKey({ columns: [table.productoId, table.coleccionId], name: "producto_coleccion_producto_id_coleccion_id_pk"})
]);

export const talle = sqliteTable("talle", {
	id: integer().primaryKey(),
	nombre: text().notNull(),
	orden: integer().default(0).notNull(),
},
(table) => [
]);

export const color = sqliteTable("color", {
	id: integer().primaryKey(),
	nombre: text().notNull(),
	hex: text(),
	orden: integer().default(0).notNull(),
},
(table) => [
]);

export const variante = sqliteTable("variante", {
	id: integer().primaryKey(),
	productoId: integer("producto_id").notNull().references(() => producto.id),
	talleId: integer("talle_id").references(() => talle.id),
	colorId: integer("color_id").references(() => color.id),
	sku: text().notNull(),
	stock: integer().default(0).notNull(),
	activa: integer().default(1).notNull(),
	actualizadoEn: text("actualizado_en").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
},
(table) => [
]);

export const imagen = sqliteTable("imagen", {
	id: integer().primaryKey(),
	productoId: integer("producto_id").notNull().references(() => producto.id, { onDelete: "cascade" } ),
	colorId: integer("color_id").references(() => color.id),
	clave: text().notNull(),
	orden: integer().default(0).notNull(),
	textoAlternativo: text("texto_alternativo"),
	original: text(),
	encuadre: text(),
},
(table) => [
	index("imagen_producto").on(table.productoId, table.orden),
]);

export const redireccion = sqliteTable("redireccion", {
	id: integer().primaryKey(),
	desde: text().notNull().unique(),
	hacia: text().notNull(),
	tipo: integer().default(301).notNull(),
	automatica: integer().default(0).notNull(),
	creadoEn: text("creado_en").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
});

export const banner = sqliteTable("banner", {
	id: integer().primaryKey(),
	clave: text().notNull(),
	claveMovil: text("clave_movil"),
	textoAlternativo: text("texto_alternativo"),
	enlace: text(),
	orden: integer().default(0).notNull(),
	activo: integer().default(1).notNull(),
	desde: text(),
	hasta: text(),
});

export const zonaEnvio = sqliteTable("zona_envio", {
	id: integer().primaryKey(),
	nombre: text().notNull(),
	transporte: text({ enum: ["correo_argentino", "andreani"] }).notNull(),
	modalidad: text({ enum: ["domicilio", "sucursal"] }).notNull(),
	precioCentavos: integer("precio_centavos").notNull(),
	gratisDesdeCentavos: integer("gratis_desde_centavos"),
	activa: integer().default(1).notNull(),
},
(table) => [
]);

export const rangoCp = sqliteTable("rango_cp", {
	id: integer().primaryKey(),
	zonaEnvioId: integer("zona_envio_id").notNull().references(() => zonaEnvio.id, { onDelete: "cascade" } ),
	cpDesde: integer("cp_desde").notNull(),
	cpHasta: integer("cp_hasta").notNull(),
},
(table) => [
	index("rango_cp_busqueda").on(table.cpDesde, table.cpHasta),
]);

export const cupon = sqliteTable("cupon", {
	id: integer().primaryKey(),
	codigo: text().notNull(),
	tipo: text().notNull(),
	valor: integer().default(0).notNull(),
	minimoCentavos: integer("minimo_centavos").default(0).notNull(),
	usosMaximos: integer("usos_maximos"),
	usos: integer().default(0).notNull(),
	venceEn: text("vence_en"),
	activo: integer().default(1).notNull(),
	creadoEn: text("creado_en").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
},
(table) => [
]);

export const promocion = sqliteTable("promocion", {
	id: integer().primaryKey(),
	nombre: text().notNull(),
	tipo: text({ enum: ["liquidacion", "2x1", "3x2"] }).notNull(),
	porcentaje: integer(),
	categoriaId: integer("categoria_id").references(() => categoria.id, { onDelete: "cascade" } ),
	coleccionId: integer("coleccion_id").references(() => coleccion.id, { onDelete: "cascade" } ),
	desde: text(),
	hasta: text(),
	activa: integer().default(1).notNull(),
	creadoEn: text("creado_en").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
});

export const clienta = sqliteTable("clienta", {
	id: integer().primaryKey(),
	email: text().notNull(),
	nombre: text(),
	telefono: text(),
	dni: text(),
	aceptaNovedades: integer("acepta_novedades").default(0).notNull(),
	aceptaNovedadesEn: text("acepta_novedades_en"),
	tokenBaja: text("token_baja").notNull(),
	creadoEn: text("creado_en").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	actualizadoEn: text("actualizado_en").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
},
(table) => [
]);

export const pedido = sqliteTable("pedido", {
	id: integer().primaryKey(),
	tokenSeguimiento: text("token_seguimiento").notNull(),
	claveIdempotencia: text("clave_idempotencia").notNull(),
	clientaId: integer("clienta_id").notNull().references(() => clienta.id),
	estado: text().default("pendiente_pago").notNull(),
	nombre: text().notNull(),
	email: text().notNull(),
	telefono: text().notNull(),
	dni: text().notNull(),
	metodoEntrega: text("metodo_entrega").notNull(),
	calle: text(),
	altura: text(),
	pisoDepto: text("piso_depto"),
	localidad: text(),
	provincia: text(),
	codigoPostal: text("codigo_postal"),
	indicaciones: text(),
	sucursalCorreo: text("sucursal_correo"),
	zonaEnvioId: integer("zona_envio_id").references(() => zonaEnvio.id),
	numeroSeguimiento: text("numero_seguimiento"),
	metodoPago: text("metodo_pago").notNull(),
	subtotalCentavos: integer("subtotal_centavos").notNull(),
	descuentoCentavos: integer("descuento_centavos").default(0).notNull(),
	envioCentavos: integer("envio_centavos").default(0).notNull(),
	totalCentavos: integer("total_centavos").notNull(),
	cuit: text(),
	condicionIva: text("condicion_iva"),
	facturaNumero: text("factura_numero"),
	notaClienta: text("nota_clienta"),
	notaInterna: text("nota_interna"),
	reservaVenceEn: text("reserva_vence_en"),
	ipHash: text("ip_hash"),
	canal: text().default("web").notNull(),
	creadoEn: text("creado_en").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	actualizadoEn: text("actualizado_en").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
},
(table) => [
	index("pedido_fecha").on(table.creadoEn),
	index("pedido_clienta").on(table.clientaId, table.creadoEn),
	index("pedido_vencimiento").on(table.estado, table.reservaVenceEn),
]);

export const pedidoItem = sqliteTable("pedido_item", {
	id: integer().primaryKey(),
	pedidoId: integer("pedido_id").notNull().references(() => pedido.id),
	varianteId: integer("variante_id").notNull().references(() => variante.id),
	nombreProducto: text("nombre_producto").notNull(),
	talle: text(),
	color: text(),
	sku: text().notNull(),
	precioUnitarioCentavos: integer("precio_unitario_centavos").notNull(),
	cantidad: integer().notNull(),
},
(table) => [
	index("pedido_item_variante").on(table.varianteId),
]);

export const pedidoDescuento = sqliteTable("pedido_descuento", {
	id: integer().primaryKey(),
	pedidoId: integer("pedido_id").notNull().references(() => pedido.id),
	tipo: text().notNull(),
	cuponId: integer("cupon_id").references(() => cupon.id),
	descripcion: text().notNull(),
	montoCentavos: integer("monto_centavos").notNull(),
},
(table) => [
	uniqueIndex("un_cupon_por_pedido").on(table.pedidoId),
	index("pedido_descuento_cupon").on(table.cuponId),
	index("pedido_descuento_pedido").on(table.pedidoId),
]);

export const pago = sqliteTable("pago", {
	id: integer().primaryKey(),
	pedidoId: integer("pedido_id").notNull().references(() => pedido.id),
	proveedor: text().notNull(),
	idExterno: text("id_externo"),
	estado: text().notNull(),
	montoCentavos: integer("monto_centavos").notNull(),
	respuestaProveedor: text("respuesta_proveedor"),
	creadoEn: text("creado_en").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	actualizadoEn: text("actualizado_en").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
},
(table) => [
	index("pago_pedido").on(table.pedidoId),
]);

export const solicitudPostventa = sqliteTable("solicitud_postventa", {
	id: integer().primaryKey(),
	pedidoId: integer("pedido_id").notNull().references(() => pedido.id),
	tipo: text().notNull(),
	motivo: text(),
	estado: text().default("abierta").notNull(),
	reembolsoCentavos: integer("reembolso_centavos"),
	creadoEn: text("creado_en").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	actualizadoEn: text("actualizado_en").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
},
(table) => [
	index("solicitud_pedido").on(table.pedidoId),
]);

export const solicitudItem = sqliteTable("solicitud_item", {
	solicitudId: integer("solicitud_id").notNull().references(() => solicitudPostventa.id, { onDelete: "cascade" } ),
	pedidoItemId: integer("pedido_item_id").notNull().references(() => pedidoItem.id),
	cantidad: integer().notNull(),
},
(table) => [
	primaryKey({ columns: [table.solicitudId, table.pedidoItemId], name: "solicitud_item_solicitud_id_pedido_item_id_pk"})
]);

export const admin = sqliteTable("admin", {
	id: integer().primaryKey(),
	email: text().notNull(),
	nombre: text().notNull(),
	hashContrasena: text("hash_contrasena").notNull(),
	activo: integer().default(1).notNull(),
	ultimoAccesoEn: text("ultimo_acceso_en"),
	creadoEn: text("creado_en").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
},
(table) => [
]);

export const sesion = sqliteTable("sesion", {
	tokenHash: text("token_hash").primaryKey().notNull(),
	adminId: integer("admin_id").notNull().references(() => admin.id, { onDelete: "cascade" } ),
	creadoEn: text("creado_en").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	venceEn: text("vence_en").notNull(),
},
(table) => [
]);

export const historialEstado = sqliteTable("historial_estado", {
	id: integer().primaryKey(),
	pedidoId: integer("pedido_id").notNull().references(() => pedido.id),
	adminId: integer("admin_id").references(() => admin.id),
	estadoAnterior: text("estado_anterior"),
	estadoNuevo: text("estado_nuevo").notNull(),
	nota: text(),
	creadoEn: text("creado_en").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
},
(table) => [
	index("historial_pedido").on(table.pedidoId, table.creadoEn),
]);

export const movimientoStock = sqliteTable("movimiento_stock", {
	id: integer().primaryKey(),
	varianteId: integer("variante_id").notNull().references(() => variante.id),
	pedidoId: integer("pedido_id").references(() => pedido.id),
	adminId: integer("admin_id").references(() => admin.id),
	tipo: text().notNull(),
	cantidad: integer().notNull(),
	nota: text(),
	creadoEn: text("creado_en").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
},
(table) => [
	index("movimiento_pedido").on(table.pedidoId),
	index("movimiento_variante").on(table.varianteId, table.creadoEn),
]);

export const emailSaliente = sqliteTable("email_saliente", {
	id: integer().primaryKey(),
	pedidoId: integer("pedido_id").references(() => pedido.id),
	destinatario: text().notNull(),
	tipo: text().notNull(),
	estado: text().default("pendiente").notNull(),
	intentos: integer().default(0).notNull(),
	proximoIntentoEn: text("proximo_intento_en").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	enviadoEn: text("enviado_en"),
	error: text(),
	creadoEn: text("creado_en").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
},
(table) => [
	index("email_cola").on(table.estado, table.proximoIntentoEn),
]);

export const configuracion = sqliteTable("configuracion", {
	clave: text().primaryKey().notNull(),
	valor: text().notNull(),
},
(table) => [
]);


export const cacheExterna = sqliteTable("cache_externa", {
	clave: text().primaryKey().notNull(),
	valor: text().notNull(),
	venceEn: text("vence_en").notNull(),
}, (table) => [
	index("cache_externa_vence_en").on(table.venceEn),
]);

export const escalonEnvio = sqliteTable("escalon_envio", {
	zonaEnvioId: integer("zona_envio_id").notNull().references(() => zonaEnvio.id, { onDelete: "cascade" } ),
	hastaGramos: integer("hasta_gramos").notNull(),
	precioCentavos: integer("precio_centavos").notNull(),
},
(table) => [
	primaryKey({ columns: [table.zonaEnvioId, table.hastaGramos], name: "escalon_envio_pk"})
]);
