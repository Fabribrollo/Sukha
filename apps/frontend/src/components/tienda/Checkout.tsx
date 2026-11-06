// Checkout en una sola página, con tres pasos que se van plegando: contacto, entrega y pago.
// Los totales siempre salen del servidor (POST /api/carrito/validar). El pedido se crea con POST /api/pedidos.
import { useStore } from '@nanostores/preact';
import { Check, ChevronDown, CircleAlert, CreditCard, Home, Landmark, MapPin, Store, Tag } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { carrito, vaciar, type OpcionEnvio, type Validacion } from '../../lib/carrito';
import {
  CONDICIONES_IVA, PROVINCIAS, cargarDatos, claveDelPedido, cpValido, erroresContacto, erroresEntrega, erroresPago, guardarDatos, soloDigitos, terminarCompra,
  type Datos, type Errores, type Modalidad,
} from '../../lib/checkout';
import Autocompletar from './Autocompletar';
import { MENSAJE_PESO_EXCEDIDO, enlaceWhatsapp, pesos, urlFoto, type Tienda } from '../../lib/formato';
import { useValidacion } from '../../lib/useValidacion';
import { NOMBRES_CORREO } from './CotizadorEnvio';

type DatosTienda = Pick<Tienda, 'descuentoTransferenciaPorcentaje' | 'cuotasSinInteres' | 'retiro' | 'reservaMercadoPagoMinutos' | 'reservaTransferenciaHoras' | 'maxUnidadesPorPedido' | 'whatsapp'>;

