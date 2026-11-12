// Genera documentacion/Manual_de_Usuario_LaPreDigital_AMP.docx y documentacion/capturas/indice.json
// Uso: node generar-manual-usuario.mjs   (luego actualizar-indice-word.ps1 para numerar páginas y exportar el PDF)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel, Footer, PageNumber,
  TableOfContents, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak, VerticalAlign
} from 'docx';
import { intro, roles, kpis, modulos } from './contenido-manual.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '..');
const capturas = path.join(raiz, 'capturas');
const FONT = 'Arial';
const CM = 567; // 1 cm en twips

const pngSize = file => { const b = fs.readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), data: b }; };
const run = (text, o = {}) => new TextRun({ text, font: FONT, size: 22, ...o });
const body = text => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 140, line: 276 }, children: [run(text)] });

let figNum = 0;
const indice = [];

function figura(f, modulo, opcion) {
  let num;
  if (f.etiqueta) num = f.etiqueta; else { figNum += 1; num = String(figNum).padStart(2, '0'); }
  const img = pngSize(path.join(capturas, f.archivo));
  const escala = Math.min((15 * 96 / 2.54) / img.w, (15.5 * 96 / 2.54) / img.h, 0.9);
  const width = Math.round(img.w * escala), height = Math.round(img.h * escala);
  return {
    num,
    nodes: [
      new Paragraph({ keepNext: true, alignment: AlignmentType.CENTER, spacing: { before: 120, after: 0 }, children: [run(`Figura ${num}`, { bold: true, italics: true })] }),
      new Paragraph({ keepNext: true, alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [run(f.pie, { italics: true })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new ImageRun({ type: 'png', data: img.data, transformation: { width, height }, altText: { title: `Figura ${num}`, description: f.pie, name: f.archivo } })] })
    ]
  };
}

const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
const borders = { top: border, bottom: border, left: border, right: border };
const cell = (text, w, { head = false, bold = false } = {}) => new TableCell({
  width: { size: w, type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.CENTER,
  margins: { top: 60, bottom: 60, left: 90, right: 90 },
  shading: head ? { type: ShadingType.CLEAR, fill: 'D9E2F3', color: 'auto' } : undefined,
  children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text, font: FONT, size: 18, bold: head || bold })] })]
});
function tabla(anchos, cabecera, filas) {
  const total = anchos.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: anchos,
    rows: [new TableRow({ tableHeader: true, cantSplit: true, children: cabecera.map((t, i) => cell(t, anchos[i], { head: true })) }),
      ...filas.map(f => new TableRow({ cantSplit: true, children: f.map((t, i) => cell(t, anchos[i], { bold: i === 0 })) }))]
  });
}
const h1 = text => new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, children: [new TextRun({ text, font: FONT })] });
const h2 = text => new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [new TextRun({ text, font: FONT })] });
const espacio = () => new Paragraph({ spacing: { after: 120 }, children: [] });

// ---------------- Carátula ----------------
const centro = (text, size, o = {}, after = 200) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after }, children: [new TextRun({ text, font: FONT, size, ...o })] });
const caratula = [
  centro('UNIVERSIDAD NACIONAL DE TRUJILLO', 28, { bold: true }, 120),
  centro('Curso: Inteligencia de Negocios', 24, {}, 1800),
  centro('MANUAL DE USUARIO', 64, { bold: true }, 400),
  centro('LaPreDigital AMP – Plataforma de gestión de agentes', 30, { bold: true }, 80),
  centro('(Agents Management Platform)', 26, {}, 1800),
  centro('Trujillo, 2026', 24, {}, 0)
];

// ---------------- Índice ----------------
const indiceSeccion = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: 'ÍNDICE', font: FONT, size: 28, bold: true })] }),
  new TableOfContents('Índice', { hyperlink: true, headingStyleRange: '1-2' })
];

// ---------------- Cuerpo ----------------
const cuerpo = [];
cuerpo.push(new Paragraph({ children: [new PageBreak()] }));
cuerpo.push(h1(intro.titulo));
for (const o of intro.opciones) {
  cuerpo.push(h2(o.titulo));
  for (const p of o.parrafos) cuerpo.push(body(p));
  if (o.tablaRoles) {
    cuerpo.push(tabla([2400, 6600], ['Rol', 'Qué puede hacer'], roles));
    cuerpo.push(espacio());
  }
}
for (const m of modulos) {
  cuerpo.push(h1(`${m.letra}) ${m.titulo}`));
  if (m.intro) cuerpo.push(body(m.intro));
  for (const o of m.opciones) {
    cuerpo.push(h2(o.titulo));
    for (const p of o.parrafos) cuerpo.push(body(p));
    if (o.tablaKpi) {
      cuerpo.push(tabla([700, 1900, 2800, 1000, 1400, 1200], ['Código', 'KPI', 'Fórmula', 'Rojo', 'Amarillo', 'Verde'], kpis));
      cuerpo.push(espacio());
    }
    for (const f of o.figuras) {
      const fig = figura(f, m, o);
      cuerpo.push(...fig.nodes);
      indice.push({
        figura: `Figura ${fig.num}`, archivo: `capturas/${f.archivo}`, pie: f.pie,
        modulo: `${m.letra}) ${m.titulo}`, opcion: o.titulo, ruta: o.ruta,
        fuente: o.fuente
      });
    }
  }
}

const pie = new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 20 })] })] });
const pagina = { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } };

const doc = new Document({
  creator: 'LaPreDigital AMP', title: 'Manual de Usuario – LaPreDigital AMP',
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, bold: true, color: '000000' }, paragraph: { spacing: { before: 360, after: 160 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 22, bold: true, color: '000000' }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, outlineLevel: 1 } }
    ]
  },
  sections: [
    { properties: { page: pagina, verticalAlign: 'center' }, children: caratula },
    { properties: { page: pagina }, footers: { default: pie }, children: [...indiceSeccion, ...cuerpo] }
  ]
});

const salida = path.join(raiz, 'Manual_de_Usuario_LaPreDigital_AMP.docx');
fs.writeFileSync(salida, await Packer.toBuffer(doc));
fs.writeFileSync(path.join(capturas, 'indice.json'), JSON.stringify({ documento: 'Manual de Usuario y Manual de Código Fuente de LaPreDigital AMP: mismo índice de pantallas', capturas: indice }, null, 2));
console.log('Generado', salida, `(${figNum} figuras)`);

