import { z } from 'zod';

export const id = z.number().int().positive();
export const centavos = z.number().int().nonnegative();
export const texto = (max: number) => z.string().trim().min(1).max(max);
export const textoOpcional = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
// La base guarda los booleanos como 0/1.
export const booleano = z.boolean().transform((v) => (v ? 1 : 0));
export const fechaIso = z.iso.datetime().transform((v) => new Date(v).toISOString());
export const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'solo minúsculas, números y guiones').max(120);
