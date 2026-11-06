// Alta de una venta por WhatsApp o Instagram (pages/admin/pedidos/nuevo.astro): buscador de prendas, cantidades, envío
// cotizado con la misma tabla de la tienda y total estimado. Crea el pedido con POST /api/admin/pedidos y abre su detalle.
// El total final lo calcula siempre el backend.
import { TRANSPORTES, centavos, pesos } from '../lib/panel';
import { formatearPesos } from './pesos';

type Prenda = { id: number; nombre: string; talle: string | null; color: string | null; sku: string; stock: number; precio_centavos: number; foto: string | null };
type Opcion = { zonaEnvioId: number; nombre: string; transporte: string; modalidad: 'domicilio' | 'sucursal'; precioCentavos: number; gratisDesdeCentavos: number | null };

const form = document.querySelector<HTMLFormElement>('#venta-manual');

if (form) {
  const datos = JSON.parse(form.dataset.datos!) as { prendas: Prenda[]; transferencia: number };
  const q = <T extends HTMLElement>(selector: string) => form.querySelector<T>(selector)!;
  const campo = (nombre: string) => form.elements.namedItem(nombre) as HTMLInputElement;
  const elegido = (nombre: string) => (form.querySelector<HTMLInputElement>(`input[name=${nombre}]:checked`)?.value ?? '');
  const buscar = q<HTMLInputElement>('[data-buscar]');
  const resultados = q<HTMLUListElement>('[data-resultados]');
  const elegidas = q<HTMLUListElement>('[data-elegidas]');
  const fila = q<HTMLTemplateElement>('[data-fila]');
  const error = q<HTMLElement>('[data-error]');
  const crear = q<HTMLButtonElement>('[data-crear]');
  const envioCampo = campo('envio');

  const cantidades = new Map<number, number>();
  const porId = new Map(datos.prendas.map((p) => [p.id, p]));
  const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const detalle = (p: Prenda) => [p.talle, p.color].filter(Boolean).join(' · ');
  const texto = new Map(datos.prendas.map((p) => [p.id, normal(`${p.nombre} ${detalle(p)} ${p.sku}`)]));
  let opciones: Opcion[] = [];
  let envioTocado = false;

  const armarFila = (p: Prenda, conCantidad: boolean) => {
    const li = (fila.content.cloneNode(true) as DocumentFragment).firstElementChild as HTMLLIElement;
    li.dataset.id = String(p.id);
    const img = li.querySelector('img')!;
    if (p.foto) {
      img.src = p.foto;
      img.nextElementSibling!.remove();
    } else img.remove();
    li.querySelector('[data-nombre]')!.textContent = p.nombre;
    li.querySelector('[data-detalle]')!.textContent = [detalle(p), `${p.stock} en stock`].filter(Boolean).join(' · ');
    if (conCantidad) {
      li.querySelector<HTMLElement>('[data-cantidad]')!.hidden = false;
      li.querySelector('[data-numero]')!.textContent = String(cantidades.get(p.id));
      li.querySelector('[data-precio]')!.textContent = pesos(p.precio_centavos * cantidades.get(p.id)!);
    } else {
      li.querySelector('[data-precio]')!.textContent = pesos(p.precio_centavos);
      li.classList.add('cursor-pointer', 'px-3', 'hover:bg-gray-50');
      li.tabIndex = 0;
    }
    return li;
  };

  const mostrarResultados = () => {
    const t = normal(buscar.value.trim());
    const lista = t ? datos.prendas.filter((p) => t.split(/\s+/).every((parte) => texto.get(p.id)!.includes(parte))).slice(0, 8) : [];
    resultados.replaceChildren(...lista.map((p) => armarFila(p, false)));
    resultados.hidden = lista.length === 0;
    q<HTMLElement>('[data-sin-resultados]').hidden = !t || lista.length > 0;
  };

  const subtotal = () => [...cantidades].reduce((s, [id, n]) => s + porId.get(id)!.precio_centavos * n, 0);
  const conEnvio = () => elegido('entrega') === 'envio';
  const opcion = () => opciones.find((o) => String(o.zonaEnvioId) === elegido('zona')) ?? null;

  const actualizar = () => {
    elegidas.replaceChildren(...[...cantidades.keys()].map((id) => armarFila(porId.get(id)!, true)));
    q<HTMLElement>('[data-vacio]').hidden = cantidades.size > 0;
    // Total estimado con las mismas reglas que el backend: transferencia sobre las prendas, después el descuento a mano.
    const sub = subtotal();
    const porTransferencia = elegido('pago') === 'mercadopago' ? 0 : Math.round((sub * datos.transferencia) / 100);
    const descuento = Math.min(centavos(new FormData(form), 'descuento') || 0, sub - porTransferencia);
    const o = conEnvio() ? opcion() : null;
    if (o && !envioTocado) {
      const gratis = o.gratisDesdeCentavos !== null && sub >= o.gratisDesdeCentavos;
      envioCampo.value = ((gratis ? 0 : o.precioCentavos) / 100).toFixed(2).replace('.', ',');
      formatearPesos(envioCampo);
    }
    const envio = o ? centavos(new FormData(form), 'envio') || 0 : 0;
    const unidades = [...cantidades.values()].reduce((s, n) => s + n, 0);
    q('[data-resumen]').textContent = unidades
      ? [`${unidades} ${unidades === 1 ? 'prenda' : 'prendas'}`, porTransferencia && `−${datos.transferencia}% transf.`, descuento > 0 && `−${pesos(descuento)}`, o && `envío ${envio ? pesos(envio) : 'gratis'}`].filter(Boolean).join(' · ')
      : 'Sin prendas';
    q('[data-total]').textContent = pesos(sub - porTransferencia - Math.max(descuento, 0) + envio);
    crear.disabled = unidades === 0;
  };

  const sumar = (id: number, delta: number) => {
    const n = (cantidades.get(id) ?? 0) + delta;
    if (n <= 0) cantidades.delete(id);
    else if (n <= porId.get(id)!.stock) cantidades.set(id, n);
    actualizar();
  };

  buscar.addEventListener('input', mostrarResultados);
  buscar.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const primera = resultados.querySelector<HTMLElement>('li[data-id]');
    if (primera) primera.click();
  });
  resultados.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-id]');
    if (!li) return;
    sumar(Number(li.dataset.id), 1);
    buscar.value = '';
    mostrarResultados();
    buscar.focus();
  });
  resultados.addEventListener('keydown', (e) => e.key === 'Enter' && (e.target as HTMLElement).click());
  elegidas.addEventListener('click', (e) => {
    const boton = (e.target as HTMLElement).closest<HTMLElement>('button');
    const id = Number(boton?.closest<HTMLElement>('li[data-id]')?.dataset.id);
    if (!boton || !id) return;
    if (boton.matches('[data-mas]')) sumar(id, 1);
    if (boton.matches('[data-menos]')) sumar(id, -1);
    if (boton.matches('[data-quitar]')) sumar(id, -cantidades.get(id)!);
  });

  // ───────────── Envío ─────────────
  const verEntrega = () => {
    const o = conEnvio() ? opcion() : null;
    q<HTMLElement>('[data-envio]').hidden = !conEnvio();
    q<HTMLElement>('[data-domicilio]').hidden = o?.modalidad !== 'domicilio';
    q<HTMLElement>('[data-sucursal]').hidden = o?.modalidad !== 'sucursal';
    q<HTMLElement>('[data-localidad]').hidden = !o;
    actualizar();
  };
  const mensajeEnvio = (t: string) => {
    const p = q<HTMLElement>('[data-envio-mensaje]');
    p.textContent = t;
    p.hidden = !t;
  };
  const cotizar = async () => {
    const codigoPostal = campo('codigoPostal').value.trim();
    if (!codigoPostal) return campo('codigoPostal').focus();
    mensajeEnvio('Buscando…');
    const items = [...cantidades].map(([varianteId, cantidad]) => ({ varianteId, cantidad }));
    const r = await fetch('/api/envios/cotizar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codigoPostal, items }) }).catch(() => null);
    const cuerpo = r && ((await r.json().catch(() => null)) as { opciones?: Opcion[]; excedePeso?: boolean; error?: string } | null);
    opciones = cuerpo?.opciones ?? [];
    envioTocado = false;
    mensajeEnvio(!r?.ok ? (cuerpo?.error ?? 'No se pudo cotizar.') : cuerpo?.excedePeso ? 'Pasa los 10 kg: no hay envíos de la tabla.' : opciones.length ? '' : 'No hay envíos para ese código postal.');
    q('[data-opciones]').replaceChildren(
      ...opciones.map((o, i) => {
        const label = document.createElement('label');
        label.className = 'has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-sm';
        label.innerHTML = '<span class="flex items-center gap-2"><input type="radio" name="zona" class="accent-brand-500"><span></span></span><span class="font-medium whitespace-nowrap tabular-nums"></span>';
        const radio = label.querySelector('input')!;
        radio.value = String(o.zonaEnvioId);
        radio.checked = i === 0;
        label.querySelector('span > span')!.textContent = `${TRANSPORTES[o.transporte] ?? o.transporte} · ${o.modalidad === 'sucursal' ? 'a sucursal' : 'a domicilio'} (${o.nombre})`;
        label.lastElementChild!.textContent = pesos(o.precioCentavos);
        return label;
      }),
    );
    verEntrega();
  };
  q('[data-cotizar]').addEventListener('click', cotizar);
  campo('codigoPostal').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    cotizar();
  });
  envioCampo.addEventListener('input', () => (envioTocado = true));
  form.addEventListener('change', (e) => {
    const nombre = (e.target as HTMLInputElement).name;
    if (nombre === 'zona') envioTocado = false;
    if (nombre === 'entrega' || nombre === 'zona') verEntrega();
    else actualizar();
  });
  form.addEventListener('input', (e) => (e.target as HTMLInputElement).name === 'descuento' && actualizar());

  // ───────────── Crear ─────────────
  const valor = (nombre: string) => campo(nombre).value.trim() || null;
  const fallar = (mensaje: string, foco?: string) => {
    error.textContent = mensaje;
    error.hidden = false;
    if (foco) campo(foco).focus();
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    if (!valor('nombre')) return fallar('Falta el nombre de la clienta.', 'nombre');
    if (!valor('telefono')) return fallar('Falta el teléfono.', 'telefono');
    const o = conEnvio() ? opcion() : null;
    if (conEnvio() && !o) return fallar('Elegí un envío: poné el código postal y tocá «Ver envíos».', 'codigoPostal');
    const f = new FormData(form);
    const comunes = { zonaEnvioId: o?.zonaEnvioId, localidad: valor('localidad'), provincia: valor('provincia'), codigoPostal: valor('codigoPostal') };
    const entrega = !o
      ? { metodoEntrega: 'retiro' }
      : o.modalidad === 'domicilio'
        ? { metodoEntrega: 'domicilio', ...comunes, calle: valor('calle'), altura: valor('altura'), pisoDepto: valor('pisoDepto') }
        : { metodoEntrega: 'sucursal', ...comunes, sucursalCorreo: valor('sucursalCorreo') };
    const pago = elegido('pago');
    const cuerpo = {
      claveIdempotencia: valor('claveIdempotencia'),
      canal: elegido('canal'),
      items: [...cantidades].map(([varianteId, cantidad]) => ({ varianteId, cantidad })),
      nombre: valor('nombre'),
      telefono: valor('telefono'),
      email: valor('email'),
      entrega,
      // El envío solo va si se cambió a mano; si no, el backend usa el de la tabla (con su envío gratis).
      envioCentavos: o && envioTocado ? (centavos(f, 'envio') ?? 0) : null,
      descuentoCentavos: centavos(f, 'descuento'),
      metodoPago: pago === 'mercadopago' ? 'mercadopago' : 'transferencia',
      pagado: pago === 'pagado',
      notaInterna: valor('notaInterna'),
    };
    if (Number.isNaN(cuerpo.descuentoCentavos) || Number.isNaN(cuerpo.envioCentavos)) return fallar('Revisá los montos: van como 18.500 o 18.500,50.');
    crear.disabled = true;
    const r = await fetch('/api/admin/pedidos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }).catch(() => null);
    const respuesta = r && ((await r.json().catch(() => null)) as { id?: number; error?: string } | null);
    if (r?.ok && respuesta?.id) return location.assign(`/admin/pedidos/${respuesta.id}`);
    crear.disabled = false;
    fallar(respuesta?.error ?? 'No se pudo crear el pedido. Revisá la conexión y probá de nuevo.');
  });

  actualizar();
}
