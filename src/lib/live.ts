import { getDb } from './db';

/**
 * Sondeo compartido para `GET live` (SSE): un único temporizador por proceso y UNA consulta por tick, sin importar cuántas pestañas
 * estén conectadas. Cada cliente recibe un aviso cuando cambia la versión (resumen de las tablas que alimentan el panel).
 * La versión mezcla: máximo id (tablas que solo reciben filas nuevas) y marcas de última escritura para lo que se edita en el sitio:
 * reglas (cantidad y última modificación), avisos (cantidad de vistos) y ejecuciones del agente (paso y registro, vía `updatedAt`).
 */
const TABLAS = ['amp_events', 'amp_insights', 'amp_approvals', 'amp_messages', 'amp_buyer_notifications', 'amp_buyer_runs', 'amp_buyer_proposals', 'amp_buyer_alerts'] as const;
const INTERVALO_MS = 2500;
type Cliente = (version: string, cambio: boolean) => void;
type Hub = { clientes: Set<Cliente>; timer: ReturnType<typeof setInterval> | null; version: string; ocupado: boolean };
const global = globalThis as unknown as { ampLiveHub?: Hub };
const hub: Hub = (global.ampLiveHub ||= { clientes: new Set(), timer: null, version: '', ocupado: false });

/** Expresiones extra solo para SQL Server (SQLite del modo Demo no tiene DATEDIFF_BIG ni estas tablas de edición). */
const EXTRA_MSSQL = [
  `(SELECT COUNT(*) FROM amp_buyer_rules)`,
  `(SELECT ISNULL(DATEDIFF_BIG(MILLISECOND, '2020-01-01', MAX(updatedAt)), 0) FROM amp_buyer_rules)`,
  `(SELECT COUNT(acknowledgedAt) FROM amp_buyer_alerts)`,
  `(SELECT ISNULL(DATEDIFF_BIG(MILLISECOND, '2020-01-01', MAX(updatedAt)), 0) FROM amp_buyer_runs)`
];

/** Una sola sentencia con una subconsulta por tabla. */
export async function versionLive(): Promise<string> {
  const mssql = getDb().getDialect() === 'mssql';
  const columnas = [...TABLAS.filter(t => mssql || t !== 'amp_buyer_alerts').map(t => `(SELECT MAX(id) FROM ${t})`), ...(mssql ? EXTRA_MSSQL : [])];
  const sql = `SELECT ${columnas.map((c, i) => `${c} AS v${i}`).join(', ')}`;
  const [filas] = await getDb().query(sql);
  const fila = (filas as Record<string, unknown>[])[0] || {};
  return columnas.map((_, i) => Number(fila[`v${i}`]) || 0).join(':');
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
