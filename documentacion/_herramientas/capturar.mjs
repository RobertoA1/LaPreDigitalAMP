// Captura las pantallas del AMP (solo lectura: no guarda, no aprueba, no envía).
// Uso: node capturar.mjs  (la app debe estar en http://127.0.0.1:3000)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(aqui, '..', 'capturas');
const BASE = 'http://127.0.0.1:3000';
const EMAIL = process.env.AMP_EMAIL || 'verificador@lapredigital.local';
const PASS = fs.readFileSync(process.env.AMP_PASS_FILE, 'utf8').split(/\r?\n/)[0].trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const W = 1366, H = 850;

const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, defaultViewport: { width: W, height: H, deviceScaleFactor: 1 }, args: ['--hide-scrollbars', '--lang=es-PE'] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

async function listo(extra = 1500) {
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const cargando = await page.evaluate(() => /Cargando|Analizando conversaciones|Consultando/.test(document.body.innerText));
    if (!cargando) break;
    await sleep(400);
  }
  await sleep(extra);
}
async function ir(ruta, extra) { await page.goto(BASE + ruta, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }); await page.waitForSelector('.content, .login-page', { timeout: 60000 }); await listo(extra); }
async function fill(sel, text) { await page.focus(sel); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace'); await page.type(sel, text); }
const file = n => path.join(out, n + '.png');
async function elem(selector, name) { const h = await page.$(selector); if (!h) throw new Error('No existe ' + selector); await h.screenshot({ path: file(name) }); console.log('ok', name); }
async function porTitulo(texto, name, tag = 'section') {
  const h = await page.evaluateHandle((t, tag) => [...document.querySelectorAll(tag)].find(s => s.querySelector('h3,h2,h4')?.textContent.includes(t)), texto, tag);
  const el = h.asElement(); if (!el) throw new Error('Sin sección ' + texto); await el.screenshot({ path: file(name) }); console.log('ok', name);
}
// Captura el rango vertical entre dos elementos (ampliando la ventana para no depender del scroll).
async function rango(elTop, elBottom, name, margen = 6) {
  const r = await page.evaluate((a, b) => {
    const A = document.querySelector(a), B = typeof b === 'string' ? document.querySelector(b) : b;
    const ra = A.getBoundingClientRect(), rb = B.getBoundingClientRect();
    return { top: ra.top + scrollY, left: Math.min(ra.left, rb.left) + scrollX, bottom: rb.bottom + scrollY, right: Math.max(ra.right, rb.right) + scrollX };
  }, elTop, elBottom);
  await page.setViewport({ width: W, height: Math.max(H, Math.ceil(r.bottom) + 40), deviceScaleFactor: 1 }); await sleep(900);
  const r2 = await page.evaluate((a, b) => {
    const A = document.querySelector(a), B = document.querySelector(b);
    const ra = A.getBoundingClientRect(), rb = B.getBoundingClientRect();
    return { top: ra.top + scrollY, left: Math.min(ra.left, rb.left) + scrollX, bottom: rb.bottom + scrollY, right: Math.max(ra.right, rb.right) + scrollX };
  }, elTop, elBottom);
  await page.screenshot({ path: file(name), clip: { x: Math.max(0, r2.left - margen), y: Math.max(0, r2.top - margen), width: r2.right - r2.left + 2 * margen, height: r2.bottom - r2.top + 2 * margen } });
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 }); await sleep(300); console.log('ok', name);
}
async function contenido(name, maxH = 1250) {
  const alto = await page.evaluate(() => document.querySelector('.content').scrollHeight);
  await page.setViewport({ width: W, height: Math.max(H, alto + 10), deviceScaleFactor: 1 }); await sleep(900);
  const r = await page.evaluate(() => { const b = document.querySelector('.content').getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; });
  await page.screenshot({ path: file(name), clip: { x: r.x, y: r.y, width: r.w, height: Math.min(r.h, maxH) } }); console.log('ok', name);
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 }); await sleep(300);
}
const clickTexto = async (texto, scope = 'button') => { const ok = await page.evaluate((t, s) => { const b = [...document.querySelectorAll(s)].find(x => x.textContent.trim().includes(t)); if (b) { b.click(); return true; } return false; }, texto, scope); if (!ok) throw new Error('Sin botón ' + texto); };

// ---- A) Login ----
await ir('/login', 3500);
await page.screenshot({ path: file('01-login') }); console.log('ok 01-login');
await fill('input[type=email]', EMAIL);
await fill('input[type=password]', 'clave-incorrecta');
await page.click('button.primary'); await page.waitForSelector('.error', { timeout: 15000 }); await sleep(400);
await page.screenshot({ path: file('02-login-error') }); console.log('ok 02-login-error');
await fill('input[type=password]', PASS);
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }), page.click('button.primary')]);
await page.waitForSelector('.sidebar', { timeout: 60000 }); await listo(2500);

