// Parte interactiva de la ficha de producto: galería, selector de talle y color, cantidad, "Agregar al carrito" y envío.
// Está todo junto en una isla porque la galería cambia al elegir el color y el botón depende de la combinación elegida.
import { useStore } from '@nanostores/preact';
import { ChevronLeft, ChevronRight, CreditCard, Landmark, Ruler, ShoppingBag } from 'lucide-preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { agregar, carrito, carritoAbierto } from '../../lib/carrito';
import { conTransferencia, cuota, pesos, porcentajeDescuento, precioFinal, srcsetFoto, urlFoto, type FichaDeProducto, type Tienda } from '../../lib/formato';
import CotizadorEnvio from './CotizadorEnvio';
import Dialogo from './Dialogo';

interface Props {
  producto: FichaDeProducto;
  tienda: Pick<Tienda, 'descuentoTransferenciaPorcentaje' | 'cuotasSinInteres' | 'reservaMercadoPagoMinutos' | 'reservaTransferenciaHoras' | 'retiro' | 'ultimasUnidadesUmbral' | 'maxUnidadesPorPedido' | 'whatsapp'>;
  // Variante que viene en la dirección (?variante=40), si es válida.
  varianteInicial: number | null;
  // Dirección completa del producto, para compartir.
  url: string;
  // Textos de la ficha (descripción, material, cambios): se muestran como desplegables junto a la compra.
  secciones: { titulo: string; abierta: boolean; parrafos: string[]; enlace?: { href: string; texto: string } }[];
}

// Qué dice la guía de talles. Nuevo: texto. Datos viejos: un objeto, que se muestra como líneas "clave: valor".
function textoGuia(guia: unknown): string {
  if (typeof guia === 'string') return guia;
  if (guia && typeof guia === 'object') return Object.entries(guia).map(([k, v]) => `${k}: ${typeof v === 'object' ? Object.entries(v as object).map(([a, b]) => `${a} ${b}`).join(', ') : v}`).join('\n');
  return '';
}