// ───────────── Piezas ─────────────
function Campo({ id, etiqueta, error, ayuda, children }: { id: string; etiqueta: string; error?: string; ayuda?: string; children: ComponentChildren }) {
  return (
    <div>
      <label for={id} class="etiqueta">
        {etiqueta}
      </label>
      {children}
      {ayuda && !error && <p class="text-suave mt-1 text-xs">{ayuda}</p>}
      {error && (
        <p id={`${id}-error`} class="text-oferta mt-1 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Paso({ numero, titulo, estado, resumen, alEditar, children }: { numero: number; titulo: string; estado: 'activo' | 'hecho' | 'pendiente'; resumen?: ComponentChildren; alEditar?: () => void; children?: ComponentChildren }) {
  // Pasos como en el diseño: líneas finas en lugar de cajas; el que se está completando lleva la línea de tinta arriba.
  return (
    <section class={`${estado === 'activo' ? 'border-texto' : 'border-linea'} border-t py-7 ${estado === 'pendiente' ? 'border-b' : ''}`} aria-labelledby={`paso-${numero}`}>
      <header class="flex items-start justify-between gap-6">
        <div class="min-w-0 flex-1">
          <h2 id={`paso-${numero}`} class={`font-sans text-xs font-medium tracking-[0.24em] uppercase ${estado === 'pendiente' ? 'text-suave' : ''}`}>
            {numero} · {titulo}
          </h2>
          {estado === 'hecho' && <div class="text-suave mt-2 text-base leading-relaxed break-words">{resumen}</div>}
        </div>
        {estado === 'hecho' && alEditar && (
          <button type="button" onClick={alEditar} class="min-h-11 text-sm underline underline-offset-4">
            Editar
          </button>
        )}
      </header>
      {estado === 'activo' && <div class="space-y-4 pt-5">{children}</div>}
    </section>
  );
}

// Resumen de la compra: prendas, cupón y totales. Se muestra dos veces (plegado arriba en el celular, fijo al costado en escritorio).
function Resumen({ idBase, lineas, v, cargando, error, hayEnvio, retiro, cupon, alCambiarCupon, cuponAplicado, alAplicarCupon, alQuitarCupon }: {
  idBase: string; lineas: ReturnType<typeof carrito.get>; v: Validacion | null; cargando: boolean; error: string; hayEnvio: boolean; retiro: boolean;
  cupon: string; alCambiarCupon: (t: string) => void; cuponAplicado: string; alAplicarCupon: () => void; alQuitarCupon: () => void;
}) {
  const local = lineas.reduce((s, l) => s + l.precioCentavos * l.cantidad, 0);
  const subtotal = v?.subtotalCentavos ?? local;
  return (
    <div class="space-y-4">
      <ul class="space-y-3">
        {lineas.map((l) => {
          const precio = v?.lineas.find((x) => x.varianteId === l.varianteId)?.precioCentavos ?? l.precioCentavos;
          return (
            <li key={l.varianteId} class="flex items-center gap-4">
              <span class="relative shrink-0">
                {l.foto ? <img src={urlFoto(l.foto, 'chico')} alt="" width={64} height={84} class="rounded-tienda h-[84px] w-16 object-cover" /> : <span class="foto-vacia rounded-tienda block h-[84px] w-16" />}
              </span>
              <span class="min-w-0 flex-1">
                <span class="line-clamp-2 block text-[15px]">{l.nombre}</span>
                <span class="text-suave mt-1 block text-[13px]">{[l.color, l.talle, l.cantidad].filter(Boolean).join(' · ')}</span>
                <span class="sr-only">Cantidad: {l.cantidad}</span>
              </span>
              <span class="text-[15px] tabular-nums">{pesos(precio * l.cantidad)}</span>
            </li>
          );
        })}
      </ul>

      <details class="border-linea border-y py-3" open={!!cuponAplicado}>
        <summary class="flex items-center justify-between text-sm font-medium">
          <span class="flex items-center gap-2">
            <Tag class="size-4" aria-hidden="true" />
            ¿Tenés un cupón de descuento?
          </span>
          <ChevronDown class="size-4" aria-hidden="true" />
        </summary>
        <form
          class="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            alAplicarCupon();
          }}
        >
          <label class="sr-only" for={`${idBase}-cupon`}>
            Código del cupón
          </label>
          <input id={`${idBase}-cupon`} value={cupon} onInput={(e) => alCambiarCupon((e.target as HTMLInputElement).value)} placeholder="Código" autoComplete="off" class="campo min-h-11 flex-1 uppercase" />
          <button class="boton boton-secundario min-h-11 px-4">Aplicar</button>
        </form>
        {cuponAplicado && v?.cuponRechazado && (
          <p class="text-oferta mt-2 text-sm" role="alert">
            {v.cuponRechazado}{' '}
            <button type="button" onClick={alQuitarCupon} class="font-semibold underline">
              Quitar
            </button>
          </p>
        )}
        {cuponAplicado && v && !v.cuponRechazado && (
          <p class="text-exito mt-2 flex items-center gap-2 text-sm">
            <Check class="size-4" aria-hidden="true" />
            Cupón {cuponAplicado} aplicado{' '}
            <button type="button" onClick={alQuitarCupon} class="text-suave font-medium underline">
              Quitar
            </button>
          </p>
        )}
      </details>

      <dl class={`space-y-2 text-sm ${cargando ? 'opacity-60' : ''}`} aria-live="polite">
        <div class="flex justify-between">
          <dt>Subtotal</dt>
          <dd class="tabular-nums">{pesos(subtotal)}</dd>
        </div>
        {v?.descuentos.map((d) => (
          <div class="text-exito flex justify-between">
            <dt>{d.descripcion}</dt>
            <dd class="tabular-nums">− {pesos(d.montoCentavos)}</dd>
          </div>
        ))}
        <div class="flex justify-between">
          <dt>Envío</dt>
          <dd class="tabular-nums">{retiro ? <span class="text-exito">Gratis (retiro)</span> : hayEnvio && v ? v.envioCentavos === 0 ? <span class="text-exito">Gratis</span> : pesos(v.envioCentavos) : <span class="text-suave">A calcular</span>}</dd>
        </div>
        <div class="border-linea flex items-baseline justify-between border-t pt-3 text-base font-semibold">
          <dt>Total</dt>
          <dd class="text-xl tabular-nums">{pesos(v?.totalCentavos ?? subtotal)}</dd>
        </div>
      </dl>
      {error && (
        <p class="text-oferta text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ───────────── Checkout ─────────────
export default function Checkout({ tienda }: { tienda: DatosTienda }) {
  const lineas = useStore(carrito);
  const [d, setD] = useState<Datos>(() => cargarDatos());
  const [paso, setPaso] = useState(1);
  const [intentos, setIntentos] = useState<Record<number, boolean>>({});
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [opciones, setOpciones] = useState<OpcionEnvio[] | null>(null);
  // El pedido pesa más de 10 kg: no se ofrece envío desde la tienda.
  const [excede, setExcede] = useState(false);
  // Localidad elegida de la lista: acota las sugerencias de calles. No se guarda ni se manda al pedido.
  const [localidadCensal, setLocalidadCensal] = useState<string | null>(null);
  const [localidadesSugeridas, setLocalidadesSugeridas] = useState<{ nombre: string; detalle: string; censalId: string | null }[]>([]);
  const pedirLista = async (ruta: string, senal: AbortSignal) => {
    const r = await fetch(ruta, { signal: senal });
    if (!r.ok) throw new Error('Sugerencias no disponibles');
    return (await r.json()) as any[];
  };
  const buscarLocalidad = async (texto: string, senal: AbortSignal) => {
    if (!d.provincia) return [];
    const lista = await pedirLista(`/api/georef/localidades?provincia=${encodeURIComponent(d.provincia)}&q=${encodeURIComponent(texto)}`, senal);
    setLocalidadesSugeridas(lista);
    return lista.map((l) => ({ texto: l.nombre as string, detalle: l.detalle as string }));
  };
  const buscarCalle = async (texto: string, senal: AbortSignal) => {
    if (!d.provincia) return [];
    const censal = localidadCensal ? `&localidad=${localidadCensal}` : '';
    const lista = await pedirLista(`/api/georef/calles?provincia=${encodeURIComponent(d.provincia)}${censal}&q=${encodeURIComponent(texto)}`, senal);
    return lista.map((c) => ({ texto: c.nombre as string }));
  };
  const [buscandoEnvio, setBuscandoEnvio] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState('');
  const [cuponTexto, setCuponTexto] = useState('');
  const [cuponAplicado, setCuponAplicado] = useState('');
  const [senuelo, setSenuelo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorPedido, setErrorPedido] = useState('');
  const [errorStock, setErrorStock] = useState(false);
  const [listo, setListo] = useState(false);
  const finalizado = useRef(false);

  const cambiar = (campos: Partial<Datos>) => setD((a) => ({ ...a, ...campos }));
  const tocar = (campo: string) => setTocados((t) => ({ ...t, [campo]: true }));
  useEffect(() => guardarDatos(d), [d]);
  // Al cambiar de tipo de envío aparecen campos nuevos: los errores esperan a que la persona toque o intente avanzar.
  useEffect(() => {
    setIntentos((a) => ({ ...a, 2: false }));
    setTocados({});
  }, [d.zonaEnvioId, d.retiro]);

  // Si no hay nada en el carrito, no hay nada que pagar.
  useEffect(() => {
    setListo(true);
    if (!finalizado.current && carrito.get().length === 0) location.replace('/carrito');
  }, [lineas.length]);

  // ───────────── Opciones de envío para el código postal ─────────────
  useEffect(() => {
    if (!cpValido(d.codigoPostal)) {
      setOpciones(null);
      return;
    }
    const control = new AbortController();
    const espera = setTimeout(async () => {
      setBuscandoEnvio(true);
      setErrorEnvio('');
      try {
        const r = await fetch('/api/envios/cotizar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codigoPostal: d.codigoPostal.trim().toUpperCase(), items: carrito.get().map((l) => ({ varianteId: l.varianteId, cantidad: l.cantidad })) }), signal: control.signal });
        const cuerpo = (await r.json()) as any;
        if (!r.ok) throw new Error(cuerpo?.error ?? 'No pudimos calcular el envío.');
        const lista = (Array.isArray(cuerpo) ? cuerpo : cuerpo.opciones) as OpcionEnvio[];
        setOpciones(lista);
        setExcede(Boolean(cuerpo.excedePeso));
        // Si la opción elegida ya no llega a este código postal, se desmarca.
        setD((a) => (a.zonaEnvioId !== null && !lista.some((o) => o.zonaEnvioId === a.zonaEnvioId) ? { ...a, zonaEnvioId: null } : a));
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setErrorEnvio(e instanceof Error ? e.message : 'No pudimos calcular el envío.');
      } finally {
        setBuscandoEnvio(false);
      }
    }, 350);
    return () => {
      clearTimeout(espera);
      control.abort();
    };
  }, [d.codigoPostal]);

  const opcion = opciones?.find((o) => o.zonaEnvioId === d.zonaEnvioId) ?? null;
  const modalidad: Modalidad | null = d.retiro ? 'retiro' : opcion?.modalidad ?? null;

  // ───────────── Totales del servidor ─────────────
  const { datos: v, cargando, error: errorTotales } = useValidacion(true, {
    cupon: cuponAplicado || null,
    // Solo se manda la opción si sigue disponible para este código postal; si no, el servidor la rechazaría.
    zonaEnvioId: opcion ? opcion.zonaEnvioId : null,
    codigoPostal: opcion ? d.codigoPostal.trim().toUpperCase() : null,
    metodoPago: d.metodoPago,
  });
  const gratis = (o: OpcionEnvio) => o.gratisDesdeCentavos !== null && (v?.subtotalCentavos ?? 0) >= o.gratisDesdeCentavos;

  // ───────────── Pasos ─────────────
  const e1 = erroresContacto(d);
  const e2 = erroresEntrega(d, modalidad);
  const e3 = erroresPago(d);
  const mostrar = (n: number, campo: string, errores: Errores) => ((intentos[n] || tocados[campo]) && errores[campo]) || undefined;
  const alPrimerError = () => setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 50);

  const continuar = (n: number, errores: Errores) => {
    setIntentos((a) => ({ ...a, [n]: true }));
    if (Object.keys(errores).length) return alPrimerError();
    avisarCarrito(n);
    setPaso(n + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Carrito abandonado: al seguir de un paso se guarda el email (y, después del paso 2, nombre y teléfono) con el carrito,
  // para que la tienda pueda escribirle si no termina. Si falla, no molesta: la compra sigue igual.
  const avisarCarrito = (n: number) => {
    if (!lineas.length) return;
    fetch('/api/carritos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: d.email.trim(),
        nombre: d.nombre.trim() || null,
        telefono: d.telefono.trim() || null,
        items: lineas.map((l) => ({ varianteId: l.varianteId, cantidad: l.cantidad })),
      }),
      keepalive: true,
    }).catch(() => {});
  };

  const propiedades = (id: string, error?: string) => ({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-error` : undefined, onBlur: () => tocar(id) });

  // ───────────── Finalizar ─────────────
  const finalizar = async () => {
    setIntentos((a) => ({ ...a, 1: true, 2: true, 3: true }));
    if (Object.keys(e1).length) return (setPaso(1), alPrimerError());
    if (Object.keys(e2).length) return (setPaso(2), alPrimerError());
    if (Object.keys(e3).length) return alPrimerError();
    setEnviando(true);
    setErrorPedido('');
    setErrorStock(false);
    const cp = d.codigoPostal.trim().toUpperCase();
    const entrega =
      modalidad === 'retiro'
        ? { metodoEntrega: 'retiro' }
        : modalidad === 'sucursal'
          ? { metodoEntrega: 'sucursal', zonaEnvioId: opcion!.zonaEnvioId, sucursalCorreo: d.sucursal.trim(), localidad: d.localidad.trim() || null, provincia: d.provincia, codigoPostal: cp }
          : { metodoEntrega: 'domicilio', zonaEnvioId: opcion!.zonaEnvioId, calle: d.calle.trim(), altura: d.altura.trim(), pisoDepto: d.pisoDepto.trim() || null, localidad: d.localidad.trim(), provincia: d.provincia, codigoPostal: cp, indicaciones: d.indicaciones.trim() || null };
    try {
      const r = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          claveIdempotencia: claveDelPedido(),
          items: lineas.map((l) => ({ varianteId: l.varianteId, cantidad: l.cantidad })),
          nombre: d.nombre.trim(),
          email: d.email.trim(),
          telefono: d.telefono.trim(),
          dni: soloDigitos(d.dni),
          entrega,
          metodoPago: d.metodoPago,
          // Un cupón rechazado no se manda: el servidor rechazaría el pedido entero.
          cupon: cuponAplicado && !v?.cuponRechazado ? cuponAplicado : null,
          aceptaNovedades: d.aceptaNovedades,
          ...(d.facturaA ? { cuit: soloDigitos(d.cuit), condicionIva: d.condicionIva } : {}),
          nota: d.nota.trim() || null,
          comentarioExtra: senuelo,
        }),
      });
      const cuerpo = (await r.json().catch(() => null)) as any;
      if (!r.ok) {
        setErrorPedido(cuerpo?.error ?? 'No pudimos crear tu pedido. Probá de nuevo.');
        setErrorStock(r.status === 409);
        return setEnviando(false);
      }
      // Pedido creado: se vacía el carrito y se sigue al pago o al seguimiento.
      finalizado.current = true;
      terminarCompra({ numero: cuerpo.numero, token: cuerpo.token });
      vaciar();
      location.assign(d.metodoPago === 'mercadopago' && cuerpo.urlPago ? cuerpo.urlPago : `/pedido/${cuerpo.token}`);
    } catch {
      setErrorPedido('No pudimos conectarnos. Revisá tu conexión y probá de nuevo: no se va a duplicar el pedido.');
      setEnviando(false);
    }
  };

  if (!listo) return <p class="text-suave py-20 text-center text-sm">Cargando…</p>;
  if (lineas.length === 0) return null;

  const resumenProps = {
    lineas, v, cargando, error: errorTotales, hayEnvio: !!opcion, retiro: d.retiro, cupon: cuponTexto, alCambiarCupon: setCuponTexto, cuponAplicado,
    alAplicarCupon: () => setCuponAplicado(cuponTexto.trim().toUpperCase()), alQuitarCupon: () => (setCuponAplicado(''), setCuponTexto('')),
  };
  const totalTexto = pesos(v?.totalCentavos ?? lineas.reduce((s, l) => s + l.precioCentavos * l.cantidad, 0));
  const tarjetaOpcion = (activa: boolean) => `rounded-tienda flex min-h-[72px] cursor-pointer items-center gap-4 border px-5 py-3 ${activa ? 'border-texto bg-gris' : 'border-linea hover:border-texto'}`;

  return (
    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-20">
      {/* Resumen plegable (celular) */}
      <details class="border-linea rounded-tienda border lg:hidden">
        <summary class="flex items-center justify-between p-4 text-sm font-medium">
          <span>
            Ver resumen <ChevronDown class="ml-1 inline size-4" aria-hidden="true" />
          </span>
          <span class="text-base font-semibold tabular-nums">{totalTexto}</span>
        </summary>
        <div class="border-linea border-t p-4">
          <Resumen idBase="movil" {...resumenProps} />
        </div>
      </details>

      <div class="space-y-4">
        {/* ───────────── 1. Contacto ───────────── */}
        <Paso numero={1} titulo="Tus datos" estado={paso === 1 ? 'activo' : 'hecho'} alEditar={() => setPaso(1)} resumen={`${d.nombre} · ${d.email} · ${d.telefono}`}>
          <Campo id="email" etiqueta="Email" error={mostrar(1, 'email', e1)}>
            <input {...propiedades('email', mostrar(1, 'email', e1))} type="email" autoComplete="email" inputMode="email" value={d.email} onInput={(e) => cambiar({ email: (e.target as HTMLInputElement).value })} class="campo" />
          </Campo>
          <Campo id="nombre" etiqueta="Nombre y apellido" error={mostrar(1, 'nombre', e1)}>
            <input {...propiedades('nombre', mostrar(1, 'nombre', e1))} autoComplete="name" value={d.nombre} onInput={(e) => cambiar({ nombre: (e.target as HTMLInputElement).value })} class="campo" />
          </Campo>
          <Campo id="telefono" etiqueta="Teléfono" error={mostrar(1, 'telefono', e1)}>
            <input {...propiedades('telefono', mostrar(1, 'telefono', e1))} type="tel" autoComplete="tel" inputMode="tel" value={d.telefono} onInput={(e) => cambiar({ telefono: (e.target as HTMLInputElement).value })} class="campo" />
          </Campo>
          <label class="flex cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" checked={d.aceptaNovedades} onChange={(e) => cambiar({ aceptaNovedades: (e.target as HTMLInputElement).checked })} class="size-5 rounded" />
            Quiero recibir lanzamientos y promociones por email. Me puedo dar de baja cuando quiera.
          </label>
          <p class="text-suave text-xs">
            Guardamos tu email y tu carrito para ayudarte a terminar tu compra si no la completás. Ver{' '}
            <a href="/privacidad" target="_blank" rel="noopener" class="underline underline-offset-4">
              política de privacidad
            </a>
            .
          </p>
          <button type="button" class="boton boton-primario w-full sm:w-auto" onClick={() => continuar(1, e1)}>
            Continuar
          </button>
        </Paso>

        {/* ───────────── 2. Entrega ───────────── */}
        <Paso
          numero={2}
          titulo="Entrega"
          estado={paso === 2 ? 'activo' : paso > 2 ? 'hecho' : 'pendiente'}
          alEditar={() => setPaso(2)}
          resumen={
            <>
              <span class="block">
                {modalidad === 'retiro' ? `Retiro en persona${tienda.retiro ? `: ${tienda.retiro.direccion}` : ''}` : modalidad === 'sucursal' ? `${NOMBRES_CORREO[opcion!.transporte]} a sucursal: ${d.sucursal}` : `${d.calle} ${d.altura}${d.pisoDepto ? `, ${d.pisoDepto}` : ''}, ${d.localidad}, ${d.provincia}`}
              </span>
            </>
          }
        >
          <Campo id="codigoPostal" etiqueta="Código postal" error={mostrar(2, 'codigoPostal', e2)}>
            <input {...propiedades('codigoPostal', mostrar(2, 'codigoPostal', e2))} value={d.codigoPostal} onInput={(e) => cambiar({ codigoPostal: (e.target as HTMLInputElement).value })} inputMode="numeric" autoComplete="postal-code" maxLength={8} class="campo sm:max-w-48" />
          </Campo>

          {cpValido(d.codigoPostal) && (
            <fieldset aria-describedby={e2.envio && intentos[2] ? 'envio-error' : undefined}>
              <legend class="etiqueta">Cómo querés recibir tu compra</legend>
              {buscandoEnvio && <p class="text-suave text-sm">Buscando opciones…</p>}
              {errorEnvio && (
                <p class="text-oferta text-sm" role="alert">
                  {errorEnvio}
                </p>
              )}
              <div class="space-y-2">
                {opciones?.map((o) => {
                  const activa = !d.retiro && d.zonaEnvioId === o.zonaEnvioId;
                  return (
                    <label key={o.zonaEnvioId} class={tarjetaOpcion(activa)}>
                      <input type="radio" name="envio" checked={activa} onChange={() => cambiar({ zonaEnvioId: o.zonaEnvioId, retiro: false })} class="accent-texto size-[18px]" />
                      <span class="min-w-0 flex-1">
                        <span class="block text-base">{o.modalidad === 'sucursal' ? 'Envío a sucursal' : 'Envío a domicilio'} · {NOMBRES_CORREO[o.transporte]}</span>
                        <span class="text-suave block text-sm">{o.nombre}</span>
                      </span>
                      <span class="text-base">{gratis(o) || o.precioCentavos === 0 ? 'Gratis' : pesos(o.precioCentavos)}</span>
                    </label>
                  );
                })}
                {tienda.retiro && (
                  <label class={tarjetaOpcion(d.retiro)}>
                    <input type="radio" name="envio" checked={d.retiro} onChange={() => cambiar({ retiro: true, zonaEnvioId: null })} class="size-4" />
                    <Store class="text-suave size-5 shrink-0" aria-hidden="true" />
                    <span class="min-w-0 flex-1 text-sm">
                      <span class="block font-medium">Retiro en persona</span>
                      <span class="text-suave block text-xs">{tienda.retiro.direccion} · {tienda.retiro.horario}</span>
                    </span>
                    <span class="text-exito text-sm font-semibold">Gratis</span>
                  </label>
                )}
                {excede && (
                  <p class="bg-aviso-fondo text-aviso rounded-tienda p-3 text-sm">
                    Tu pedido pesa más de 10 kg: el envío se cotiza aparte.{' '}
                    {tienda.whatsapp && <a href={enlaceWhatsapp(tienda.whatsapp, MENSAJE_PESO_EXCEDIDO)} target="_blank" rel="noopener" class="font-semibold underline">Consultalo por WhatsApp</a>}
                    {tienda.retiro && ' O elegí retirarlo en persona.'}
                  </p>
                )}
                {!excede && opciones && opciones.length === 0 && !tienda.retiro && <p class="text-suave text-sm">Todavía no enviamos a ese código postal. Escribinos y lo vemos.</p>}
              </div>
              {e2.envio && intentos[2] && !buscandoEnvio && (
                <p id="envio-error" class="text-oferta mt-2 text-sm" role="alert">
                  {e2.envio}
                </p>
              )}
            </fieldset>
          )}

          {modalidad && (
            <>
              <div class="grid gap-4 sm:grid-cols-2">
                <Campo id="dni" etiqueta="DNI" error={mostrar(2, 'dni', e2)}>
                  <input {...propiedades('dni', mostrar(2, 'dni', e2))} inputMode="numeric" autoComplete="off" value={d.dni} onInput={(e) => cambiar({ dni: (e.target as HTMLInputElement).value })} class="campo" />
                </Campo>

                {modalidad !== 'retiro' && (
                  <Campo id="provincia" etiqueta="Provincia" error={mostrar(2, 'provincia', e2)}>
                    <select {...propiedades('provincia', mostrar(2, 'provincia', e2))} autoComplete="address-level1" value={d.provincia} onChange={(e) => (setLocalidadCensal(null), cambiar({ provincia: (e.target as HTMLSelectElement).value, localidadValida: false }))} class="campo pr-10">
                      <option value="">Elegí una provincia</option>
                      {PROVINCIAS.map((p) => (
                        <option value={p}>{p}</option>
                      ))}
                    </select>
                  </Campo>
                )}
                {modalidad === 'domicilio' && (
                  <>
                    <Campo id="localidad" etiqueta="Localidad" error={mostrar(2, 'localidad', e2)}>
                      <Autocompletar id="localidad" value={d.localidad} onInput={(v) => (setLocalidadCensal(null), cambiar({ localidad: v, localidadValida: false }))} buscar={buscarLocalidad} alElegir={(i) => (setLocalidadCensal(localidadesSugeridas[i]?.censalId ?? null), cambiar({ localidadValida: true }))} alBuscar={(n) => n === null && cambiar({ localidadValida: true })} entrada={{ ...propiedades('localidad', mostrar(2, 'localidad', e2)), autoComplete: 'off' }} />
                    </Campo>
                    <Campo id="calle" etiqueta="Calle" error={mostrar(2, 'calle', e2)}>
                      <Autocompletar id="calle" value={d.calle} onInput={(v) => cambiar({ calle: v })} buscar={buscarCalle} entrada={{ ...propiedades('calle', mostrar(2, 'calle', e2)), autoComplete: 'off' }} />
                    </Campo>
                    <Campo id="altura" etiqueta="Altura" error={mostrar(2, 'altura', e2)}>
                      <input {...propiedades('altura', mostrar(2, 'altura', e2))} inputMode="numeric" value={d.altura} onInput={(e) => cambiar({ altura: (e.target as HTMLInputElement).value })} class="campo" />
                    </Campo>
                    <Campo id="pisoDepto" etiqueta="Piso y depto (opcional)">
                      <input id="pisoDepto" autoComplete="address-line2" value={d.pisoDepto} onInput={(e) => cambiar({ pisoDepto: (e.target as HTMLInputElement).value })} class="campo" />
                    </Campo>
                  </>
                )}
                {modalidad === 'sucursal' && (
                  <>
                    <div class="sm:col-span-2">
                      <Campo id="sucursal" etiqueta="Sucursal del correo" error={mostrar(2, 'sucursal', e2)}>
                        <input {...propiedades('sucursal', mostrar(2, 'sucursal', e2))} value={d.sucursal} onInput={(e) => cambiar({ sucursal: (e.target as HTMLInputElement).value })} class="campo" />
                      </Campo>
                    </div>
                    <Campo id="localidad" etiqueta="Localidad (opcional)">
                      <input id="localidad" autoComplete="address-level2" value={d.localidad} onInput={(e) => cambiar({ localidad: (e.target as HTMLInputElement).value })} class="campo" />
                    </Campo>
                  </>
                )}
                {modalidad === 'domicilio' && (
                  <div class="sm:col-span-2">
                    <Campo id="indicaciones" etiqueta="Indicaciones para la entrega (opcional)">
                      <input id="indicaciones" maxLength={300} value={d.indicaciones} onInput={(e) => cambiar({ indicaciones: (e.target as HTMLInputElement).value })} class="campo" placeholder="Por ejemplo: timbre de abajo" />
                    </Campo>
                  </div>
                )}
              </div>

              <details class="border-linea border-t pt-3" open={d.facturaA}>
                <summary class="flex items-center justify-between text-sm font-medium">
                  Necesito factura A
                  <ChevronDown class="size-4" aria-hidden="true" />
                </summary>
                <div class="mt-3 grid gap-4 sm:grid-cols-2">
                  <label class="flex cursor-pointer items-center gap-3 text-sm sm:col-span-2">
                    <input type="checkbox" checked={d.facturaA} onChange={(e) => cambiar({ facturaA: (e.target as HTMLInputElement).checked })} class="size-5 rounded" />
                    Quiero que me emitan factura A
                  </label>
                  {d.facturaA && (
                    <>
                      <Campo id="cuit" etiqueta="CUIT" error={mostrar(2, 'cuit', e2)}>
                        <input {...propiedades('cuit', mostrar(2, 'cuit', e2))} inputMode="numeric" value={d.cuit} onInput={(e) => cambiar({ cuit: (e.target as HTMLInputElement).value })} class="campo" />
                      </Campo>
                      <Campo id="condicionIva" etiqueta="Condición frente al IVA">
                        <select id="condicionIva" value={d.condicionIva} onChange={(e) => cambiar({ condicionIva: (e.target as HTMLSelectElement).value })} class="campo pr-10">
                          {Object.entries(CONDICIONES_IVA).map(([valor, nombre]) => (
                            <option value={valor}>{nombre}</option>
                          ))}
                        </select>
                      </Campo>
                    </>
                  )}
                </div>
              </details>
            </>
          )}

          <button type="button" class="boton boton-primario w-full sm:w-auto" onClick={() => continuar(2, e2)}>
            Continuar
          </button>
        </Paso>

        {/* ───────────── 3. Pago ───────────── */}
        <Paso numero={3} titulo="Pago" estado={paso === 3 ? 'activo' : 'pendiente'}>
          <fieldset>
            <legend class="etiqueta">Cómo querés pagar</legend>
            <div class="space-y-2">
              <label class={tarjetaOpcion(d.metodoPago === 'mercadopago')}>
                <input type="radio" name="pago" checked={d.metodoPago === 'mercadopago'} onChange={() => cambiar({ metodoPago: 'mercadopago' })} class="size-4" />
                <CreditCard class="text-suave size-5 shrink-0" aria-hidden="true" />
                <span class="min-w-0 flex-1 text-sm">
                  <span class="block font-medium">Mercado Pago</span>
                  {tienda.cuotasSinInteres && <span class="text-exito block text-xs font-medium">Hasta {tienda.cuotasSinInteres.cantidad} cuotas sin interés</span>}
                </span>
              </label>
              <label class={tarjetaOpcion(d.metodoPago === 'transferencia')}>
                <input type="radio" name="pago" checked={d.metodoPago === 'transferencia'} onChange={() => cambiar({ metodoPago: 'transferencia' })} class="size-4" />
                <Landmark class="text-suave size-5 shrink-0" aria-hidden="true" />
                <span class="min-w-0 flex-1 text-sm">
                  <span class="block font-medium">Transferencia bancaria</span>
                </span>
                {tienda.descuentoTransferenciaPorcentaje > 0 && <span class="insignia bg-exito text-white">{tienda.descuentoTransferenciaPorcentaje}% OFF</span>}
              </label>
            </div>
          </fieldset>
          <Campo id="nota" etiqueta="Nota para la tienda (opcional)">
            <textarea id="nota" rows={2} maxLength={300} value={d.nota} onInput={(e) => cambiar({ nota: (e.target as HTMLTextAreaElement).value })} class="campo" placeholder="Por ejemplo: es para regalo" />
          </Campo>
          <p class="text-suave text-sm">
            Reservamos tus prendas {tienda.reservaMercadoPagoMinutos} minutos con Mercado Pago y {tienda.reservaTransferenciaHoras} horas con transferencia. Si no recibimos el pago a tiempo, el pedido se cancela solo.
          </p>

          <div>
            <label class="flex cursor-pointer items-start gap-3 text-sm">
              <input {...propiedades('acepta', mostrar(3, 'acepta', e3))} type="checkbox" checked={d.acepta} onChange={(e) => cambiar({ acepta: (e.target as HTMLInputElement).checked })} class="mt-0.5 size-5 shrink-0 rounded" />
              <span>
                Acepto los{' '}
                <a href="/terminos" target="_blank" rel="noopener" class="underline underline-offset-4">
                  términos y condiciones
                </a>{' '}
                y la{' '}
                <a href="/privacidad" target="_blank" rel="noopener" class="underline underline-offset-4">
                  política de privacidad
                </a>
              </span>
            </label>
            {mostrar(3, 'acepta', e3) && (
              <p id="acepta-error" class="text-oferta mt-1 text-sm" role="alert">
                {e3.acepta}
              </p>
            )}
          </div>

          {/* Campo señuelo contra bots: fuera de pantalla (no con display:none) y se manda tal cual. */}
          <input type="text" name="comentarioExtra" tabIndex={-1} autoComplete="off" aria-hidden="true" value={senuelo} onInput={(e) => setSenuelo((e.target as HTMLInputElement).value)} style="position:absolute;left:-9999px;width:1px;height:1px" />

          {errorPedido && (
            <div class="bg-aviso-fondo text-aviso rounded-tienda flex gap-2 p-3 text-sm" role="alert">
              <CircleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                {errorPedido}{' '}
                {errorStock && (
                  <a href="/carrito" class="font-semibold underline">
                    Volver al carrito
                  </a>
                )}
              </p>
            </div>
          )}

          <button type="button" class="boton boton-primario w-full" disabled={enviando || paso !== 3} onClick={finalizar}>
            {enviando ? 'Procesando…' : `Finalizar compra · ${totalTexto}`}
          </button>
        </Paso>

      </div>

      {/* Resumen fijo (escritorio) */}
      <aside class="hidden lg:block" aria-label="Resumen de la compra">
        <div class="bg-gris border-linea rounded-tienda sticky top-6 border p-8">
          <h2 class="mb-5 font-sans text-xs font-medium tracking-[0.24em] uppercase">Tu pedido</h2>
          <Resumen idBase="escritorio" {...resumenProps} />
        </div>
      </aside>
    </div>
  );
}