// ---- Dashboard + navegación ----
await elem('.sidebar', '03a-menu-lateral');
await elem('.topbar', '03b-encabezado');
await contenido('04-dashboard', 1040);
await porTitulo('Actividad reciente', '04b-dashboard-actividad');

// ---- Radar ----
await ir('/radar'); await contenido('05-radar');

// ---- Buyers (diseño v2: barra del agente + pestañas) ----
const marca = (texto, id) => page.evaluate((t, i) => { const h = [...document.querySelectorAll('.bp h3')].find(e => e.textContent.trim() === t); if (!h) throw new Error('Sin sección ' + t); h.closest('section').id = i; }, texto, id);
const clic = (js) => page.evaluate(js);
await ir('/buyers', 6000);
await rango('.bp-agentbar', '.bp-tabs', '06a-buyers-barra-agente');
await rango('.bp-filters', '.bp-kpis', '06b-buyers-resumen');

await ir('/buyers/analisis', 6000);
await marca('Lectura del periodo', 'sec-lectura');
await rango('#sec-lectura', '.bp > .bp-grid-2', '06c-buyers-analisis-lectura');
await marca('Por canal', 'sec-canal'); await marca('Por video', 'sec-video');
await rango('#sec-canal', '#sec-video', '06d-buyers-analisis-desgloses');

await ir('/buyers/agente', 6000);
await marca('Actividades', 'sec-act'); await marca('Hoy en tiempo real', 'sec-hoy'); await marca('Ejecución en curso', 'sec-curso'); await marca('Lanzar una ejecución', 'sec-lanzar'); await marca('Ejecuciones recientes', 'sec-hist');
await rango('#sec-act', '#sec-hoy', '06e-buyers-agente-tiempo-real');
await rango('#sec-curso', '#sec-lanzar', '06f-buyers-agente-ejecucion-vivo');
await clic(() => { const li = document.querySelector('#sec-hist .bp-runs > li'); li.id = 'run-1'; const d = li.querySelector('details'); if (d) d.open = true; });
await sleep(600);
await rango('#sec-hist', '#run-1', '06g-buyers-agente-historial');

await ir('/buyers/propuestas', 6000);
await clic(() => { const s = [...document.querySelectorAll('.bp h3')].find(e => e.textContent.trim() === 'Propuestas del agente').closest('section'); s.id = 'sec-prop'; s.querySelectorAll('.bp-proposal').forEach((x, i) => x.id = 'prop-' + (i + 1)); });
await rango('#sec-prop', '#prop-2', '06h-buyers-propuestas');
await clic(() => { [...document.querySelectorAll('#prop-1 button')].find(x => x.textContent.includes('Editar y aprobar')).click(); }); await sleep(700);
await rango('#prop-1', '#prop-1', '06i-buyers-editar-propuesta');
await clic(() => { [...document.querySelectorAll('#prop-2 button')].find(x => x.textContent.includes('Descartar')).click(); }); await sleep(700);
await page.type('#prop-2 .bp-editor input', 'Motivo de ejemplo: el mensaje no encaja con la campaña vigente'); await sleep(300);
await rango('#prop-2', '#prop-2', '06j-buyers-descartar-propuesta');

await ir('/buyers/reglas', 6000);
for (const [t, i] of [['Semáforos', 'sec-sem'], ['Medición', 'sec-med'], ['Contenido', 'sec-con'], ['Cobertura', 'sec-cob'], ['Automatización', 'sec-aut'], ['Aprobación', 'sec-apr'], ['Alertas', 'sec-alr'], ['Directrices', 'sec-dir']]) await marca(t, i);
await elem('.bp-rules-head', '06k-buyers-reglas-cabecera');
await clic(() => { [...document.querySelectorAll('#regla-SEM_B-1\\.2 button')].find(x => x.textContent.includes('Editar')).click(); }); await sleep(800);
await rango('#sec-sem', '#sec-sem', '06l-buyers-reglas-semaforos');
await ir('/buyers/reglas', 6000);
for (const [t, i] of [['Contenido', 'sec-con'], ['Cobertura', 'sec-cob'], ['Automatización', 'sec-aut'], ['Aprobación', 'sec-apr'], ['Medición', 'sec-med'], ['Alertas', 'sec-alr'], ['Directrices', 'sec-dir']]) await marca(t, i);
await rango('#sec-con', '#sec-cob', '06m-buyers-reglas-contenido-cobertura');
await clic(() => { [...document.querySelectorAll('#regla-CON_PROHIBIDOS button')].find(x => x.textContent.includes('Editar')).click(); }); await sleep(800);
await rango('#regla-CON_PROHIBIDOS', '#regla-CON_PROHIBIDOS', '06n-buyers-reglas-editor-prohibidos');
await ir('/buyers/reglas', 6000);
for (const [t, i] of [['Automatización', 'sec-aut'], ['Aprobación', 'sec-apr'], ['Medición', 'sec-med'], ['Alertas', 'sec-alr'], ['Directrices', 'sec-dir']]) await marca(t, i);
await rango('#sec-aut', '#sec-dir', '06o-buyers-reglas-automatizacion-alertas');
await clic(() => { [...document.querySelectorAll('#sec-alr button')].find(x => x.textContent.includes('Nueva alerta')).click(); }); await sleep(800);
await rango('#sec-alr', '#sec-alr', '06p-buyers-reglas-nueva-alerta');
await ir('/buyers/reglas', 6000);
for (const [t, i] of [['Medición', 'sec-med'], ['Aprobación', 'sec-apr']]) await marca(t, i);
await elem('#sec-med', '06q-buyers-reglas-bloqueadas');
await elem('#sec-apr', '06r-buyers-reglas-aprobacion');

