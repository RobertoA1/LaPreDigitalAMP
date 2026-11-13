import { getDb } from '../src/lib/db';
import { processNextJob, scanSchedules } from '../src/lib/jobs';
import { LATIDO_INTERVALO_MS, escribirLatido, scanBuyerSchedules } from '../src/lib/buyer-auto';
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function jobLoop(id: number) {
  for (;;) {
    try { if (!(await processNextJob())) await pause(1500); }
    catch (error) { console.error(`Worker ${id}`, error); await pause(3000); }
  }
}
async function scheduleLoop() {
  for (;;) {
    try { await scanSchedules(); } catch (error) { console.error('Scheduler', error); }
    await pause(60_000);
  }
}
/** Programación del agente Buyer → Lead (semanal y alertas): propia y separada, para que un recorrido largo de contactos no la retrase. */
async function buyerLoop() {
  for (;;) {
    try { await scanBuyerSchedules(); } catch (error) { console.error('Programación Buyer', error); }
    await pause(60_000);
  }
}
/** Latido: una fila pequeña de amp_settings cada pocos segundos; el panel lo usa para saber si el worker está vivo. */
async function heartbeatLoop() {
  for (;;) {
    try { await escribirLatido(); } catch (error) { console.error('Latido', error); }
    await pause(LATIDO_INTERVALO_MS);
  }
}
async function main() {
  await getDb().authenticate();
  console.log('AMP worker activo: 3 ejecuciones concurrentes');
  await Promise.all([heartbeatLoop(), scheduleLoop(), buyerLoop(), jobLoop(1), jobLoop(2), jobLoop(3)]);
}
main().catch(error => { console.error(error); process.exit(1); });
