import { getDb } from '../src/lib/db';
import { processNextJob, scanSchedules } from '../src/lib/jobs';
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
async function main() {
  await getDb().authenticate();
  console.log('AMP worker activo: 3 ejecuciones concurrentes');
  await Promise.all([scheduleLoop(), jobLoop(1), jobLoop(2), jobLoop(3)]);
}
main().catch(error => { console.error(error); process.exit(1); });
