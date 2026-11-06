// Prueba de los tramos de peso de envío contra el backend local (wrangler dev en :8787) con un admin local de prueba.
// Uso: node scripts/e2e-escalones.mjs <archivo-con-la-clave-del-admin> <varianteId con stock >= 11> <productoId de esa variante>
// Toca datos locales: pone peso 1000 g al producto y tramos de precio a la zona «Córdoba».
import { readFileSync } from 'node:fs';
const clave = readFileSync(process.argv[2], 'utf8').trim();
const base = 'http://localhost:8787';
let cookie = '';
const api = async (metodo, ruta, cuerpo) => {
  const r = await fetch(base + '/api' + ruta, { method: metodo, headers: { 'content-type': 'application/json', origin: base, cookie }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return { s: r.status, j: await r.json().catch(() => null) };
};
for (let i = 0; i < 30; i++) { try { await fetch(base + '/api/tienda'); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
const login = await api('POST', '/admin/login', { email: 'e2e@sukha.test', contrasena: clave });
if (login.s !== 200) throw new Error('login ' + login.s);

const variante = Number(process.argv[3]);
const productoId = Number(process.argv[4]);
const zonas = (await api('GET', '/admin/zonas')).j;
const zona = zonas.find((z) => z.nombre === 'Córdoba');
console.log('zona', zona.nombre, zona.precioCentavos, 'rangos', zona.rangos.map((r) => `${r.cpDesde}-${r.cpHasta}`).join(','));
const cp = String(zona.rangos[0].cpDesde);

const patch = await api('PATCH', `/admin/zonas/${zona.id}`, { escalones: [{ hastaGramos: 3000, precioCentavos: 1000000 }, { hastaGramos: 5000, precioCentavos: 1500000 }, { hastaGramos: 10000, precioCentavos: 2500000 }] });
console.log('patch zona', patch.s);
console.log('zona con tramos', (await api('GET', '/admin/zonas')).j.find((z) => z.id === zona.id).escalones.map((e) => `${e.hastaGramos}:${e.precioCentavos}`).join(' '));
await api('PATCH', `/admin/productos/${productoId}`, { pesoGramos: 1000 });

const cotizar = async (cantidad) => {
  const r = await api('POST', '/envios/cotizar', { codigoPostal: cp, items: [{ varianteId: variante, cantidad }] });
  const o = r.j.opciones.find((x) => x.zonaEnvioId === zona.id);
  return `${cantidad} u → ${r.j.pesoGramos} g, excede=${r.j.excedePeso}, precio ${o ? o.precioCentavos : '—'}, opciones ${r.j.opciones.length}`;
};
for (const c of [1, 3, 5, 10, 11]) console.log(await cotizar(c));
const validar = await api('POST', '/carrito/validar', { items: [{ varianteId: variante, cantidad: 11 }], zonaEnvioId: zona.id, codigoPostal: cp, metodoPago: 'transferencia' });
console.log('validar 11 kg con envío →', validar.s, validar.j?.error ?? '');
const retiro = await api('POST', '/carrito/validar', { items: [{ varianteId: variante, cantidad: 11 }], metodoPago: 'transferencia' });
console.log('validar 11 kg sin envío (retiro) →', retiro.s, 'excedePeso', retiro.j?.excedePeso);
const sin = await api('POST', '/envios/cotizar', { codigoPostal: cp });
console.log('sin items →', sin.j.pesoGramos, sin.j.opciones.find((x) => x.zonaEnvioId === zona.id)?.precioCentavos);
