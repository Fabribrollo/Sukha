import { describe, expect, it } from 'vitest';
import { PORTADA_POR_DEFECTO, Portada } from './portada.validation';

const una = { id: 'abcd', tipo: 'separador', visible: true } as const;

describe('portada por secciones', () => {
  it('el diseño por defecto es válido', () => {
    expect(Portada.safeParse(PORTADA_POR_DEFECTO).success).toBe(true);
  });
  it('rechaza más de 20 secciones, ids repetidos, tipos desconocidos y slugs raros', () => {
    const muchas = Array.from({ length: 21 }, (_, i) => ({ ...una, id: `s${i}xx` }));
    expect(Portada.safeParse({ version: 1, secciones: muchas }).success).toBe(false);
    expect(Portada.safeParse({ version: 1, secciones: [una, una] }).success).toBe(false);
    expect(Portada.safeParse({ version: 1, secciones: [{ id: 'abcd', tipo: 'html', visible: true }] }).success).toBe(false);
    const fuenteMala = { id: 'abcd', tipo: 'productos', titulo: 'X', fuente: { tipo: 'coleccion', slug: 'https://otro.sitio/x' }, cantidad: 8 };
    expect(Portada.safeParse({ version: 1, secciones: [fuenteMala] }).success).toBe(false);
  });
  it('saca el punto final de los títulos', () => {
    const r = Portada.parse({ version: 1, secciones: [{ id: 'abcd', tipo: 'texto', titulo: 'Hecho a mano.', parrafo: 'Hola.' }] });
    expect(r.secciones[0]).toMatchObject({ titulo: 'Hecho a mano', parrafo: 'Hola.' });
  });
  it('acepta las secciones del diseño y rechaza enlaces a sitios sin https', () => {
    const campana = { id: 'abcd', tipo: 'campana', titulo: 'Invierno', enlace: '/coleccion/invierno', imagen: 'portada/ab12-cd' };
    expect(Portada.parse({ version: 1, secciones: [campana] }).secciones[0]).toMatchObject({ boton: '', etiqueta: '', tono: 'oscuro' });
    expect(Portada.parse({ version: 1, secciones: [{ ...campana, tono: 'claro' }] }).secciones[0]).toMatchObject({ tono: 'claro' });
    expect(Portada.safeParse({ version: 1, secciones: [{ ...campana, tono: 'rojo' }] }).success).toBe(false);
    expect(Portada.safeParse({ version: 1, secciones: [{ ...campana, enlace: 'http://otro.sitio' }] }).success).toBe(false);
    expect(Portada.safeParse({ version: 1, secciones: [{ id: 'abcd', tipo: 'columnas', items: [] }] }).success).toBe(false);
    expect(Portada.safeParse({ version: 1, secciones: [{ id: 'abcd', tipo: 'categorias', titulo: 'X', columnas: 4 }] }).success).toBe(true);
  });
  it('completa los valores que faltan', () => {
    const r = Portada.parse({ version: 1, secciones: [{ id: 'abcd', tipo: 'categorias', titulo: 'Rubros' }] });
    expect(r.secciones[0]).toMatchObject({ visible: true, columnas: 3, conFoto: true, categorias: [] });
  });
});
