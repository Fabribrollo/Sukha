import { describe, expect, it } from 'vitest';
import { aTitulo, buscarCalles, buscarLocalidades } from './georef.service';

const responder = (cuerpo: unknown, estado = 200) => (async () => new Response(JSON.stringify(cuerpo), { status: estado })) as unknown as typeof fetch;

describe('Georef', () => {
  it('pasa los nombres en mayúsculas a título', () => {
    expect(aTitulo('SAN MARTIN')).toBe('San Martin');
    expect(aTitulo('JUAN BAUTISTA ALBERDI')).toBe('Juan Bautista Alberdi');
    expect(aTitulo('AVENIDA DEL LIBERTADOR')).toBe('Avenida del Libertador');
  });

  it('localidades: junta los duplicados y se queda con el id censal', async () => {
    const f = responder({
      localidades: [
        { id: '6204240002', nombre: 'Cipolletti', departamento_nombre: 'General Roca' },
        { id: '62042400', nombre: 'Cipolletti', departamento_nombre: 'General Roca', localidad_censal_id: '62042400' },
      ],
    });
    expect(await buscarLocalidades('Río Negro', 'cipol', f)).toEqual([{ nombre: 'Cipolletti', detalle: 'General Roca', censalId: '62042400' }]);
  });

  it('calles: sin repetidos y en título', async () => {
    const f = responder({ calles: [{ nombre: 'SAN MARTIN' }, { nombre: 'SAN MARTIN' }, { nombre: 'LAGO SAN MARTIN' }] });
    expect((await buscarCalles('Neuquén', 'san martin', '58035070', f))!.map((c) => c.nombre)).toEqual(['San Martin', 'Lago San Martin']);
  });

  it('no consulta con una provincia inventada ni con menos de 3 letras, y si Georef falla devuelve null', async () => {
    let llamadas = 0;
    const contador = (async () => (llamadas++, new Response('{}'))) as unknown as typeof fetch;
    expect(await buscarLocalidades('Narnia', 'cipolletti', contador)).toEqual([]);
    expect(await buscarCalles('Neuquén', 'sa', null, contador)).toEqual([]);
    expect(llamadas).toBe(0);
    expect(await buscarLocalidades('Neuquén', 'neuquen', responder({}, 500))).toBeNull(); // Georef caído: distinto de «sin resultados»
    expect(await buscarLocalidades('Neuquén', 'zzzz', responder({ localidades: [] }))).toEqual([]);
    expect(await buscarCalles('Neuquén', 'alberdi', null, (async () => { throw new Error('sin red'); }) as unknown as typeof fetch)).toBeNull();
  });
});