await ir('/buyers/perfiles', 8000);
await clic(() => { const s = [...document.querySelectorAll('.bp h3')].find(e => e.textContent.trim() === 'Perfiles').closest('section'); s.id = 'sec-perf'; const r = s.querySelector('tbody tr:nth-child(8)'); r.id = 'fila-8'; });
await rango('#sec-perf', '#fila-8', '06s-buyers-perfiles-listado');
await page.setViewport({ width: W, height: 1250, deviceScaleFactor: 1 });
await clic(() => { document.querySelector('#sec-perf tbody tr .bp-namebtn').click(); });
await page.waitForSelector('dialog.bp-drawer[open]', { timeout: 30000 }); await sleep(500); await listo(4000);
await page.screenshot({ path: file('06t-buyers-perfiles-detalle') }); console.log('ok 06t-buyers-perfiles-detalle');
await page.keyboard.press('Escape'); await sleep(500);
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

// ---- Etapas ----
for (const [r, n] of [['/leads', '07-leads'], ['/payers', '08-payers'], ['/customers', '09-customers'], ['/turned', '10-turned']]) { await ir(r, 2500); await contenido(n); }

// ---- Perfil del contacto ----
await ir('/contact/1', 3000);
await rango('.back-link', '.profile-panel', '11a-perfil-datos');
await elem('.chat-panel', '11b-perfil-conversacion');
await page.evaluate(() => { [...document.querySelectorAll('.detail-side section')].forEach((p, i) => p.setAttribute('id', 'side-' + i)); });
await rango('#side-2', '#side-3', '11c-perfil-correccion-revision');
await ir('/contact/7', 3000);
const lc = await page.evaluateHandle(() => [...document.querySelectorAll('section.panel')].find(s => s.textContent.includes('AGENTE DE FIDELIZACIÓN')));
if (lc.asElement()) { await lc.asElement().screenshot({ path: file('11d-perfil-ciclo-customer') }); console.log('ok 11d'); } else console.log('SIN panel ciclo customer');
const wk = await page.evaluateHandle(() => [...document.querySelectorAll('section.panel')].find(s => s.textContent.includes('SEGUIMIENTO ACADÉMICO')));
if (wk.asElement()) { await wk.asElement().screenshot({ path: file('11e-perfil-reportes-semanales') }); console.log('ok 11e'); }
await ir('/contact/10', 3000);
const lt = await page.evaluateHandle(() => [...document.querySelectorAll('section.panel')].find(s => s.textContent.includes('AGENTE DE REACTIVACIÓN')));
if (lt.asElement()) { await lt.asElement().screenshot({ path: file('11f-perfil-ciclo-turned') }); console.log('ok 11f'); } else console.log('SIN panel ciclo turned');
await ir('/contact/1', 2500);
const hs = await page.evaluateHandle(() => [...document.querySelectorAll('section.panel')].find(s => s.querySelector('h3')?.textContent.includes('Historial de acciones')));
if (hs.asElement()) { await hs.asElement().screenshot({ path: file('11g-perfil-historial') }); console.log('ok 11g'); }

// ---- Resto ----
await ir('/approvals', 2500); await contenido('12-aprobaciones');
await ir('/campaigns', 2500); await contenido('13-campanas');
await ir('/exams', 2500); await contenido('14-examenes');
await ir('/jobs', 2500); await contenido('15-trabajos');
await ir('/settings', 2500); await contenido('16-configuracion');
const secs = await page.$('.two-col > section');
await secs[0].screenshot({ path: file('16a-configuracion-proveedor-ia') });
await secs[1].screenshot({ path: file('16b-configuracion-conexiones-seguimiento') });

// ---- Cierre de sesión ----
await clickTexto('Cerrar sesión');
await page.waitForSelector('.login-page', { timeout: 30000 }); await sleep(800);
await page.screenshot({ path: file('17-sesion-cerrada') }); console.log('ok 17');
await browser.close();
