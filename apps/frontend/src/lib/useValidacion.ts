// Hook de las islas del carrito: pide al servidor el total real cada vez que cambia el carrito o la entrega.
// Si el servidor dice que una prenda ya no está o que quedan menos, ajusta el carrito (que vuelve a validarse solo).
import { useStore } from '@nanostores/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ajustarSegun, carrito, validar, type ParametrosValidacion, type Validacion } from './carrito';

export function useValidacion(activo: boolean, parametros: ParametrosValidacion = {}) {
  const lineas = useStore(carrito);
  const [datos, setDatos] = useState<Validacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [reintento, setReintento] = useState(0);
  const turno = useRef(0);
  const clave = JSON.stringify([lineas.map((l) => [l.varianteId, l.cantidad]), parametros]);

  useEffect(() => {
    if (!activo) return;
    if (!lineas.length) {
      turno.current++;
      setDatos(null);
      setCargando(false);
      setError('');
      return;
    }
    const mio = ++turno.current;
    setCargando(true);
    // Una pequeña espera evita una consulta por cada toque en el "+" del carrito.
    const espera = setTimeout(async () => {
      try {
        const r = await validar(parametros);
        if (mio !== turno.current) return;
        // Ajustar cambia el carrito, y eso dispara una nueva validación: no hace falta repetirla acá.
        if (r && ajustarSegun(r.problemas)) return;
        setDatos(r);
        setError('');
      } catch (e) {
        if (mio === turno.current) setError(e instanceof Error ? e.message : 'No pudimos revisar tu carrito.');
      } finally {
        if (mio === turno.current) setCargando(false);
      }
    }, 250);
    return () => clearTimeout(espera);
  }, [activo, clave, reintento]);

  return { lineas, datos, cargando, error, reintentar: () => setReintento((n) => n + 1) };
}
