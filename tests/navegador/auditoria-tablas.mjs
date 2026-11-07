// Revisa todas las tablas del panel: el encabezado de cada columna debe alinearse igual que sus celdas (y con el mismo padding).
import { abrirNavegador, paginaNueva, ingresarAlPanel, BASE } from './comun.mjs';
const RUTAS = ['/admin', '/admin/pedidos', '/admin/productos', '/admin/clientas', '/admin/reportes', '/admin/redirecciones', '/admin/envios', '/admin/carritos', '/admin/cupones', '/admin/promociones', '/admin/categorias', '/admin/colecciones', '/admin/opciones', '/admin/solicitudes'];
const b = await abrirNavegador();
const fallas = [];
try {
  const p = await paginaNueva(b, { viewport: { width: 1440, height: 900 } });
  await ingresarAlPanel(p);
  const extra = [];
  const prods = await (await p.request.get(`${BASE}/api/admin/productos`)).json();
  if (prods[0]) extra.push(`/admin/productos/${prods[0].id}`);
  for (const ruta of [...RUTAS, ...extra]) {
    await p.goto(BASE + ruta).catch(() => {});
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('table').forEach((t, ti) => {
        const ths = [...t.querySelectorAll('thead th')];
        const filas = [...t.querySelectorAll('tbody tr')].filter((r) => r.offsetParent && r.children.length === ths.length);
        if (!ths.length || !filas.length || !t.offsetParent) return;
        ths.forEach((th, i) => {
          const sh = getComputedStyle(th);
          const celdas = filas.slice(0, 5).map((f) => f.children[i]);
          const alin = (e) => { const a = getComputedStyle(e).textAlign; return a === 'start' || a === '-webkit-auto' ? 'left' : a === 'end' ? 'right' : a; };
          const tdA = [...new Set(celdas.map(alin))];
          const rth = th.getBoundingClientRect(), rtd = celdas[0].getBoundingClientRect();
          const pl = (e) => parseFloat(getComputedStyle(e).paddingLeft), pr = (e) => parseFloat(getComputedStyle(e).paddingRight);
          const problemas = [];
          if (tdA.length === 1 && alin(th) !== tdA[0] && th.textContent.trim()) problemas.push(`texto th=${alin(th)} td=${tdA[0]}`);
          if (Math.abs(pl(th) - pl(celdas[0])) > 0.5 || Math.abs(pr(th) - pr(celdas[0])) > 0.5) problemas.push(`padding th=${pl(th)}/${pr(th)} td=${pl(celdas[0])}/${pr(celdas[0])}`);
          if (Math.abs(rth.left - rtd.left) > 1 || Math.abs(rth.right - rtd.right) > 1) problemas.push(`caja th=${Math.round(rth.left)}-${Math.round(rth.right)} td=${Math.round(rtd.left)}-${Math.round(rtd.right)}`);
          if (problemas.length) out.push(`tabla ${ti} col ${i} «${th.textContent.trim().slice(0, 20)}»: ${problemas.join('; ')}`);
        });
      });
      return out;
    });
    for (const f of r) fallas.push(`${ruta} → ${f}`);
  }
} finally { await b.close(); }
console.log(fallas.length ? fallas.join('\n') : 'OK: todas las tablas alineadas');
process.exitCode = fallas.length ? 1 : 0;
