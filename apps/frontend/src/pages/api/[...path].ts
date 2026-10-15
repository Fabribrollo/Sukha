import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

// Todo /api/* lo atiende apps/backend.
export const ALL: APIRoute = ({ request }) => env.API.fetch(request);
