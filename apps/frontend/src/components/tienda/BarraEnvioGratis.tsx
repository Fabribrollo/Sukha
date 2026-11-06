// Aviso del carrito: cuánto falta para que alguna zona envíe gratis (la barra se llena al acercarse).
import { pesos } from '../../lib/formato';

export default function BarraEnvioGratis({ subtotalCentavos, desdeCentavos }: { subtotalCentavos: number; desdeCentavos: number | null }) {
  if (!desdeCentavos) return null;
  if (subtotalCentavos >= desdeCentavos) return <p class="text-exito text-sm">Tu compra llega al envío gratis en las zonas que lo incluyen.</p>;
  return (
    <div>
      <p class="text-sm">
        Te faltan <span class="font-medium tabular-nums">{pesos(desdeCentavos - subtotalCentavos)}</span> para el envío gratis
      </p>
      <div class="bg-linea mt-2 h-1" role="progressbar" aria-label="Avance hacia el envío gratis" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((subtotalCentavos / desdeCentavos) * 100)}>
        <div class="bg-texto h-full" style={`width:${Math.round((subtotalCentavos / desdeCentavos) * 100)}%`} />
      </div>
    </div>
  );
}
