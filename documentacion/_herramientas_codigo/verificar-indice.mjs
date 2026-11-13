// Comprueba en el .docx del Manual de Código Fuente:
//  1) Heading 1/2 = módulos A–N y opciones de contenido-manual.mjs (mismas letras, títulos y orden);
//  2) figura por figura: rótulo («Figura 09-B»…), pie y archivo de captura = capturas/indice.json.
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
const BS = String.fromCharCode(92);
const reParrafo = new RegExp('<w:p[ >](?:(?!</w:p>)[' + BS + 's' + BS + 'S])*?</w:p>', 'g');
const reTexto = /<w:t[^>]*>([^<]*)<\/w:t>/g;
const reStyle = /<w:pStyle w:val="(?:Heading|Ttulo)([12])"\/>/;
const reRotulo = new RegExp('^Figura ' + BS + 'd' + BS + 'd(-[A-Z])?$');
const parrafos = [...xml.matchAll(reParrafo)].map(m => ({ txt: dec([...m[0].matchAll(reTexto)].map(x => x[1]).join('')), h: (m[0].match(reStyle) || [])[1], img: (m[0].match(/<wp:docPr [^>]*name="([^"]+)"/) || [])[1] }));
const obtenido = parrafos.filter(p => p.h).map(p => [Number(p.h), p.txt]);
const esperado = [];
for (const mo of modulos) { esperado.push([1, `${mo.letra}) ${mo.titulo}`]); for (const o of mo.opciones) esperado.push([2, o.titulo]); }
const iniEsp = obtenido.findIndex(x => x[1].startsWith('A) '));
const finEsp = obtenido.findIndex(x => x[1].startsWith('ANEXO'));
const medio = obtenido.slice(iniEsp, finEsp);
const iguales = medio.length === esperado.length && medio.every((x, i) => x[0] === esperado[i][0] && x[1] === esperado[i][1]);
console.log('Encabezados:', obtenido.length, '| esperados (módulos+opciones):', esperado.length, '| comparados:', medio.length);
console.log('Antes de A):', obtenido.slice(0, iniEsp).map(x => x[1]).join(' / '));
console.log('Después de N):', obtenido.slice(finEsp).map(x => x[1]).join(' / '));
console.log(iguales ? 'ÍNDICE IDÉNTICO (mismas letras, títulos y orden)' : 'ÍNDICE DISTINTO');
if (!iguales) for (let i = 0; i < Math.max(medio.length, esperado.length); i++) if (JSON.stringify(medio[i]) !== JSON.stringify(esperado[i])) { console.log(i, medio[i], esperado[i]); break; }

const idx = JSON.parse(fs.readFileSync(path.join(raiz, 'capturas', 'indice.json'), 'utf8')).capturas;
const rot = []; parrafos.forEach((p, i) => { if (reRotulo.test(p.txt)) rot.push([p.txt, parrafos[i + 1].txt]); });
const imgs = parrafos.filter(p => p.img).map(p => p.img);
let okFig = rot.length === idx.length && imgs.length === idx.length;
if (!okFig) console.log(`Cantidad distinta: rótulos ${rot.length}, imágenes ${imgs.length}, indice.json ${idx.length}`);
idx.forEach((c, i) => {
  if (!rot[i] || rot[i][0] !== c.figura || rot[i][1] !== c.pie || imgs[i] !== c.archivo.replace(/^capturas[\\/]/, '')) { okFig = false; console.log('Figura distinta', i, c.figura, '|', rot[i], '|', imgs[i]); }
});
console.log(okFig ? `FIGURAS IDÉNTICAS a indice.json (${idx.length}: rótulo, pie y archivo)` : 'FIGURAS DISTINTAS');
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(iguales && okFig ? 0 : 1);
