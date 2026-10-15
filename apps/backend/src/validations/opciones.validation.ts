import { z } from 'zod';

export const NuevoTalle = z.object({ nombre: z.string().trim().min(1).max(20) });

export const NuevoColor = z.object({
  nombre: z.string().trim().min(1).max(40),
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});
