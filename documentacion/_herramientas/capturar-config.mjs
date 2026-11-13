// Captura complementaria: los dos paneles de Configuración por separado (solo lectura).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(aqui, '..', 'capturas');
const BASE = 'http://127.0.0.1:3000';
const PASS = fs.readFileSync(process.env.AMP_PASS_FILE, 'utf8').split(/\r?\n/)[0].trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, defaultViewport: { width: 1366, height: 850, deviceScaleFactor: 1 }, args: ['--hide-scrollbars', '--lang=es-PE'] });
const page = await browser.newPage();
async function fill(sel, text) { await page.focus(sel); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace'); await page.type(sel, text); }
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForSelector('input[type=email]'); await sleep(3500);
await fill('input[type=email]', (process.env.AMP_EMAIL || 'verificador@lapredigital.local')); await fill('input[type=password]', PASS);
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }), page.click('button.primary')]);
await page.goto(BASE + '/settings', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('.two-col > section', { timeout: 60000 }); await sleep(3000);
await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
const secs = await page.$$('.two-col > section');
await secs[0].screenshot({ path: path.join(out, '16a-configuracion-proveedor-ia.png') });
await secs[1].screenshot({ path: path.join(out, '16b-configuracion-conexiones-seguimiento.png') });
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Cerrar sesión')).click());
await page.waitForSelector('.login-page', { timeout: 30000 }); await sleep(1500);
await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
await page.screenshot({ path: path.join(out, '17-sesion-cerrada.png') });
await browser.close();
console.log('ok');
