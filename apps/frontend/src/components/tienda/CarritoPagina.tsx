// Página del carrito: las prendas, el cálculo de envío y el resumen con el total.
import { useStore } from '@nanostores/preact';
import { CircleAlert, ShoppingBag } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { avisos, type OpcionEnvio } from '../../lib/carrito';
import { pesos, type Tienda } from '../../lib/formato';
import { useValidacion } from '../../lib/useValidacion';
import CotizadorEnvio from './CotizadorEnvio';
import LineasCarrito from './LineasCarrito';

type Datos = Pick<Tienda, 'retiro' | 'maxUnidadesPorPedido' | 'descuentoTransferenciaPorcentaje'>;

export default function CarritoPagina({ tienda }: { tienda: Datos }) {
  const [envio, setEnvio] = useState<{ zonaEnvioId: number; codigoPostal: string } | null>(null);
  const nota = useStore(avisos);
  const { lineas, datos, cargando, error, reintentar } = useValidacion(true, envio ? { zonaEnvioId: envio.zonaEnvioId, codigoPostal: envio.codigoPostal } : {});
  const mensajes = Object.values(nota);
  const subtotalLocal = lineas.reduce((s, l) => s + l.precioCentavos * l.cantidad, 0);
  const subtotal = datos?.subtotalCentavos ?? subtotalLocal;

  if (lineas.length === 0) {
    return (
      <div class="flex flex-col items-center gap-3 px-4 py-20 text-center">
        <span class="foto-vacia size-16 rounded-full">
          <ShoppingBag class="size-7" aria-hidden="true" />
        </span>
        <p class="text-lg font-semibold">Tu carrito está vacío</p>
        <p class="text-suave text-sm">Agregá prendas y vas a verlas acá.</p>
        <a href="/productos" class="boton boton-primario mt-2">
          Ver productos
        </a>
      </div>
    );
  }

  const elegirEnvio = (o: OpcionEnvio | null, codigoPostal: string) => setEnvio(o ? { zonaEnvioId: o.zonaEnvioId, codigoPostal } : null);

  return (
    <div class="grid gap-8 lg:grid-cols-[1fr_380px] lg:gap-12">
      <div>
        {mensajes.length > 0 && (
          <div class="bg-aviso-fondo text-aviso rounded-tienda mb-4 p-3 text-sm" role="alert">
            <ul class="space-y-1">
              {mensajes.map((m) => (
                <li class="flex gap-2">
                  <CircleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {m}
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => avisos.set({})} class="mt-2 text-xs font-semibold underline">
              Entendido
            </button>
          </div>
        )}
        <div class="border-linea border-y px-0">
          <LineasCarrito lineas={lineas} datos={datos} maxPorPedido={tienda.maxUnidadesPorPedido} />
        </div>
        {error && (
          <p class="text-oferta mt-3 text-sm" role="alert">
            {error}{' '}
            <button type="button" onClick={reintentar} class="font-semibold underline">
              Reintentar
            </button>
          </p>
        )}
        <a href="/productos" class="mt-4 inline-block text-sm underline underline-offset-4 hover:no-underline">
          ← Seguir comprando
        </a>
      </div>

      <aside class="space-y-5 lg:sticky lg:top-24 lg:self-start" aria-label="Resumen de la compra">
        <CotizadorEnvio tienda={tienda} subtotalCentavos={subtotal} elegible elegida={envio?.zonaEnvioId ?? null} alElegir={elegirEnvio} />

        <div class="bg-gris rounded-tienda space-y-2 p-4 text-sm">
          <p class="flex justify-between">
            <span>Subtotal</span>
            <span class={`tabular-nums ${cargando && !datos ? 'animate-pulse' : ''}`}>{pesos(subtotal)}</span>
          </p>
          <p class="flex justify-between">
            <span>Envío</span>
            <span class="tabular-nums">{envio && datos ? (datos.envioCentavos === 0 ? <span class="text-exito font-medium">Gratis</span> : pesos(datos.envioCentavos)) : <span class="text-suave">A calcular</span>}</span>
          </p>
          <p class="border-linea flex items-baseline justify-between border-t pt-3 text-base font-semibold">
            <span>Total estimado</span>
            <span class="text-lg tabular-nums">{pesos(envio && datos ? datos.totalCentavos : subtotal)}</span>
          </p>
          {tienda.descuentoTransferenciaPorcentaje > 0 && <p class="text-exito text-xs">Pagando con transferencia tenés {tienda.descuentoTransferenciaPorcentaje}% de descuento. Se aplica al finalizar la compra.</p>}
        </div>
        <a href="/checkout" class="boton boton-primario w-full">
          Iniciar compra
        </a>
      </aside>
    </div>
  );
}
