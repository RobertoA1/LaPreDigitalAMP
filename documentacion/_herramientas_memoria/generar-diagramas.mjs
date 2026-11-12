// Genera los diagramas de la memoria (SVG -> PNG con Edge headless).
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(aqui, 'img');
mkdirSync(salida, { recursive: true });
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const F = 'font-family="Arial, Helvetica, sans-serif"';
const C = { azul: '#1f4e79', azulc: '#dce9f5', verde: '#2e7d32', verdec: '#e3f1e4', nar: '#b45309', narc: '#fdeedb', gris: '#555', grisc: '#eeeeee', mor: '#6a3d9a', morc: '#ece3f5', rojo: '#a12b2b', rojoc: '#f8e1e1' };

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
// Caja con título (negrita) y líneas de texto centradas.
function caja(x, y, w, h, titulo, lineas, col, fill, fs = 21) {
  const cx = x + w / 2;
  const total = (titulo ? 1 : 0) + lineas.length;
  const lh = fs + 7;
  let ty = y + (h - total * lh) / 2 + fs;
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${col}" stroke-width="2.5"/>`;
  if (titulo) { s += `<text x="${cx}" y="${ty}" ${F} font-size="${fs + 1}" font-weight="bold" fill="${col}" text-anchor="middle">${esc(titulo)}</text>`; ty += lh; }
  for (const l of lineas) { s += `<text x="${cx}" y="${ty}" ${F} font-size="${fs}" fill="#222" text-anchor="middle">${esc(l)}</text>`; ty += lh; }
  return s;
}
function flecha(pts, { dash = false, both = false, col = '#333' } = {}) {
  const d = pts.map(p => p.join(',')).join(' ');
  return `<polyline points="${d}" fill="none" stroke="${col}" stroke-width="2.6" ${dash ? 'stroke-dasharray="9 6"' : ''} marker-end="url(#a)" ${both ? 'marker-start="url(#as)"' : ''}/>`;
}
const etiqueta = (x, y, t, anchor = 'middle', col = '#333') => `<text x="${x}" y="${y}" ${F} font-size="19" fill="${col}" text-anchor="${anchor}" font-style="italic">${esc(t)}</text>`;
const defs = `<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#333"/></marker><marker id="as" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#333"/></marker></defs>`;

