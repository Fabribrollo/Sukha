import { z } from 'zod';

export const NuevoTalle = z.object({ nombre: z.string().trim().min(1).max(20) });

export const NuevaMarca = z.object({ nombre: z.string().trim().min(1).max(60) });
export const NuevoMaterial = z.object({ nombre: z.string().trim().min(1).max(60) });

export const NuevoColor = z.object({
  nombre: z.string().trim().min(1).max(40),
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export const OrdenOpciones = z.object({ ids: z.array(z.number().int().positive()).min(1).max(200) });
