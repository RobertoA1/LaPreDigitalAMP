import { buyersPorOpcion } from './contenido-codigo-buyers.mjs';
import { resolver } from './extraer.mjs';
for (const o of buyersPorOpcion) { console.log('##', o.re); let tot = 0;
  for (const f of o.fragmentos) { try { const r = await resolver(f); tot += r.lineas.length; console.log(String(r.lineas.length).padStart(4), r.rotulo.replace('src/app/api/[...path]/route.ts', 'route.ts'), r.avisos.join('|')); } catch (e) { console.log('ERR', f.archivo, f.simbolos || f.cond, e.message.slice(0, 100)); } }
  console.log('   total', tot); }
