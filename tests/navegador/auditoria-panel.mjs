import { abrirNavegador, paginaNueva, ingresarAlPanel, BASE } from './comun.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('.cache/auditoria-panel', {recursive:true});
const b=await abrirNavegador();
try {
 const p=await paginaNueva(b); await ingresarAlPanel(p);
 for(const width of [1280,390]) {
  await p.setViewportSize({width,height:900});
  for(const ruta of ['productos','categorias','colecciones','productos/carga-rapida']) {
   await p.goto(BASE+'/admin/'+ruta); await p.waitForTimeout(600);
   console.log(JSON.stringify({ruta,width,overflow:await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errores:p.errores.splice(0)}));
   await p.screenshot({path:'.cache/auditoria-panel/'+ruta.replaceAll('/','-')+'-'+width+'.png',fullPage:true});
  }
 }
} finally {await b.close()}

