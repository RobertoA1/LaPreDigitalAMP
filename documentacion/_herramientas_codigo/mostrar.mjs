import { buyersPorOpcion } from './contenido-codigo-buyers.mjs';
import { resolver } from './extraer.mjs';
const [re, sym] = process.argv.slice(2);
for (const o of buyersPorOpcion) if (o.re.test(re)) for (const f of o.fragmentos) if ((f.simbolos || [f.rotulo]).includes(sym)) { const r = await resolver(f); console.log(r.rotulo); console.log(r.lineas.join('\n')); }
