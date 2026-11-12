import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createCanvas, Path2D, DOMMatrix } from '@napi-rs/canvas';
globalThis.Path2D = Path2D; globalThis.DOMMatrix ??= DOMMatrix;
import pdfjs from 'pdfjs-dist/legacy/build/pdf.js';
const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync('../Memoria_Descriptiva_LaPreDigital_AMP.pdf')), useSystemFonts: true }).promise;
mkdirSync('pags', { recursive: true });
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i); const vp = page.getViewport({ scale: 1.3 });
  const c = createCanvas(vp.width, vp.height); const ctx = c.getContext('2d');
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  writeFileSync(`pags/p${i}.png`, c.toBuffer('image/png'));
}
console.log(pdf.numPages);
