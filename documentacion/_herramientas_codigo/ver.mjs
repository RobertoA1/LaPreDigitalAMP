import * as e from './extraer.mjs';
for (const f of process.argv.slice(2)) { console.log('==', f); for (const s of e.listarSimbolos(f)) console.log(` ${s.nombre} ${s.desde}-${s.hasta}`); }
