// Secretos del Worker: en local van en .dev.vars y en Cloudflare se cargan con `wrangler secret put`.
// Son opcionales para que el backend arranque sin ellos (sin clave, los emails quedan en cola y no hay cobro online).
interface Env {
  RESEND_API_KEY?: string;
  MP_ACCESS_TOKEN?: string;
  MP_WEBHOOK_SECRET?: string;
}
