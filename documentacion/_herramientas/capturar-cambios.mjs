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


await ir('/buyers', 4000);
await page.evaluate(() => { const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }; const [d, h] = document.querySelectorAll('.bp-filters input[type=date]'); set(d, '2025-06-01'); set(h, '2026-10-31'); });
await sleep(15000);
await rango('.bp-filters', '.bp-kpi-groups', '06a-buyers-filtros-kpi-periodo-completo');
await elem('.bp-tables', '06c-buyers-desgloses-periodo-completo');
await browser.close();
