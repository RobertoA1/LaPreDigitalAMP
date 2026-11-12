// Comprueba que los Heading 1/2 del Manual de Código Fuente coinciden con los de contenido-manual.mjs (módulos A–N y sus opciones).
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const aqui = path.dirname(fileURLToPath(import.meta.url)), raiz = path.resolve(aqui, '..');
const { modulos } = await import(pathToFileURL(path.join(raiz, '_herramientas', 'contenido-manual.mjs')).href + '?t=' + Date.now());
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcf-')), zip = path.join(tmp, 'm.zip');
fs.copyFileSync(path.join(raiz, 'Manual_de_Codigo_Fuente_LaPreDigital_AMP.docx'), zip);
execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${zip}' -DestinationPath '${path.join(tmp, 'x')}' -Force`]);
const xml = fs.readFileSync(path.join(tmp, 'x', 'word', 'document.xml'), 'utf8');
const dec = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const obtenido = [];
for (const m of xml.matchAll(/<w:p[ >](?:(?!<\/w:p>)[\s\S])*?<w:pStyle w:val="(?:Heading|Ttulo)([12])"\/>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g))
  obtenido.push([Number(m[1]), dec([...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x => x[1]).join(''))]);
const esperado = [];
for (const mo of modulos) { esperado.push([1, `${mo.letra}) ${mo.titulo}`]); for (const o of mo.opciones) esperado.push([2, o.titulo]); }
// el cuerpo propio: ESTRUCTURA DEL PROYECTO (+ subsecciones) al inicio y el ANEXO al final
const iniEsp = obtenido.findIndex(x => x[1].startsWith('A) '));
const finEsp = obtenido.findIndex(x => x[1].startsWith('ANEXO'));
const medio = obtenido.slice(iniEsp, finEsp);
const iguales = medio.length === esperado.length && medio.every((x, i) => x[0] === esperado[i][0] && x[1] === esperado[i][1]);
console.log('Encabezados en el documento:', obtenido.length, '| módulos+opciones esperados:', esperado.length, '| comparados:', medio.length);
console.log('Antes de A):', obtenido.slice(0, iniEsp).map(x => x[1]).join(' / '));
console.log('Después de N):', obtenido.slice(finEsp).map(x => x[1]).join(' / '));
console.log(iguales ? 'ÍNDICE IDÉNTICO (mismas letras, títulos y orden)' : 'ÍNDICE DISTINTO');
if (!iguales) for (let i = 0; i < Math.max(medio.length, esperado.length); i++) if (JSON.stringify(medio[i]) !== JSON.stringify(esperado[i])) { console.log(i, medio[i], esperado[i]); break; }
// Figuras: rótulo, pie y archivo de captura contra capturas/indice.json
const idx = JSON.parse(fs.readFileSync(path.join(raiz, 'capturas', 'indice.json'), 'utf8')).capturas;
const txt = [...xml.matchAll(/<w:p[ >](?:(?!</w:p>)[sS])*?</w:p>/g)].map(m => dec([...m[0].matchAll(/<w:t[^>]*>([^<]*)</w:t>/g)].map(x => x[1]).join('')));
const rot = []; txt.forEach((s, i) => { if (/^Figura dd(-[A-Z])?$/.test(s)) rot.push([s, txt[i + 1]]); });
const imgs = [...xml.matchAll(/<pic:cNvPr [^>]*name="([^"]+)"/g)].map(m => m[1]);
let okFig = rot.length === idx.length && imgs.length === idx.length;
idx.forEach((c, i) => { if (!rot[i] || rot[i][0] !== c.figura || rot[i][1] !== c.pie || imgs[i] !== c.archivo.replace(/^capturas//, '')) { okFig = false; console.log('Figura distinta', i, c.figura, rot[i], imgs[i]); } });
console.log(okFig ? `FIGURAS IDÉNTICAS a indice.json (${idx.length}: rótulo, pie y archivo)` : 'FIGURAS DISTINTAS');
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(iguales && okFig ? 0 : 1);
