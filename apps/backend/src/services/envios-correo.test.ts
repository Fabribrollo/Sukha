import { describe, expect, it } from 'vitest';
import { BULTOS_POR_DEFECTO, elegirBulto } from './bultos';
import { cotizarMiCorreo, leerTarifas, micorreoActivo } from './micorreo.service';

describe('bultos', () => {
  it('elige el bulto más chico donde entra el peso, contando 300 g por producto sin peso', () => {
    expect(elegirBulto([{ pesoGramos: 200, cantidad: 2 }], BULTOS_POR_DEFECTO, 300).bulto.nombre).toBe('Chico');
    // 2 × 400 + 1 × 300 (sin peso cargado) = 1100 g
    const r = elegirBulto([{ pesoGramos: 400, cantidad: 2 }, { pesoGramos: null, cantidad: 1 }], BULTOS_POR_DEFECTO, 300);
    expect([r.bulto.nombre, r.gramos]).toEqual(['Mediano', 1100]);
  });
  it('si no entra en ninguno usa el más grande', () => {
    expect(elegirBulto([{ pesoGramos: 9000, cantidad: 1 }], BULTOS_POR_DEFECTO, 300).bulto.nombre).toBe('Grande');
  });
});

describe('MiCorreo', () => {
  it('lee la tarifa más barata de cada modalidad y redondea hacia arriba a pesos', () => {
    const r = leerTarifas({ rates: [{ deliveredType: 'D', price: 7000.4 }, { deliveredType: 'D', price: 9000 }, { deliveredType: 'S', price: 5500 }, { deliveredType: 'X', price: 1 }] });
    expect(r).toEqual({ domicilio: 700100, sucursal: 550000 });
  });

  const config = { cp_origen: '5000' };
  const env = { MICORREO_URL: 'https://api.test', MICORREO_USUARIO: 'u', MICORREO_CLAVE: 'c', MICORREO_CUSTOMER_ID: '1' } as unknown as Env;
  // D1 de mentira con una sola tabla de caché.
  const memoria = new Map<string, string>();
  const d1 = {
    prepare: (sql: string) => ({
      bind: (...args: string[]) => ({
        first: async () => (sql.startsWith('SELECT') && memoria.has(args[0]) ? { valor: memoria.get(args[0]) } : null),
        run: async () => {
          if (sql.startsWith('INSERT')) memoria.set(args[0], args[1]);
          if (sql.startsWith('DELETE')) memoria.delete(args[0]);
        },
      }),
    }),
  } as unknown as D1Database;
  const entrada = { cpDestino: '1000', bulto: BULTOS_POR_DEFECTO[0], pesoGramos: 400 };

  it('sin credenciales no hace nada (se usa la tabla de zonas)', async () => {
    expect(micorreoActivo({} as Env, config)).toBe(false);
    expect(await cotizarMiCorreo({} as Env, d1, config, entrada)).toBeNull();
  });

  it('pide el token una sola vez y lo reutiliza; si la API falla devuelve null', async () => {
    let tokens = 0;
    const llamadas: string[] = [];
    const fetchFalso = (async (url: string) => {
      llamadas.push(url);
      if (url.endsWith('/token')) {
        tokens++;
        return new Response(JSON.stringify({ token: 'T', expire: new Date(Date.now() + 2 * 3600_000).toISOString() }));
      }
      return new Response(JSON.stringify({ rates: [{ deliveredType: 'D', price: 8000 }, { deliveredType: 'S', price: 6000 }] }));
    }) as unknown as typeof fetch;
    expect(await cotizarMiCorreo(env, d1, config, entrada, fetchFalso)).toEqual({ domicilio: 800000, sucursal: 600000 });
    await cotizarMiCorreo(env, d1, config, entrada, fetchFalso);
    expect(tokens).toBe(1);
    expect(llamadas.filter((u) => u.endsWith('/rates'))).toHaveLength(2);

    const caida = (async () => new Response('error', { status: 429 })) as unknown as typeof fetch;
    expect(await cotizarMiCorreo(env, d1, config, entrada, caida)).toBeNull();
  });
});