export default function FichaProducto({ producto: p, tienda, varianteInicial, url, secciones }: Props) {
  const inicial = p.variantes.find((v) => v.id === varianteInicial) ?? null;

  // Opciones que existen, en el orden en que vienen de la API.
  const colores = useMemo(() => {
    const mapa = new Map<number, { id: number; nombre: string; hex: string | null }>();
    for (const v of p.variantes) if (v.colorId !== null && !mapa.has(v.colorId)) mapa.set(v.colorId, { id: v.colorId, nombre: v.color ?? '', hex: v.hex });
    return [...mapa.values()];
  }, [p]);
  // La descripción de cada foto se arma sola: nombre del producto + color.
  const altDe = (colorId: number | null) => [p.nombre, colores.find((c) => c.id === colorId)?.nombre].filter(Boolean).join(' ');
  const talles = useMemo(() => [...new Set(p.variantes.map((v) => v.talle).filter((t): t is string => t !== null))], [p]);

  // Con una sola opción, ya viene elegida.
  const [colorId, setColorId] = useState<number | null>(inicial?.colorId ?? (colores.length === 1 ? colores[0].id : null));
  const [talle, setTalle] = useState<string | null>(inicial?.talle ?? (talles.length === 1 ? talles[0] : null));
  const [cantidad, setCantidad] = useState(1);
  const [indice, setIndice] = useState(0);
  const [mensaje, setMensaje] = useState('');
  const [agregando, setAgregando] = useState(false);
  // Hasta que la isla hidrata, el botón llega del servidor deshabilitado: un toque antes no se perdería en silencio.
  const [listo, setListo] = useState(false);
  useEffect(() => setListo(true), []);
  const [zoom, setZoom] = useState(false);
  const [guia, setGuia] = useState(false);
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
  // Galería del celular: tira que se desliza con el dedo y deja ver el borde de la foto siguiente.
  const tira = useRef<HTMLUListElement>(null);
  useEffect(() => {
    setIndice(0);
    tira.current?.scrollTo({ left: 0 });
  }, [colorId]);
  const alDeslizar = (e: Event) => {
    const el = e.currentTarget as HTMLUListElement;
    setIndice(Math.round((el.scrollLeft / el.scrollWidth) * Math.min(fotos.length, 2)));
  };
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

  // ───────────── Barra fija del celular ─────────────
  // Aparece cuando la fila de "Agregar al carrito" quedó arriba, fuera de la pantalla (como The Frankie Shop).
  const filaBoton = useRef<HTMLDivElement>(null);
  const compra = useRef<HTMLDivElement>(null);
  const barra = true; // siempre a la vista en el celular, como en el diseño
  // Mientras se ve, el final de la página deja lugar para que la barra no tape el pie.
  useEffect(() => {
    document.body.classList.toggle('max-md:pb-20', barra);
    return () => document.body.classList.remove('max-md:pb-20');
  }, [barra]);
  // Si falta elegir color o talle, la barra lleva hasta esa opción en lugar de agregar.
  const tocarBarra = () => {
    if (!falta) return agregarAlCarrito();
    const opcion = compra.current?.querySelector<HTMLElement>(!eligioColor ? '[data-elegir="color"]' : '[data-elegir="talle"]');
    if (!opcion) return;
    opcion.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    opcion.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus({ preventScroll: true });
  };
  const resumen = [talle && `Talle ${talle}`, colores.length > 1 && colores.find((c) => c.id === colorId)?.nombre].filter(Boolean).join(' · ');

  const ultimas = variante && variante.stock > 0 && variante.stock <= tienda.ultimasUnidadesUmbral;
  const textoGuiaTalles = textoGuia(p.guiaTalles);
  const tarjetaPago = 'border-linea rounded-tienda flex gap-3 border p-4';
  // Mosaico de escritorio: ancha 4:5, de a dos 3:4, ancha apaisada; y vuelve a empezar. Si queda una sola foto en la fila, ocupa todo el ancho.
  const celda = (i: number) => {
    const lugar = i % 4;
    if (lugar === 3) return 'col-span-2 aspect-video';
    if (lugar === 0 || (lugar === 1 && i === fotos.length - 1)) return 'col-span-2 aspect-[4/5]';
    return 'aspect-[3/4]';
  };
  const filas: ({ tipo: 'texto' } & Props['secciones'][number] | { tipo: 'envio' } | { tipo: 'pagos' })[] = [
    ...secciones.filter((s) => s.titulo !== 'Cambios').map((s) => ({ tipo: 'texto' as const, ...s })),
    { tipo: 'envio' },
    ...secciones.filter((s) => s.titulo === 'Cambios').map((s) => ({ tipo: 'texto' as const, ...s })),
  ];
  const local = tienda.whatsapp ? `https://wa.me/${tienda.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola! Quiero separar ${p.nombre} para probármelo en el local. ${url}`)}` : null;

  return (
    <div class="grid gap-6 md:grid-cols-[7fr_5fr] md:gap-12 lg:gap-[72px]">
      {/* ───────────── Galería ───────────── */}
      {/* Escritorio: mosaico (la primera foto a todo el ancho, de a dos y una apaisada, y vuelve a empezar). Celular: tira que se desliza. */}
      <div class="min-w-0">
        {fotos.length > 0 ? (
          <>
            <div class="relative md:hidden">
              <ul ref={tira} onScroll={alDeslizar} class="-mx-4 flex snap-x snap-mandatory gap-1 overflow-x-auto [scrollbar-width:none]" aria-label="Fotos">
                {fotos.slice(0, 2).map((f, i) => (
                  <li key={f.clave} class="foto-vacia relative aspect-[3/4] w-full shrink-0 snap-start overflow-hidden">
                    <button type="button" onClick={() => (setIndice(i), setZoom(true))} class="block size-full" aria-label={`Ampliar foto ${i + 1} de ${fotos.length}`}>
                      <img src={urlFoto(f.clave, 'mediano')} srcset={srcsetFoto(f.clave)} sizes="100vw" alt={altDe(f.colorId)} width={900} height={1200} loading={i === 0 ? 'eager' : 'lazy'} fetchpriority={i === 0 ? 'high' : undefined} class="size-full object-cover" />
                    </button>
                  </li>
                ))}
              </ul>
              {fotos.length > 1 && (
                <div class="pointer-events-none absolute inset-x-0 bottom-3.5 flex justify-center gap-1.5" aria-hidden="true">
                  {fotos.slice(0, 2).map((f, i) => <span key={f.clave} class={`h-0.5 w-[18px] ${i === Math.min(indice, fotos.length - 1) ? 'bg-texto' : 'bg-texto/30'}`} />)}
                </div>
              )}
            </div>
            <ul class="hidden grid-cols-2 gap-2 md:grid" aria-label="Fotos">
              {fotos.map((f, i) => (
                <li key={f.clave} class={`foto-vacia relative overflow-hidden ${celda(i)}`}>
                  <button type="button" onClick={() => (setIndice(i), setZoom(true))} class="block size-full cursor-zoom-in" aria-label={`Ampliar foto ${i + 1} de ${fotos.length}`}>
                    <img src={urlFoto(f.clave, 'mediano')} srcset={srcsetFoto(f.clave)} sizes="(min-width: 768px) 55vw, 100vw" alt={altDe(f.colorId)} width={900} height={1200} loading={i < 2 ? 'eager' : 'lazy'} fetchpriority={i === 0 ? 'high' : undefined} class="size-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div class="foto-vacia aspect-[3/4]">
            <span class="text-sm">Sin foto</span>
          </div>
        )}
      </div>

      {/* ───────────── Compra ───────────── */}
      <div ref={compra} class="md:sticky md:top-6 md:self-start md:pt-6">
        <h1 class="text-[34px] leading-[1.04] tracking-[-0.02em] md:text-[40px] lg:text-5xl">{p.nombre}</h1>

        <div class="mt-7 flex flex-col gap-1">
          <p class="flex flex-wrap items-baseline gap-x-3">
            <span class="text-[22px]">{pesos(cobrado)}</span>
            {p.precioOfertaCentavos !== null && <s class="text-suave text-[15px]">{pesos(p.precioCentavos)}</s>}
            {descuento !== null && <span class="text-[15px]">−{descuento} %</span>}
          </p>
          {transferencia !== null && <p class="text-suave text-[15px]">{pesos(transferencia)} con transferencia</p>}
          {p.combo && <p class="text-suave mt-1 text-[15px]">Promo {p.combo}: llevando {p.combo === '2x1' ? '2 pagás 1' : '3 pagás 2'} (sale gratis la más barata).</p>}
        </div>

        <div class="mt-7 space-y-7">
          {colores.length > 1 && (
            <fieldset data-elegir="color">
              <legend class="mb-3 text-[15px]">
                Color <span class="text-suave">· {colorId !== null ? colores.find((c) => c.id === colorId)?.nombre : 'elegí uno'}</span>
              </legend>
              <div class="flex flex-wrap gap-3.5">
                {colores.map((c) => (
                  <label key={c.id} class="cursor-pointer" title={c.nombre}>
                    <input type="radio" name="color" value={c.id} checked={colorId === c.id} onChange={() => elegirColor(c.id)} class="peer sr-only" />
                    <span
                      class={`border-linea peer-checked:outline-texto peer-focus-visible:outline-texto relative block size-[34px] rounded-full border peer-checked:outline-1 peer-checked:outline-offset-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 ${colorConStock(c.id) ? '' : 'opacity-40'}`}
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
            <fieldset data-elegir="talle">
              <legend class="mb-3 flex w-full items-center justify-between text-[15px]">
                <span>Talle</span>
                {textoGuiaTalles && (
                  <button type="button" onClick={() => setGuia(true)} class="text-suave border-b border-[#b9b3a9]">
                    Medidas
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
                        class={`border-linea rounded-tienda peer-checked:border-primario peer-checked:bg-primario peer-checked:text-primario-texto peer-focus-visible:outline-texto flex min-h-[52px] min-w-14 items-center justify-center border px-3 text-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 ${hay ? 'hover:border-texto' : 'text-suave/50 line-through'}`}
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
            {ultimas && <p class="text-oferta font-semibold">{variante!.stock === 1 ? '¡Última unidad!' : `Quedan ${variante!.stock}`}</p>}
            {eligioColor && eligioTalle && !sinStockTotal && (!variante || variante.stock === 0) && <p class="text-suave">Sin stock en esta combinación.</p>}
          </div>

          <div ref={filaBoton} class="flex flex-col gap-4">
            <button type="button" onClick={agregarAlCarrito} disabled={!listo || !!falta || agotada || agregando} class="boton boton-primario min-h-14 w-full text-base tracking-normal normal-case">
              <ShoppingBag class="size-5" aria-hidden="true" />
              {etiquetaBoton}
            </button>
            {local && (
              <a href={local} target="_blank" rel="noopener" class="border-texto self-start border-b pb-[3px] text-[15px]">
                Separalo y probátelo en el local
              </a>
            )}
          </div>
          {mensaje && (
            <p class="text-aviso bg-aviso-fondo rounded-tienda p-3 text-sm" role="alert">
              {mensaje}
            </p>
          )}
          {variante && enCarrito(variante.id) > 0 && !mensaje && <p class="text-suave text-xs">Ya tenés {enCarrito(variante.id)} en el carrito.</p>}
        </div>

        <div class="border-linea mt-8 border-t">
          {filas.map((s) => (
            <details key={s.tipo === 'texto' ? s.titulo : s.tipo} open={s.tipo === 'texto' && s.abierta} class="group border-linea border-b">
              <summary class="flex min-h-14 items-center justify-between text-[15px]">
                {s.tipo === 'envio' ? 'Envío y retiro' : s.tipo === 'pagos' ? 'Medios de pago' : s.titulo}
                <span class="text-xl font-light group-open:hidden" aria-hidden="true">+</span>
                <span class="hidden text-xl font-light group-open:inline" aria-hidden="true">−</span>
              </summary>
              {s.tipo === 'envio' ? (
                <div class="pb-5">
                  <CotizadorEnvio tienda={tienda} subtotalCentavos={cobrado * cantidad} items={variante ? [{ varianteId: variante.id, cantidad }] : undefined} />
                </div>
              ) : s.tipo === 'pagos' ? (
                <div class="pb-5">
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
                  {cuotas && <p class="text-suave mt-3 text-sm">{cuotas.cantidad} cuotas sin interés de <span class="text-texto font-medium">{pesos(cuotas.monto)}</span></p>}
                </div>
              ) : (
                <div class="text-suave space-y-3 pb-5 text-sm leading-relaxed">
                  {s.parrafos.map((texto) => <p key={texto}>{texto}</p>)}
                  {s.enlace && <a href={s.enlace.href} class="text-texto font-medium underline underline-offset-4">{s.enlace.texto}</a>}
                </div>
              )}
            </details>
          ))}
        </div>
      </div>

      {/* Celular: las demás fotos van debajo de los datos de compra, de a dos y una apaisada. */}
      {fotos.length > 2 && (
        <ul class="grid grid-cols-2 gap-1 md:hidden" aria-label="Más fotos">
          {fotos.slice(2).map((f, i, resto) => (
            <li key={f.clave} class={`foto-vacia relative overflow-hidden ${i % 3 === 2 ? 'col-span-2 aspect-video' : i % 3 === 0 && i === resto.length - 1 ? 'col-span-2 aspect-[4/5]' : 'aspect-[3/4]'}`}>
              <button type="button" onClick={() => (setIndice(i + 2), setZoom(true))} class="block size-full" aria-label={`Ampliar foto ${i + 3} de ${fotos.length}`}>
                <img src={urlFoto(f.clave, 'mediano')} srcset={srcsetFoto(f.clave)} sizes="50vw" alt={altDe(f.colorId)} width={900} height={1200} loading="lazy" class="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ───────────── Barra fija del celular ───────────── */}
      {!sinStockTotal && (
        <div
          role="region"
          aria-label="Compra rápida"
          class={`bg-gris border-linea fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t px-4 pt-2.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] md:hidden ${barra ? '' : 'invisible'}`}
        >
          <div class="min-w-0 flex-1">
            <p class="text-base tabular-nums">{pesos(cobrado)}</p>
            {resumen && <p class="text-suave truncate text-[13px]">{resumen}</p>}
          </div>
          <button type="button" onClick={tocarBarra} disabled={!listo || agotada || agregando} class="boton boton-primario shrink-0 px-5! tracking-normal normal-case text-[15px]">
            <ShoppingBag class="size-[18px]" aria-hidden="true" />
            {falta || agotada ? etiquetaBoton : 'Agregar'}
          </button>
        </div>
      )}

      {/* ───────────── Ventanas ───────────── */}
      <Dialogo abierto={zoom} alCerrar={() => setZoom(false)} titulo={p.nombre} ancho>
        {foto && (
          <div class="relative" onTouchStart={deslizar.onTouchStart} onTouchEnd={deslizar.onTouchEnd}>
            <img src={urlFoto(foto.clave, 'grande')} alt={altDe(foto.colorId)} class="mx-auto max-h-[75vh] w-auto max-w-full" />
            {fotos.length > 1 && (
              <>
                <button type="button" onClick={() => ir(indice - 1)} class="boton-icono absolute top-1/2 left-0 -translate-y-1/2 bg-fondo/80" title="Foto anterior" aria-label="Foto anterior">
                  <ChevronLeft class="size-5" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => ir(indice + 1)} class="boton-icono absolute top-1/2 right-0 -translate-y-1/2 bg-fondo/80" title="Foto siguiente" aria-label="Foto siguiente">
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


    </div>
  );
}
