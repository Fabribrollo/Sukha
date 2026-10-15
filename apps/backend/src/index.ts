// Punto de entrada del Worker.
import { app } from './app';
import { EMAILS_POR_TANDA, PEDIDOS_POR_TANDA } from './config';
import { procesarCola } from './services/emails.service';
import { vencerReservas } from './services/estados.service';

export default {
  fetch: app.fetch,

  // Tarea programada (cada 5 minutos, ver wrangler.jsonc): libera reservas vencidas,
  // manda los emails en cola y limpia sesiones del panel que ya vencieron.
  async scheduled(_evento, env) {
    await vencerReservas(env, PEDIDOS_POR_TANDA);
    await procesarCola(env, EMAILS_POR_TANDA);
    await env.DB.prepare("DELETE FROM sesion WHERE vence_en < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").run();
  },
} satisfies ExportedHandler<Env>;