// ---------- Figura 1: arquitectura ----------
function figura1() {
  const W = 1200, H = 1120;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${defs}`;
  // Fila superior
  s += caja(40, 30, 250, 100, 'Navegador', ['React 19 (cliente)', 'operador / dirección'], C.azul, C.azulc);
  s += caja(310, 30, 260, 100, 'Sistema del OLTP', ['gestor de LaPreDigitalOLTP', '(plataforma académica)'], C.gris, C.grisc);
  s += caja(640, 30, 250, 100, 'Proveedores de IA', ['OpenAI (por defecto)', 'Gemini · Grok · Anthropic'], C.mor, C.morc);
  s += caja(910, 30, 250, 100, 'Mensajería', ['Evolution API', 'y Gmail API (opcional)'], C.mor, C.morc);
  // Servidor Next.js
  s += `<rect x="40" y="215" width="530" height="235" rx="12" fill="#f4f8fc" stroke="${C.azul}" stroke-width="3"/>`;
  s += `<text x="305" y="248" ${F} font-size="23" font-weight="bold" fill="${C.azul}" text-anchor="middle">Servidor web Next.js 16</text>`;
  s += caja(58, 265, 238, 82, 'API REST /api/…', ['una sola ruta, con sesión'], C.azul, '#fff', 19);
  s += caja(314, 265, 238, 82, 'SSE /api/live', ['avisos de cambios (2,5 s)'], C.azul, '#fff', 19);
  s += caja(58, 358, 494, 74, 'Webhooks: inscripciones y Evolution', ['secreto compartido en cabecera'], C.azul, '#fff', 19);
  // Worker
  s += `<rect x="630" y="215" width="530" height="235" rx="12" fill="#f4faf4" stroke="${C.verde}" stroke-width="3"/>`;
  s += `<text x="895" y="248" ${F} font-size="23" font-weight="bold" fill="${C.verde}" text-anchor="middle">Worker Node (scripts/worker.ts)</text>`;
  s += caja(648, 265, 238, 82, 'Planificador', ['revisión cada 60 s'], C.verde, '#fff', 19);
  s += caja(904, 265, 238, 82, '3 bucles de trabajos', ['concurrentes'], C.verde, '#fff', 19);
  s += caja(648, 358, 494, 74, 'Agentes de IA', ['Radar · etapas · Buyer → Lead'], C.verde, '#fff', 19);
  // Capa de datos
  s += caja(40, 520, 1120, 95, 'Capa de datos (Sequelize 6)', ['msnodesqlv8 (Windows) o tedious (SQL) · a OLTP y DataMart solo SELECT/WITH'], C.nar, C.narc, 20);
  // Bases
  s += caja(40, 690, 380, 190, 'LaPreDigitalAMP', ['propia del AMP (tablas amp_*)', 'amp_jobs: cola de trabajos', 'amp_buyer_runs / _proposals', 'lectura y escritura'], C.rojo, C.rojoc, 20);
  s += caja(450, 690, 330, 190, 'LaPreDigitalDatamart', ['modelo dimensional', 'KPI, tendencias y', 'comparaciones', 'solo lectura'], C.rojo, C.rojoc, 20);
  s += caja(810, 690, 350, 190, 'LaPreDigitalOLTP', ['tiempo real, catálogo,', 'curva de abandono,', 'verificación de inscripciones', 'solo lectura'], C.rojo, C.rojoc, 20);
  // Proceso de carga
  s += caja(480, 960, 680, 80, 'Proceso diario de carga (MERGE)', ['externo al AMP: OLTP → DataMart'], C.gris, C.grisc, 20);

  // Flechas
  s += flecha([[165, 130], [165, 215]], { both: true }); s += etiqueta(178, 178, 'HTTP/JSON y SSE', 'start');
  s += flecha([[440, 130], [440, 215]], { col: C.gris }); s += etiqueta(452, 178, 'webhook', 'start');
  s += flecha([[765, 215], [765, 130]], { both: true });
  s += flecha([[1035, 215], [1035, 130]], { both: true });
  s += flecha([[305, 450], [305, 520]], { both: true });
  s += flecha([[895, 450], [895, 520]], { both: true });
  s += flecha([[230, 615], [230, 690]], { both: true }); s += etiqueta(244, 650, 'lectura/escritura', 'start');
  s += flecha([[615, 615], [615, 690]], { dash: true }); s += etiqueta(629, 650, 'SELECT', 'start');
  s += flecha([[985, 615], [985, 690]], { dash: true }); s += etiqueta(999, 650, 'SELECT', 'start');
  // carga OLTP -> proceso -> DataMart
  s += flecha([[985, 880], [985, 960]], { dash: true, col: C.gris });
  s += flecha([[615, 960], [615, 880]], { col: C.gris });
  // Leyenda
  s += `<line x1="60" y1="1085" x2="130" y2="1085" stroke="#333" stroke-width="2.6" marker-end="url(#a)"/><text x="145" y="1091" ${F} font-size="19" fill="#333">lectura y escritura</text>`;
  s += `<line x1="400" y1="1085" x2="470" y2="1085" stroke="#333" stroke-width="2.6" stroke-dasharray="9 6" marker-end="url(#a)"/><text x="485" y="1091" ${F} font-size="19" fill="#333">solo lectura (SELECT)</text>`;
  s += `</svg>`;
  return { svg: s, W, H };
}

// ---------- Figura 2: flujo del agente Buyer -> Lead ----------
function figura2() {
  const W = 1200, H = 300;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${defs}`;
  const pasos = [
    ['1. Disparo', ['manual, semanal', '(lunes) o', 'alerta de KPI'], C.azul, C.azulc],
    ['2. Cola', ['BUYER_RUN en', 'amp_jobs'], C.nar, C.narc],
    ['3. Contexto', ['KPI (DataMart),', 'tiempo real', '(OLTP), SELECT'], C.rojo, C.rojoc],
    ['4. IA', ['JSON validado', 'con zod'], C.mor, C.morc],
    ['5. Reglas', ['sin precios ni', 'promesas;', 'cita evidencia'], C.verde, C.verdec],
    ['6. Borradores', ['borradores: el', 'operador aprueba,', 'edita o descarta'], C.azul, C.azulc]
  ];
  const w = 168, gap = 30, x0 = 21, y = 60, h = 170;
  pasos.forEach((p, i) => {
    const x = x0 + i * (w + gap);
    s += caja(x, y, w, h, p[0], p[1], p[2], p[3], 18);
    if (i < pasos.length - 1) s += flecha([[x + w, y + h / 2], [x + w + gap, y + h / 2]]);
  });
  s += `<text x="600" y="38" ${F} font-size="21" font-weight="bold" fill="#333" text-anchor="middle">Ejecución del agente de conversión Buyer → Lead (el worker ejecuta los pasos 3 a 6)</text>`;
  s += `<text x="600" y="272" ${F} font-size="19" fill="#333" font-style="italic" text-anchor="middle">Sin llave de IA o ante un fallo, se guardan propuestas de plantilla y se registra el motivo.</text>`;
  return { svg: s + '</svg>', W, H };
}

const figs = { 'figura1-arquitectura': figura1(), 'figura2-flujo-agente': figura2() };
const dims = {};
for (const [nombre, { svg, W, H }] of Object.entries(figs)) {
  const f = join(salida, nombre + '.svg');
  writeFileSync(f, svg);
  const png = join(salida, nombre + '.png');
  execFileSync(EDGE, ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2', `--window-size=${W},${H}`, `--screenshot=${png}`, 'file:///' + resolve(f).replace(/\\/g, '/')], { stdio: 'ignore' });
  dims[nombre] = { W, H };
}
writeFileSync(join(salida, 'dims.json'), JSON.stringify(dims));
console.log('Diagramas generados en', salida);
