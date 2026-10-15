// Parte interactiva de la ficha de producto: galería, selector de talle y color, cantidad, "Agregar al carrito" y envío.
// Está todo junto en una isla porque la galería cambia al elegir el color y el botón depende de la combinación elegida.
import { useStore } from '@nanostores/preact';
import { ChevronLeft, ChevronRight, CreditCard, Landmark, MessageCircle, Minus, Plus, Ruler, ShoppingBag, ZoomIn } from 'lucide-preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { agregar, carrito, carritoAbierto } from '../../lib/carrito';
import { conTransferencia, cuota, pesos, porcentajeDescuento, precioFinal, srcsetFoto, urlFoto, type FichaDeProducto, type Tienda } from '../../lib/formato';
import CotizadorEnvio from './CotizadorEnvio';
import Dialogo from './Dialogo';

interface Props {
  producto: FichaDeProducto;
  tienda: Pick<Tienda, 'descuentoTransferenciaPorcentaje' | 'cuotasSinInteres' | 'reservaMercadoPagoMinutos' | 'reservaTransferenciaHoras' | 'retiro' | 'ultimasUnidadesUmbral' | 'maxUnidadesPorPedido'>;
  // Variante que viene en la dirección (?variante=40), si es válida.
  varianteInicial: number | null;
  // Dirección completa del producto, para compartir.
  url: string;
}

// Qué dice la guía de talles. Nuevo: texto. Datos viejos: un objeto, que se muestra como líneas "clave: valor".
function textoGuia(guia: unknown): string {
  if (typeof guia === 'string') return guia;
  if (guia && typeof guia === 'object') return Object.entries(guia).map(([k, v]) => `${k}: ${typeof v === 'object' ? Object.entries(v as object).map(([a, b]) => `${a} ${b}`).join(', ') : v}`).join('\n');
  return '';
}

