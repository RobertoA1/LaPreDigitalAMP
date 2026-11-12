import { codigo } from './contenido-codigo.mjs';
import { resolver } from './extraer.mjs';
let total = 0;
for (const [k, v] of Object.entries(codigo)) {
  for (const f of v.fragmentos) {
    try { const r = await resolver(f); total += r.lineas.length; console.log(k.slice(0, 7), String(r.lineas.length).padStart(4), r.rotulo, r.avisos.join('|')); }
    catch (e) { console.log('ERR', k, f.archivo, f.simbolos || f.cond, e.message.slice(0, 120)); }
  }
}
console.log('total líneas', total);
