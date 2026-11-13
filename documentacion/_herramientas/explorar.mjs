// Exploración: capturas de página completa (en la carpeta indicada) para decidir recortes.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
const BASE = 'http://127.0.0.1:3000';
const EMAIL = process.env.AMP_EMAIL;
const PASS = fs.readFileSync(process.env.AMP_PASS_FILE, 'utf8').split(/\r?\n/)[0].trim();
const OUT = process.env.OUT_DIR; fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, defaultViewport: { width: 1366, height: 850, deviceScaleFactor: 1 }, args: ['--hide-scrollbars', '--lang=es-PE'] });
const page = await browser.newPage();
async function fill(sel, text) { await page.focus(sel); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace'); await page.type(sel, text); }
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForSelector('input[type=email]'); await sleep(3500);
await fill('input[type=email]', EMAIL); await fill('input[type=password]', PASS);
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }), page.click('button.primary')]);
await page.waitForSelector('.sidebar', { timeout: 60000 });
for (const r of (process.env.ROUTES || '/buyers').split(',')) {
  await page.goto(BASE + r, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.bp, .main', { timeout: 90000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 60000 && /Cargando|Consultando/.test(await page.evaluate(() => document.body.innerText))) await sleep(500);
  await sleep(4000);
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  if(process.env.EVAL) console.log(JSON.stringify(await page.evaluate(process.env.EVAL),null,1));
  const alto = await page.evaluate(() => document.querySelector('.content').scrollHeight);
  await page.setViewport({ width: 1366, height: Math.min(alto + 20, 6000), deviceScaleFactor: 1 }); await sleep(1200);
  await page.screenshot({ path: path.join(OUT, r.replace(/\W+/g, '_') + '.png') });
  await page.setViewport({ width: 1366, height: 850, deviceScaleFactor: 1 });
  console.log(r, alto);
}
await browser.close();
