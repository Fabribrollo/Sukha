import { borrarCarritosViejos } from './services/carritos.service';
// Punto de entrada del Worker.
import { app } from './app';
import { EMAILS_POR_TANDA, PEDIDOS_POR_TANDA } from './config';
import { alertar } from './services/alertas.service';
import { procesarCola, revisarAtrasados } from './services/emails.service';
import { vencerReservas } from './services/estados.service';
import { AHORA_SQL } from './utils/http';
import { mensajeDe } from './utils/registro';

export default {
  fetch: app.fetch,

  // Tarea programada (cada 5 minutos, ver wrangler.jsonc): libera reservas vencidas,
  // manda los emails en cola, avisa si hay emails trabados y limpia sesiones del panel y caché que ya vencieron.
  // Cada paso va por separado: si uno falla, se registra, se le avisa a la dueña y los demás corren igual.
  async scheduled(_evento, env) {
    let enviados = 0;
    const pasos: [string, () => Promise<unknown>][] = [
      ['vencer reservas', () => vencerReservas(env, PEDIDOS_POR_TANDA)],
      ['mandar emails', async () => (enviados = await procesarCola(env, EMAILS_POR_TANDA))],
      // Con la tanda llena la cola anda; además, así no se pasa del tope de 50 consultas a D1 por ejecución.
      ['revisar emails atrasados', () => (enviados < EMAILS_POR_TANDA ? revisarAtrasados(env) : Promise.resolve(0))],
      ['borrar sesiones vencidas', () => env.DB.prepare(`DELETE FROM sesion WHERE vence_en < ${AHORA_SQL}`).run()],
      // Lo vencido de la caché externa se guarda 30 días más: las sugerencias de Georef lo usan si Georef no responde.
      ['borrar caché vieja', () => env.DB.prepare("DELETE FROM cache_externa WHERE vence_en < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')").run()],
      ['borrar carritos viejos', () => borrarCarritosViejos(env.DB)],
    ];
    for (const [nombre, paso] of pasos) {
      try {
        await paso();
      } catch (e) {
        console.error(`Tarea programada: falló "${nombre}"`, e);
        await alertar(env, 'tarea', `Falló el paso "${nombre}" de la tarea automática: ${mensajeDe(e)}`);
      }
    }
  },
} satisfies ExportedHandler<Env>;
