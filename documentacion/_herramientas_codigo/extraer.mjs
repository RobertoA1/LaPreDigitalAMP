// Extracción literal de fragmentos de código desde el repositorio (por nombre de símbolo o rama de ruta de API)
// y formateo de saltos de línea con prettier (sin cambiar tokens).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as prettier from 'prettier';

const require = createRequire(import.meta.url);
const ts = require('typescript');

import { fileURLToPath } from 'node:url';
export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cacheAst = new Map();

export function leer(rel) {
  const abs = path.join(RAIZ, rel);
  if (!cacheAst.has(rel)) {
    const texto = fs.readFileSync(abs, 'utf8').replace(/^﻿/, '');
    const sf = ts.createSourceFile(rel, texto, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    cacheAst.set(rel, { texto, sf });
  }
  return cacheAst.get(rel);
}

const nombresDe = (n) => {
  if (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) return n.name ? [n.name.text] : ['default'];
  if (ts.isVariableStatement(n)) return n.declarationList.declarations.map((d) => d.name.getText());
  return [];
};

/** Lista los símbolos de primer nivel de un archivo (para inspección). */
export function listarSimbolos(rel) {
  const { sf } = leer(rel);
  const out = [];
  sf.forEachChild((n) => {
    for (const nombre of nombresDe(n)) {
      const a = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
      const b = sf.getLineAndCharacterOfPosition(n.getEnd()).line + 1;
      out.push({ nombre, desde: a, hasta: b });
    }
  });
  return out;
}

/** Texto literal (con el comentario JSDoc previo si existe) de una declaración de primer nivel. */
export function simbolo(rel, nombre) {
  const { texto, sf } = leer(rel);
  let hallado = null;
  sf.forEachChild((n) => {
    if (!hallado && nombresDe(n).includes(nombre)) hallado = n;
  });
  if (!hallado) throw new Error(`Símbolo no encontrado: ${rel} :: ${nombre}`);
  const ini = hallado.jsDoc?.length ? hallado.jsDoc[0].getStart() : hallado.getStart();
  return texto.slice(ini, hallado.getEnd());
}

/** Rama `if (path === 'x') ...` dentro de GET/POST de la ruta de API (`rama` = subcadena de la condición). */
export function rama(rel, funcion, condicion) {
  const { texto, sf } = leer(rel);
  let fn = null;
  sf.forEachChild((n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === funcion) fn = n;
  });
  if (!fn) throw new Error(`Función no encontrada: ${funcion}`);
  let hallado = null;
  const visita = (n) => {
    if (hallado) return;
    if (ts.isIfStatement(n) && n.expression.getText() === condicion) { hallado = n; return; }
    ts.forEachChild(n, visita);
  };
  visita(fn);
  if (!hallado) throw new Error(`Rama no encontrada: ${rel} :: ${funcion} :: ${condicion}`);
  const ini = hallado.jsDoc?.length ? hallado.jsDoc[0].getStart() : hallado.getStart();
  return texto.slice(ini, hallado.getEnd());
}

/** Cuerpo del archivo entre dos subcadenas de línea (inclusive), literal. */
export function tramoArchivo(rel, desde, hasta) {
  const { texto } = leer(rel);
  const i = texto.indexOf(desde);
  if (i < 0) throw new Error(`Marcador de inicio no encontrado: ${rel} :: ${desde}`);
  const j = texto.indexOf(hasta, i);
  if (j < 0) throw new Error(`Marcador de fin no encontrado: ${rel} :: ${hasta}`);
  const ini = texto.lastIndexOf('\n', i) + 1;
  let fin = texto.indexOf('\n', j + hasta.length);
  if (fin < 0) fin = texto.length;
  return texto.slice(ini, fin);
}

const ANCHO = 98;
export async function formatear(codigo) {
  // los fragmentos se formatean como TSX: admite JSX, tipos y sentencias sueltas (return, if) envolviéndolas si hace falta
  const opciones = { parser: 'typescript', printWidth: ANCHO, singleQuote: true, trailingComma: 'none', tabWidth: 2 };
  try {
    return (await prettier.format(codigo, opciones)).replace(/\s+$/, '');
  } catch {
    try {
      return (await prettier.format(codigo, { ...opciones, parser: 'babel-ts' })).replace(/\s+$/, '');
    } catch {
      // sentencia suelta con `return`/`await` fuera de función: se envuelve y se desenvuelve
      const envuelto = `async function __w__() {\n${codigo}\n}`;
      const f = (await prettier.format(envuelto, opciones)).replace(/\s+$/, '').split('\n');
      return f.slice(1, -1).map((l) => (l.startsWith('  ') ? l.slice(2) : l)).join('\n');
    }
  }
}

