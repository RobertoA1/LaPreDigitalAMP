import { getDb } from './db';

/**
 * Sondeo compartido para `GET live` (SSE): un único temporizador por proceso y UNA consulta por tick, sin importar cuántas pestañas
 * estén conectadas. Cada cliente recibe un aviso cuando cambia la versión (máximo id de las tablas que alimentan el panel).
 */
const TABLAS = ['amp_events', 'amp_insights', 'amp_approvals', 'amp_messages', 'amp_buyer_notifications', 'amp_buyer_runs', 'amp_buyer_proposals'] as const;
const INTERVALO_MS = 2500;
type Cliente = (version: string, cambio: boolean) => void;
type Hub = { clientes: Set<Cliente>; timer: ReturnType<typeof setInterval> | null; version: string; ocupado: boolean };
const global = globalThis as unknown as { ampLiveHub?: Hub };
const hub: Hub = (global.ampLiveHub ||= { clientes: new Set(), timer: null, version: '', ocupado: false });

/** Una sola sentencia con una subconsulta por tabla. */
export async function versionLive(): Promise<string> {
  const sql = `SELECT ${TABLAS.map((t, i) => `(SELECT MAX(id) FROM ${t}) AS v${i}`).join(', ')}`;
  const [filas] = await getDb().query(sql);
  const fila = (filas as Record<string, unknown>[])[0] || {};
  return TABLAS.map((_, i) => Number(fila[`v${i}`]) || 0).join(':');
}

async function tick() {
  if (hub.ocupado || !hub.clientes.size) return;
  hub.ocupado = true;
  try {
    const nueva = await versionLive();
    const cambio = nueva !== hub.version;
    hub.version = nueva;
    for (const cliente of hub.clientes) { try { cliente(nueva, cambio); } catch { /* cliente cerrado */ } }
  } catch { /* la reconexión del navegador mantiene el canal; se reintenta en el siguiente tick */ }
  finally { hub.ocupado = false; }
}

/** Suscribe un cliente. Devuelve la función para darse de baja (detiene el temporizador cuando no quedan clientes). */
export async function suscribirLive(cliente: Cliente): Promise<() => void> {
  if (!hub.version) { try { hub.version = await versionLive(); } catch { /* se fijará en el primer tick */ } }
  hub.clientes.add(cliente);
  if (!hub.timer) hub.timer = setInterval(() => { void tick(); }, INTERVALO_MS);
  return () => {
    hub.clientes.delete(cliente);
    if (!hub.clientes.size && hub.timer) { clearInterval(hub.timer); hub.timer = null; }
  };
}
export const clientesLive = () => hub.clientes.size;
