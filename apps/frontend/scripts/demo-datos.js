// SOLO PARA DESARROLLO LOCAL: carga un catálogo de prueba por la API del panel (hay que estar con sesión iniciada).
// Se usa desde la consola del navegador, ya con sesión en /admin: const m = await import('/_demo-datos.js'); m.sembrar();
// Se copia a public/_demo-datos.js mientras se desarrolla y se borra antes de publicar (los scripts de deploy lo verifican).
const log = (window.__log = []);
const decir = (t) => { log.push(t); console.log(t); };

async function api(metodo, ruta, cuerpo) {
  const esForm = cuerpo instanceof FormData;
  const r = await fetch(`/api${ruta}`, {
    method: metodo,
    headers: cuerpo && !esForm ? { 'content-type': 'application/json' } : undefined,
    body: esForm ? cuerpo : cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const json = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${metodo} ${ruta} → ${r.status} ${JSON.stringify(json)}`);
  return json;
}

// Foto de prueba: degradé del color de la prenda con una silueta simple y el nombre abajo.
function foto(ancho, alto, hex, etiqueta, variante) {
  const c = document.createElement('canvas');
  c.width = ancho; c.height = alto;
  const x = c.getContext('2d');
  const base = hex || '#cccccc';
  const g = x.createLinearGradient(0, 0, ancho, alto);
  g.addColorStop(0, '#f1efec'); g.addColorStop(1, '#d9d5cf');
  x.fillStyle = g; x.fillRect(0, 0, ancho, alto);
  x.fillStyle = base;
  x.strokeStyle = 'rgba(0,0,0,.15)'; x.lineWidth = ancho * 0.004;
  const w = ancho, h = alto;
  x.beginPath();
  if (variante % 3 === 0) { // remera
    x.moveTo(w * .30, h * .18); x.lineTo(w * .42, h * .14); x.quadraticCurveTo(w * .5, h * .22, w * .58, h * .14); x.lineTo(w * .70, h * .18);
    x.lineTo(w * .88, h * .32); x.lineTo(w * .78, h * .42); x.lineTo(w * .70, h * .36); x.lineTo(w * .70, h * .78); x.lineTo(w * .30, h * .78);
    x.lineTo(w * .30, h * .36); x.lineTo(w * .22, h * .42); x.lineTo(w * .12, h * .32);
  } else if (variante % 3 === 1) { // vestido
    x.moveTo(w * .38, h * .12); x.lineTo(w * .46, h * .12); x.quadraticCurveTo(w * .5, h * .2, w * .54, h * .12); x.lineTo(w * .62, h * .12);
    x.lineTo(w * .60, h * .34); x.lineTo(w * .78, h * .86); x.lineTo(w * .22, h * .86); x.lineTo(w * .40, h * .34);
  } else { // pantalón
    x.moveTo(w * .30, h * .14); x.lineTo(w * .70, h * .14); x.lineTo(w * .76, h * .86); x.lineTo(w * .56, h * .86); x.lineTo(w * .50, h * .40);
    x.lineTo(w * .44, h * .86); x.lineTo(w * .24, h * .86);
  }
  x.closePath(); x.fill(); x.stroke();
  x.fillStyle = 'rgba(0,0,0,.55)'; x.font = `${Math.round(w * 0.045)}px system-ui, sans-serif`; x.textAlign = 'center';
  x.fillText(etiqueta, w / 2, h * .94);
  return new Promise((ok) => c.toBlob(ok, 'image/webp', 0.8));
}

async function banner(ancho, alto, desde, hasta, titulo) {
  const c = document.createElement('canvas');
  c.width = ancho; c.height = alto;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, ancho, alto);
  g.addColorStop(0, desde); g.addColorStop(1, hasta);
  x.fillStyle = g; x.fillRect(0, 0, ancho, alto);
  x.fillStyle = 'rgba(255,255,255,.92)'; x.textAlign = 'center';
  x.font = `600 ${Math.round(alto * 0.14)}px system-ui, sans-serif`; x.fillText(titulo, ancho / 2, alto * 0.52);
  x.font = `${Math.round(alto * 0.06)}px system-ui, sans-serif`; x.fillText('Nueva temporada', ancho / 2, alto * 0.66);
  return new Promise((ok) => c.toBlob(ok, 'image/webp', 0.8));
}

const PRODUCTOS = [
  // nombre, categoría, precio, oferta, destacado, colores, talles (null = sin talle), stock, colecciones
  ['Remera Básica de Algodón', 'Remeras', 18500, null, false, ['Blanco', 'Negro', 'Beige'], ['S', 'M', 'L', 'XL'], 5, ['Básicos']],
  ['Remera Oversize Estampada', 'Remeras', 22000, 17600, false, ['Negro', 'Gris'], ['S', 'M', 'L'], 4, ['Verano 2027']],
  ['Musculosa Canalé', 'Remeras', 14900, null, false, ['Blanco', 'Rosa'], ['S', 'M', 'L'], 6, ['Básicos']],
  ['Vestido de Lino Midi', 'Vestidos', 45000, null, true, ['Beige', 'Verde'], ['S', 'M', 'L'], 3, ['Verano 2027']],
  ['Vestido Camisero', 'Vestidos', 52000, 41600, false, ['Celeste', 'Blanco'], ['S', 'M', 'L'], 4, ['Verano 2027']],
  ['Vestido Corto Fruncido', 'Vestidos', 39000, null, true, ['Rojo', 'Negro'], ['S', 'M'], 3, []],
  ['Jean Mom Tiro Alto', 'Pantalones', 48000, null, false, ['Azul', 'Negro'], ['38', '40', '42', '44'], 4, ['Básicos']],
  ['Pantalón Sastrero', 'Pantalones', 55000, null, false, ['Negro', 'Beige'], ['38', '40', '42'], 3, []],
  ['Short de Lino', 'Pantalones', 26500, 21200, true, ['Beige', 'Blanco'], ['S', 'M', 'L'], 5, ['Verano 2027']],
  ['Cinturón de Cuero', 'Accesorios', 15000, null, false, ['Marrón', 'Negro'], null, 8, []],
  ['Pañuelo de Seda', 'Accesorios', 9800, null, false, ['Rojo', 'Azul', 'Amarillo'], null, 10, ['Verano 2027']],
  ['Tote Bag de Lona', 'Accesorios', 12500, null, false, ['Beige'], null, 0, []],
];

export async function sembrar() {
  const pasos = [];
  try {
    const { talles, colores } = await api('GET', '/admin/opciones');
    const talle = (n) => talles.find((t) => t.nombre === n)?.id;
    const color = (n) => colores.find((c) => c.nombre === n);

    decir('categorías y colecciones');
    const cats = {};
    for (const [n, guia] of [['Remeras', 'S: busto 88 cm\nM: busto 94 cm\nL: busto 100 cm\nXL: busto 106 cm'], ['Vestidos', 'S: busto 88 cm, cintura 68 cm\nM: busto 94 cm, cintura 74 cm\nL: busto 100 cm, cintura 80 cm'], ['Pantalones', null], ['Accesorios', null]]) {
      cats[n] = (await api('POST', '/admin/categorias', { nombre: n, guiaTalles: guia ?? undefined })).id;
    }
    const cols = {};
    for (const n of ['Verano 2027', 'Básicos']) cols[n] = (await api('POST', '/admin/colecciones', { nombre: n })).id;

    let numero = 0;
    for (const [nombre, cat, precio, oferta, destacado, colorNombres, talleNombres, stock, colecciones] of PRODUCTOS) {
      numero++;
      decir(`producto ${numero}/${PRODUCTOS.length}: ${nombre}`);
      let p = await api('POST', '/admin/productos', {
        categoriaId: cats[cat],
        nombre,
        precioCentavos: precio * 100,
        precioOfertaCentavos: oferta ? oferta * 100 : undefined,
        descripcion: `${nombre}. Prenda cómoda y fresca, pensada para el día a día.\n\nCorte clásico que combina con todo.`,
        material: colorNombres.length % 2 ? '100% algodón' : 'Lino y viscosa',
        cuidados: 'Lavar a mano con agua fría. No usar secadora.',
        pesoGramos: 300,
        coleccionIds: colecciones.map((c) => cols[c]),
      });
      const id = p.id;
      for (const [i, cn] of colorNombres.entries()) {
        for (const tn of talleNombres ?? [null]) {
          // Un par de variantes con poco stock o sin stock, para ver esos estados.
          let s = stock;
          if (nombre === 'Vestido Corto Fruncido' && cn === 'Rojo' && tn === 'S') s = 2;
          if (nombre === 'Remera Básica de Algodón' && cn === 'Negro' && tn === 'XL') s = 0;
          if (nombre === 'Jean Mom Tiro Alto' && cn === 'Negro' && tn === '38') s = 1;
          await api('POST', `/admin/productos/${id}/variantes`, { talleId: tn ? talle(tn) : undefined, colorId: color(cn).id, stock: stock === 0 ? 3 : s });
        }
        const fotos = i === 0 ? 2 : 1;
        for (let f = 0; f < fotos; f++) {
          const form = new FormData();
          const etiqueta = `${nombre} · ${cn}`;
          for (const [tam, ancho] of [['chico', 400], ['mediano', 900], ['grande', 1600]]) {
            form.set(tam, await foto(ancho, Math.round((ancho * 4) / 3), color(cn).hex, etiqueta, numero + f), `${tam}.webp`);
          }
          form.set('colorId', String(color(cn).id));
          form.set('textoAlternativo', `${nombre}, color ${cn}`);
          await api('POST', `/admin/productos/${id}/imagenes`, form);
        }
      }
      await api('PATCH', `/admin/productos/${id}`, { estado: 'publicado', destacado: !!destacado });
      if (stock === 0) {
        // Sin stock: se vende todo en el local.
        const detalle = await api('GET', `/admin/productos/${id}`);
        for (const v of detalle.variantes) await api('POST', `/admin/variantes/${v.id}/stock`, { tipo: 'venta_local', cantidad: v.stock });
      }
    }

    decir('banners');
    for (const [desde, hasta, titulo, enlace] of [['#8aa1b1', '#3d5a6c', 'Colección Verano', '/coleccion/verano-2027'], ['#c9a89a', '#8c5e4f', 'Ofertas de temporada', '/ofertas']]) {
      const f = new FormData();
      f.set('escritorio', await banner(1920, 720, desde, hasta, titulo), 'escritorio.webp');
      f.set('movil', await banner(900, 1100, desde, hasta, titulo), 'movil.webp');
      f.set('enlace', enlace);
      f.set('textoAlternativo', titulo);
      await api('POST', '/admin/banners', f);
    }

    decir('envíos, cupón y configuración');
    const zona = async (datos, rangos) => {
      const z = await api('POST', '/admin/zonas', datos);
      for (const [d, h] of rangos) await api('POST', `/admin/zonas/${z.id}/rangos`, { cpDesde: d, cpHasta: h });
    };
    await zona({ nombre: 'Córdoba', transporte: 'andreani', modalidad: 'domicilio', precioCentavos: 600000, gratisDesdeCentavos: 9000000 }, [[5000, 5999]]);
    await zona({ nombre: 'Todo el país', transporte: 'correo_argentino', modalidad: 'domicilio', precioCentavos: 900000 }, [[1000, 4999], [6000, 9999]]);
    await zona({ nombre: 'A sucursal', transporte: 'correo_argentino', modalidad: 'sucursal', precioCentavos: 700000 }, [[1000, 9999]]);
    await api('POST', '/admin/cupones', { codigo: 'HOLA10', tipo: 'porcentaje', valor: 10 });
    const config = {
      barra_anuncios: 'Envío gratis en Córdoba desde $90.000',
      whatsapp: '+5493510000000',
      instagram: 'sukha.ind',
      email_contacto: 'hola@sukhaind.com.ar',
      datos_legales: 'Sukhä · Razón social de prueba · CUIT 20-00000000-0\nDirección de prueba 123, Córdoba',
      cuotas_sin_interes: true,
      cuotas_cantidad: 3,
      alias_transferencia: 'sukha.prueba',
      titular_transferencia: 'Sukhä de prueba',
      retiro_habilitado: true,
      retiro_direccion: 'Calle de prueba 123, Córdoba',
      retiro_horario: 'Lunes a viernes de 10 a 18',
      contenido_quienes_somos: 'Somos Sukhä, una marca de ropa para mujer.\n\nHacemos prendas cómodas, frescas y pensadas para el día a día.',
      contenido_preguntas_frecuentes: [
        { pregunta: '¿Hacen envíos a todo el país?', respuesta: 'Sí, enviamos por Correo Argentino y Andreani.' },
        { pregunta: '¿Puedo cambiar una prenda?', respuesta: 'Sí, tenés 30 días para pedir un cambio.' },
        { pregunta: '¿Cómo pago?', respuesta: 'Con Mercado Pago o por transferencia, con descuento.' },
      ],
      contenido_politica_cambios: 'Aceptamos cambios dentro de los 30 días de recibida la compra.\n\nLa prenda tiene que estar sin uso y con su etiqueta.',
    };
    for (const [clave, valor] of Object.entries(config)) await api('PUT', `/admin/configuracion/${clave}`, { valor });
    decir('LISTO');
  } catch (e) {
    decir(`ERROR: ${e.message}`);
    throw e;
  }
}