const sinForma = (s) => s
  .replace(/\{\s*(?:'\s*'|"\s*")\s*\}/g, '') // {' '} que prettier añade en JSX
  .replace(/[\s;,'"`()]/g, '').replace(/\\/g, '');
/** Comprueba que el formateo no cambió tokens (ignora espacios, comas finales, ;, comillas y paréntesis). */
export function mismosTokens(original, formateado) {
  return sinForma(original) === sinForma(formateado);
}

/** Aplica recortes sobre líneas ya formateadas: `omitir` = [[desde, hasta]] reemplaza lo que hay entre ambas líneas por `// …`. */
export function recortar(lineas, { omitir = [], desde, hasta, soloDesdeHasta } = {}) {
  let l = lineas.slice();
  if (desde) {
    const i = l.findIndex((x) => x.includes(desde));
    if (i < 0) throw new Error(`desde no encontrado: ${desde}`);
    const j = hasta ? l.findIndex((x, k) => k >= i && x.includes(hasta)) : l.length - 1;
    if (hasta && j < 0) throw new Error(`hasta no encontrado: ${hasta}`);
    const sangria = (x) => x.match(/^\s*/)[0];
    const pre = i > 0 ? [sangria(l[i]) + '// …'] : [];
    const post = j < l.length - 1 ? [sangria(l[j]) + '// …'] : [];
    l = [...pre, ...l.slice(i, j + 1), ...post];
  }
  for (const [d, h] of omitir) {
    const i = l.findIndex((x) => x.includes(d));
    if (i < 0) throw new Error(`omitir.desde no encontrado: ${d}`);
    const j = l.findIndex((x, k) => k > i && x.includes(h));
    if (j < 0) throw new Error(`omitir.hasta no encontrado: ${h}`);
    if (j - i > 1) l = [...l.slice(0, i + 1), l[i + 1].match(/^\s*/)[0] + '// …', ...l.slice(j)];
  }
  return l;
}

export function archivoCompleto(rel) {
  return leer(rel).texto.replace(/\r\n/g, '\n').trim();
}

/** Resuelve un fragmento de contenido-codigo.mjs: devuelve { rotulo, archivo, lineas, avisos }. */
export async function resolver(f) {
  const avisos = [];
  const nombreRama = (cond) => {
    const m = cond.match(/'([^']+)'/);
    return cond.includes('startsWith') ? `GET /api/${m[1]}*` : `${'/api/' + m[1]}`;
  };
  let partes = [];
  let rotulo;
  const base = f.archivo;
  if (f.tipo === 'simbolo') {
    for (const nombre of f.simbolos) partes.push(simbolo(base, nombre));
    rotulo = `${base} — ${f.simbolos.join(', ')}`;
  } else if (f.tipo === 'rama') {
    partes.push(rama(base, f.fn, f.cond));
    rotulo = f.rotulo ? `${base} — ${f.rotulo}` : `${base} — ${f.cond.includes("startsWith") ? "" : f.fn + " "}${nombreRama(f.cond)}`;
  } else if (f.tipo === 'archivo') {
    partes.push(archivoCompleto(base));
    rotulo = `${base} — archivo completo`;
  }
  const bloques = [];
  for (const p of partes) {
    const original = p.replace(/\r\n/g, '\n');
    const fmt = await formatear(original);
    if (!mismosTokens(original, fmt)) avisos.push(`tokens distintos tras formatear en ${rotulo}`);
    bloques.push(fmt.split('\n'));
  }
  let lineas = [];
  bloques.forEach((b, i) => { if (i) lineas.push(''); lineas.push(...b); });
  if (f.desde || f.omitir) {
    lineas = recortar(lineas, { desde: f.desde, hasta: f.hasta, omitir: f.omitir || [] });
    if (f.desde) rotulo += ' (fragmento)';
  }
  const MAXL = f.max ?? 70;
  if (lineas.length > MAXL) {
    const sang = (lineas[MAXL] || '').match(/^s*/)[0];
    lineas = [...lineas.slice(0, MAXL), sang + '// …'];
    if (!rotulo.includes('(')) rotulo += ' (fragmento)';
  }
  if (f.tipo === 'simbolo' && f.simbolos.length === 1 && (f.omitir || f.desde) && !f.desde) rotulo += ' (abreviado)';
  return { rotulo, archivo: base, lineas, avisos, nota: f.nota };
}
