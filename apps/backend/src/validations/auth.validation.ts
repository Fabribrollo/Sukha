import { z } from 'zod';

export const Credenciales = z.object({
  email: z.string().trim().toLowerCase().email(),
  contrasena: z.string().min(1).max(200),
});