export default function FichaProducto({ producto: p, tienda, varianteInicial, url }: Props) {
  const inicial = p.variantes.find((v) => v.id === varianteInicial) ?? null;

  // Opciones que existen, en el orden en que vienen de la API.
  const colores = useMemo(() => {
    const mapa = new Map<number, { id: number; nombre: string; hex: string | null }>();
    for (const v of p.variantes) if (v.colorId !== null && !mapa.has(v.colorId)) mapa.set(v.colorId, { id: v.colorId, nombre: v.color ?? '', hex: v.hex });
    return [...mapa.values()];
  }, [p]);
  const talles = useMemo(() => [...new Set(p.variantes.map((v) => v.talle).filter((t): t is string => t !== null))], [p]);

  // Con una sola opción, ya viene elegida.
  const [colorId, setColorId] = useState<number | null>(inicial?.colorId ?? (colores.length === 1 ? colores[0].id : null));
  const [talle, setTalle] = useState<string | null>(inicial?.talle ?? (talles.length === 1 ? talles[0] : null));
  const [cantidad, setCantidad] = useState(1);
  const [indice, setIndice] = useState(0);
  const [mensaje, setMensaje] = useState('');
  const [agregando, setAgregando] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [guia, setGuia] = useState(false);
  const [pagos, setPagos] = useState(false);
  const toqueX = useRef<number | null>(null);
  const lineasCarrito = useStore(carrito);
  const enCarrito = (id: number) => lineasCarrito.find((l) => l.varianteId === id)?.cantidad ?? 0;

  const eligioColor = colores.length === 0 || colorId !== null;
  const eligioTalle = talles.length === 0 || talle !== null;
  const variante = eligioColor && eligioTalle ? p.variantes.find((v) => (colores.length === 0 || v.colorId === colorId) && (talles.length === 0 || v.talle === talle)) ?? null : null;
  const sinStockTotal = p.variantes.every((v) => v.stock === 0);

  // ───────────── Fotos: primero las del color elegido, después las generales ─────────────
  const fotos = useMemo(() => {
    if (colorId === null) return p.imagenes;
    const lista = [...p.imagenes.filter((i) => i.colorId === colorId), ...p.imagenes.filter((i) => i.colorId === null)];
    return lista.length ? lista : p.imagenes;
  }, [p, colorId]);
  useEffect(() => setIndice(0), [colorId]);
  const foto = fotos[Math.min(indice, fotos.length - 1)];
  const ir = (n: number) => fotos.length && setIndice((n + fotos.length) % fotos.length);
  const deslizar = {
    onTouchStart: (e: TouchEvent) => (toqueX.current = e.touches[0].clientX),
    onTouchEnd: (e: TouchEvent) => {
      if (toqueX.current === null) return;
      const delta = e.changedTouches[0].clientX - toqueX.current;
      toqueX.current = null;
      if (Math.abs(delta) > 40) ir(indice + (delta < 0 ? 1 : -1));
    },
  };

  // La combinación elegida queda en la dirección: ?variante=40
  useEffect(() => {
    const direccion = new URL(location.href);
    if (variante) direccion.searchParams.set('variante', String(variante.id));
    else direccion.searchParams.delete('variante');
    history.replaceState(null, '', direccion);
  }, [variante?.id]);

  // ───────────── Disponibilidad de cada opción ─────────────
  const talleConStock = (t: string) => p.variantes.some((v) => v.talle === t && v.stock > 0 && (colorId === null || v.colorId === colorId));
  const colorConStock = (id: number) => p.variantes.some((v) => v.colorId === id && v.stock > 0 && (talle === null || v.talle === talle));

  // Al cambiar de color, si el talle elegido no hay en ese color, se desmarca.
  const elegirColor = (id: number) => {
    setColorId(id);
    if (talle && !p.variantes.some((v) => v.colorId === id && v.talle === talle && v.stock > 0)) setTalle(talles.length === 1 ? talles[0] : null);
    setMensaje('');
  };

  const maximo = variante ? Math.max(1, Math.min(variante.stock, tienda.maxUnidadesPorPedido)) : 1;
  useEffect(() => setCantidad((c) => Math.min(c, maximo)), [maximo]);

  // ───────────── Precio ─────────────
  const cobrado = precioFinal(p);
  const descuento = porcentajeDescuento(p);
  const transferencia = conTransferencia(cobrado, tienda.descuentoTransferenciaPorcentaje);
  const cuotas = cuota(cobrado, tienda.cuotasSinInteres);

  // ───────────── Botón ─────────────
  const falta = !eligioColor && !eligioTalle ? 'Elegí color y talle' : !eligioColor ? 'Elegí un color' : !eligioTalle ? 'Elegí un talle' : null;
  const agotada = sinStockTotal || (eligioColor && eligioTalle && (!variante || variante.stock === 0));
  const etiquetaBoton = sinStockTotal ? 'Sin stock' : falta ?? (agotada ? 'Sin stock' : 'Agregar al carrito');

  const agregarAlCarrito = () => {
    if (!variante || agregando) return;
    setAgregando(true);
    const fotoCarrito = (p.imagenes.find((i) => i.colorId === variante.colorId) ?? p.imagenes.find((i) => i.colorId === null) ?? p.imagenes[0])?.clave ?? null;
    const r = agregar(
      { varianteId: variante.id, nombre: p.nombre, slug: p.slug, talle: variante.talle, color: variante.color, foto: fotoCarrito, precioCentavos: cobrado },
      cantidad,
      { stock: variante.stock, maxPorPedido: tienda.maxUnidadesPorPedido },
    );
    setMensaje(r.motivo ?? '');
    if (r.agregadas > 0) carritoAbierto.set(true);
    setAgregando(false);
  };

  const ultimas = variante && variante.stock > 0 && variante.stock <= tienda.ultimasUnidadesUmbral;
  const textoGuiaTalles = textoGuia(p.guiaTalles);
  const tarjetaPago = 'border-linea rounded-tienda flex gap-3 border p-4';

  return (
    <div class="grid gap-6 md:grid-cols-[1.4fr_1fr] md:gap-10 lg:grid-cols-[1.5fr_1fr]">
      {/* ───────────── Galería ───────────── */}
      <div class="flex flex-col gap-3 md:flex-row-reverse md:items-start">
        <div class="relative min-w-0 flex-1">
          <div class="foto-vacia rounded-tienda relative aspect-[3/4] overflow-hidden" {...deslizar}>
            {foto ? (
              <button type="button" onClick={() => setZoom(true)} class="group block size-full cursor-zoom-in" aria-label="Ampliar foto">
                <img key={foto.clave} src={urlFoto(foto.clave, 'mediano')} srcset={srcsetFoto(foto.clave)} sizes="(min-width: 768px) 55vw, 100vw" alt={foto.textoAlternativo ?? p.nombre} width={900} height={1200} fetchpriority="high" class="size-full object-cover" />
                <span class="absolute right-3 bottom-3 hidden rounded-full bg-white/90 p-2 shadow group-hover:block md:group-hover:block" aria-hidden="true">
                  <ZoomIn class="size-5" />
                </span>
              </button>
            ) : (
              <span class="text-sm">Sin foto</span>
            )}
            {fotos.length > 1 && (
              <>
                <button type="button" onClick={() => ir(indice - 1)} class="boton-icono absolute top-1/2 left-2 -translate-y-1/2 bg-white/80 shadow max-md:hidden" title="Foto anterior" aria-label="Foto anterior">
                  <ChevronLeft class="size-5" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => ir(indice + 1)} class="boton-icono absolute top-1/2 right-2 -translate-y-1/2 bg-white/80 shadow max-md:hidden" title="Foto siguiente" aria-label="Foto siguiente">
                  <ChevronRight class="size-5" aria-hidden="true" />
                </button>
              </>
            )}
            {descuento !== null && !sinStockTotal && <span class="insignia bg-oferta absolute top-3 left-3 text-white">-{descuento}%</span>}
          </div>
          {fotos.length > 1 && (
            <div class="mt-3 flex justify-center gap-2 md:hidden" role="tablist" aria-label="Fotos">
              {fotos.map((f, i) => (
                <button type="button" role="tab" aria-selected={i === indice} aria-label={`Foto ${i + 1} de ${fotos.length}`} onClick={() => setIndice(i)} class={`relative size-2.5 rounded-full before:absolute before:-inset-x-1.5 before:-inset-y-4 before:content-[''] ${i === indice ? 'bg-primario' : 'bg-linea'}`} key={f.clave} />
              ))}
            </div>
          )}
        </div>
        {fotos.length > 1 && (
          <ul class="hidden w-20 shrink-0 flex-col gap-2 md:flex" aria-label="Miniaturas">
            {fotos.map((f, i) => (
              <li key={f.clave}>
                <button type="button" onClick={() => setIndice(i)} aria-label={`Ver foto ${i + 1}`} aria-current={i === indice} class={`rounded-tienda block w-full overflow-hidden border-2 ${i === indice ? 'border-texto' : 'border-transparent hover:border-linea'}`}>
                  <img src={urlFoto(f.clave, 'chico')} alt="" width={80} height={107} loading="lazy" class="aspect-[3/4] w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ───────────── Compra ───────────── */}
      <div class="md:sticky md:top-24 md:self-start">
        <h1 class="text-2xl leading-tight font-semibold md:text-3xl">{p.nombre}</h1>

        <div class="mt-3">
          <p class="flex flex-wrap items-baseline gap-x-3">
            <span class="text-3xl font-semibold">{pesos(cobrado)}</span>
            {p.precioOfertaCentavos !== null && <s class="text-suave text-lg">{pesos(p.precioCentavos)}</s>}
            {descuento !== null && <span class="insignia bg-oferta text-white">-{descuento}%</span>}
          </p>
          {transferencia !== null && (
            <p class="text-exito mt-1 text-sm font-medium">
              {pesos(transferencia)} pagando con transferencia ({tienda.descuentoTransferenciaPorcentaje}% off)
            </p>
          )}
          {cuotas && (
            <p class="text-suave mt-1 text-sm">
              {cuotas.cantidad} cuotas sin interés de <span class="text-texto font-medium">{pesos(cuotas.monto)}</span>
            </p>
          )}
          <button type="button" onClick={() => setPagos(true)} class="text-suave mt-2 inline-flex items-center gap-1.5 text-sm underline underline-offset-4 hover:no-underline">
            <CreditCard class="size-4" aria-hidden="true" />
            Ver medios de pago
          </button>
        </div>

        <div class="mt-6 space-y-5">
          {colores.length > 1 && (
            <fieldset>
              <legend class="mb-2 text-sm">
                Color: <span class="font-semibold">{colorId !== null ? colores.find((c) => c.id === colorId)?.nombre : 'elegí uno'}</span>
              </legend>
              <div class="flex flex-wrap gap-2.5">
                {colores.map((c) => (
                  <label key={c.id} class="cursor-pointer" title={c.nombre}>
                    <input type="radio" name="color" value={c.id} checked={colorId === c.id} onChange={() => elegirColor(c.id)} class="peer sr-only" />
                    <span
                      class={`border-linea peer-checked:ring-texto peer-focus-visible:outline-texto relative block size-9 rounded-full border peer-checked:ring-2 peer-checked:ring-offset-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 ${colorConStock(c.id) ? '' : 'opacity-40'}`}
                      style={`background:${c.hex ?? '#ddd'}`}
                    >
                      {!colorConStock(c.id) && <span class="bg-texto absolute top-1/2 left-0 h-px w-full -rotate-45" aria-hidden="true" />}
                    </span>
                    <span class="sr-only">
                      {c.nombre}
                      {colorConStock(c.id) ? '' : ' (sin stock)'}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {talles.length > 1 && (
            <fieldset>
              <legend class="mb-2 flex w-full items-center justify-between text-sm">
                <span>
                  Talle: <span class="font-semibold">{talle ?? 'elegí uno'}</span>
                </span>
                {textoGuiaTalles && (
                  <button type="button" onClick={() => setGuia(true)} class="text-suave inline-flex items-center gap-1.5 text-sm underline underline-offset-4 hover:no-underline">
                    <Ruler class="size-4" aria-hidden="true" />
                    Guía de talles
                  </button>
                )}
              </legend>
              <div class="flex flex-wrap gap-2">
                {talles.map((t) => {
                  const hay = talleConStock(t);
                  return (
                    <label key={t} class={hay ? 'cursor-pointer' : 'cursor-not-allowed'}>
                      <input type="radio" name="talle" value={t} checked={talle === t} disabled={!hay} onChange={() => (setTalle(t), setMensaje(''))} class="peer sr-only" />
                      <span
                        class={`border-linea rounded-tienda peer-checked:border-primario peer-checked:bg-primario peer-checked:text-primario-texto peer-focus-visible:outline-texto flex h-11 min-w-12 items-center justify-center border px-3 text-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 ${hay ? 'hover:border-texto' : 'text-suave/50 line-through'}`}
                      >
                        {t}
                        {!hay && <span class="sr-only"> (sin stock)</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
          {talles.length === 1 && textoGuiaTalles && (
            <button type="button" onClick={() => setGuia(true)} class="text-suave inline-flex items-center gap-1.5 text-sm underline underline-offset-4 hover:no-underline">
              <Ruler class="size-4" aria-hidden="true" />
              Guía de talles
            </button>
          )}

          <div aria-live="polite" class="min-h-5 text-sm">
            {ultimas && <p class="text-oferta font-semibold">¡Últimas {variante!.stock} {variante!.stock === 1 ? 'unidad' : 'unidades'}!</p>}
            {eligioColor && eligioTalle && !sinStockTotal && (!variante || variante.stock === 0) && <p class="text-suave">Sin stock en esta combinación.</p>}
          </div>

          <div class="flex items-center gap-3">
            <div class="border-linea rounded-tienda flex items-center border" role="group" aria-label="Cantidad">
              <button type="button" class="boton-icono" onClick={() => setCantidad((c) => Math.max(1, c - 1))} disabled={cantidad <= 1} title="Una menos" aria-label="Una menos">
                <Minus class="size-4" aria-hidden="true" />
              </button>
              <span class="w-10 text-center text-base font-medium tabular-nums" aria-live="polite">
                {cantidad}
              </span>
              <button type="button" class="boton-icono" onClick={() => setCantidad((c) => Math.min(maximo, c + 1))} disabled={cantidad >= maximo || !variante} title="Una más" aria-label="Una más">
                <Plus class="size-4" aria-hidden="true" />
              </button>
            </div>
            <button type="button" onClick={agregarAlCarrito} disabled={!!falta || agotada || agregando} class="boton boton-primario flex-1">
              <ShoppingBag class="size-5" aria-hidden="true" />
              {etiquetaBoton}
            </button>
          </div>
          {mensaje && (
            <p class="text-aviso bg-aviso-fondo rounded-tienda p-3 text-sm" role="alert">
              {mensaje}
            </p>
          )}
          {variante && enCarrito(variante.id) > 0 && !mensaje && <p class="text-suave text-xs">Ya tenés {enCarrito(variante.id)} en el carrito.</p>}
        </div>

        <div class="mt-6">
          <CotizadorEnvio tienda={tienda} subtotalCentavos={cobrado * cantidad} />
        </div>

        <a href={`https://wa.me/?text=${encodeURIComponent(`${p.nombre} - ${url}`)}`} target="_blank" rel="noopener" class="text-suave hover:text-texto mt-4 inline-flex items-center gap-2 text-sm underline underline-offset-4 hover:no-underline">
          <MessageCircle class="size-4" aria-hidden="true" />
          Compartir por WhatsApp
        </a>
      </div>

      {/* ───────────── Ventanas ───────────── */}
      <Dialogo abierto={zoom} alCerrar={() => setZoom(false)} titulo={p.nombre} ancho>
        {foto && (
          <div class="relative" onTouchStart={deslizar.onTouchStart} onTouchEnd={deslizar.onTouchEnd}>
            <img src={urlFoto(foto.clave, 'grande')} alt={foto.textoAlternativo ?? p.nombre} class="mx-auto max-h-[75vh] w-auto max-w-full" />
            {fotos.length > 1 && (
              <>
                <button type="button" onClick={() => ir(indice - 1)} class="boton-icono absolute top-1/2 left-0 -translate-y-1/2 bg-white/80 shadow" title="Foto anterior" aria-label="Foto anterior">
                  <ChevronLeft class="size-5" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => ir(indice + 1)} class="boton-icono absolute top-1/2 right-0 -translate-y-1/2 bg-white/80 shadow" title="Foto siguiente" aria-label="Foto siguiente">
                  <ChevronRight class="size-5" aria-hidden="true" />
                </button>
                <p class="text-suave mt-2 text-center text-sm">
                  {indice + 1} de {fotos.length}
                </p>
              </>
            )}
          </div>
        )}
      </Dialogo>

      <Dialogo abierto={guia} alCerrar={() => setGuia(false)} titulo="Guía de talles">
        <p class="text-sm leading-relaxed whitespace-pre-line">{textoGuiaTalles}</p>
        <p class="text-suave mt-4 text-xs">Las medidas son orientativas. Si tenés dudas, escribinos.</p>
      </Dialogo>

      <Dialogo abierto={pagos} alCerrar={() => setPagos(false)} titulo="Medios de pago">
        <div class="space-y-3">
          <div class={tarjetaPago}>
            <CreditCard class="mt-0.5 size-6 shrink-0" aria-hidden="true" />
            <div class="text-sm">
              <p class="font-semibold">Mercado Pago</p>
              <p class="text-suave mt-1">Tarjetas de crédito y débito, dinero en cuenta y efectivo.</p>
              {tienda.cuotasSinInteres && <p class="mt-1">Hasta {tienda.cuotasSinInteres.cantidad} cuotas sin interés.</p>}
              <p class="text-suave mt-1">Reservamos tus prendas {tienda.reservaMercadoPagoMinutos} minutos mientras pagás.</p>
            </div>
          </div>
          <div class={tarjetaPago}>
            <Landmark class="mt-0.5 size-6 shrink-0" aria-hidden="true" />
            <div class="text-sm">
              <p class="font-semibold">Transferencia bancaria</p>
              {tienda.descuentoTransferenciaPorcentaje > 0 && <p class="text-exito mt-1 font-medium">{tienda.descuentoTransferenciaPorcentaje}% de descuento sobre los productos.</p>}
              <p class="text-suave mt-1">Te damos el alias al finalizar la compra. Reservamos tus prendas {tienda.reservaTransferenciaHoras} horas para que transfieras.</p>
            </div>
          </div>
        </div>
      </Dialogo>
    </div>
  );
}
