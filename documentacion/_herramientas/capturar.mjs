// Captura las pantallas del AMP (solo lectura: no guarda, no aprueba, no envía).
// Uso: node capturar.mjs  (la app debe estar en http://127.0.0.1:3000)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(aqui, '..', 'capturas');
const BASE = 'http://127.0.0.1:3000';
const EMAIL = 'verificador@lapredigital.local';
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

// ---- Buyers ----
await ir('/buyers', 4000);
await rango('.bp-filters', '.bp-kpi-groups', '06a-buyers-filtros-kpi');
await elem('.bp-grid-2', '06b-buyers-tendencia-abandono');
await elem('.bp-tables', '06c-buyers-desgloses');
await porTitulo('Hoy en tiempo real', '06d-buyers-tiempo-real');
// Agente: parte superior (indicaciones, botones y encabezado de ejecuciones)
await page.evaluate(() => { [...document.querySelectorAll('.bp-section')].find(s => s.querySelector('h3')?.textContent.includes('Agente de conversión'))?.setAttribute('id', 'sec-agente'); });
await page.evaluate(() => { const s = document.getElementById('sec-agente'); s.querySelector('h4').setAttribute('id', 'agente-h4'); const lis = s.querySelectorAll('.bp-runs > li'); if (lis[0]) lis[0].setAttribute('id', 'run-1'); if (lis[1]) lis[1].setAttribute('id', 'run-2'); });
const hayRuns = await page.$('#run-1');
if (hayRuns) {
  await rango('#sec-agente', '#run-1', '06e-buyers-agente');
  // despliega el análisis de la primera ejecución
  await page.evaluate(() => { const d = document.querySelector('#run-1 details'); if (d) d.open = true; }); await sleep(500);
  await rango('#agente-h4', '#run-2' , '06f-buyers-ejecucion-analisis');
}
// Bandeja de propuestas
await page.evaluate(() => { const s = [...document.querySelectorAll('.bp-section')].find(x => x.querySelector('h3')?.textContent.includes('Propuestas del agente')); s.setAttribute('id', 'sec-prop'); const a = s.querySelectorAll('.bp-proposal'); a.forEach((x, i) => x.setAttribute('id', 'prop-' + (i + 1))); });
await rango('#sec-prop', '#prop-2', '06g-buyers-propuestas');
// Editar y aprobar (sin guardar)
await page.evaluate(() => { const b = [...document.querySelectorAll('#prop-1 button')].find(x => x.textContent.includes('Editar y aprobar')); b.click(); }); await sleep(600);
await rango('#prop-1', '#prop-1', '06h-buyers-editar-propuesta');
// Descartar con motivo (sin confirmar) sobre la 2.ª propuesta
await page.evaluate(() => { const b = [...document.querySelectorAll('#prop-2 button')].find(x => x.textContent.includes('Descartar')); b.click(); }); await sleep(600);
await page.type('#prop-2 .bp-editor input', 'Motivo de ejemplo: el mensaje no encaja con la campaña vigente'); await sleep(300);
await rango('#prop-2', '#prop-2', '06i-buyers-descartar-propuesta');

// ---- Etapas ----
for (const [r, n] of [['/leads', '07-leads'], ['/payers', '08-payers'], ['/customers', '09-customers'], ['/turned', '10-turned']]) { await ir(r, 2500); await contenido(n); }

// ---- Perfil del contacto ----
await ir('/contact/1', 3000);
await rango('.back-link', '.profile-panel', '11a-perfil-datos');
await elem('.chat-panel', '11b-perfil-conversacion');
await elem('.detail-side', '11c-perfil-lateral');
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

// ---- Cierre de sesión ----
await clickTexto('Cerrar sesión');
await page.waitForSelector('.login-page', { timeout: 30000 }); await sleep(800);
await page.screenshot({ path: file('17-sesion-cerrada') }); console.log('ok 17');
await browser.close();
