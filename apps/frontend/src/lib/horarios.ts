// Horarios de retiro en persona: día por día, con franjas (horario cortado). La tienda muestra un texto corto que se
// arma desde los horarios al guardar (por ejemplo «Lunes a viernes de 9 a 13 y de 16 a 20; sábado de 9 a 13»).
export const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const;
export type Dia = (typeof DIAS)[number];
export const NOMBRE_DIA: Record<Dia, string> = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo' };
export type Franja = { desde: string; hasta: string };
export type Horarios = Partial<Record<Dia, Franja[]>>;

const hora = (h: string) => {
  const [hh, mm] = h.split(':');
  return mm === '00' ? String(Number(hh)) : `${Number(hh)}:${mm}`;
};
const franjas = (f: Franja[]) => f.map((x) => `de ${hora(x.desde)} a ${hora(x.hasta)}`).join(' y ');

// Días consecutivos con las mismas franjas se juntan: «Lunes a viernes de 9 a 13». Los días cerrados no aparecen.
export function textoDeHorarios(h: Horarios) {
  const grupos: { dias: Dia[]; texto: string }[] = [];
  for (const dia of DIAS) {
    const f = h[dia] ?? [];
    if (!f.length) continue;
    const texto = franjas(f);
    const ultimo = grupos[grupos.length - 1];
    const anterior = DIAS[DIAS.indexOf(dia) - 1];
    if (ultimo && ultimo.texto === texto && ultimo.dias[ultimo.dias.length - 1] === anterior) ultimo.dias.push(dia);
    else grupos.push({ dias: [dia], texto });
  }
  return grupos
    .map((g) => {
      const nombres = g.dias.length === 1 ? NOMBRE_DIA[g.dias[0]] : g.dias.length === 2 ? `${NOMBRE_DIA[g.dias[0]]} y ${NOMBRE_DIA[g.dias[1]].toLowerCase()}` : `${NOMBRE_DIA[g.dias[0]]} a ${NOMBRE_DIA[g.dias[g.dias.length - 1]].toLowerCase()}`;
      return `${nombres} ${g.texto}`;
    })
    .join('; ');
}

// Lee del formulario los horarios de cada día: «abre_lunes» (casilla) y pares «desde_lunes» / «hasta_lunes».
// Las franjas incompletas o al revés se descartan; se devuelven ordenadas y sin repetidos ni superposiciones.
export function horariosDeFormulario(f: FormData): Horarios {
  const h: Horarios = {};
  for (const dia of DIAS) {
    if (f.get(`abre_${dia}`) === null) continue;
    const desde = f.getAll(`desde_${dia}`).map(String);
    const hasta = f.getAll(`hasta_${dia}`).map(String);
    const lista = desde
      .map((d, i) => ({ desde: d, hasta: hasta[i] ?? '' }))
      .filter((x) => /^\d{2}:\d{2}$/.test(x.desde) && /^\d{2}:\d{2}$/.test(x.hasta) && x.desde < x.hasta)
      .sort((a, b) => a.desde.localeCompare(b.desde))
      // Las franjas repetidas o que se pisan se juntan en una.
      .reduce<Franja[]>((acc, x) => {
        const ultima = acc[acc.length - 1];
        if (ultima && x.desde <= ultima.hasta) ultima.hasta = x.hasta > ultima.hasta ? x.hasta : ultima.hasta;
        else acc.push({ ...x });
        return acc;
      }, [])
      .slice(0, 3);
    if (lista.length) h[dia] = lista;
  }
  return h;
}
