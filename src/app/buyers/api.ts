// Acceso a la API del panel Buyers y utilidades de formato (sin dependencias de React).
export type Obj = Record<string, any>;
export type Issue = { path?: string; message: string };
export type ApiError = Error & { status?: number; issues?: Issue[] };

export async function api(path: string, options?: RequestInit) {
  const response = await fetch(`/api/${path}`, { ...options, cache: 'no-store' });
  let data: any = null;
  try { data = await response.json(); } catch { /* respuesta sin JSON */ }
  if (!response.ok) {
    const error: ApiError = new Error(data?.error || `Error ${response.status}`);
    error.status = response.status;
    if (Array.isArray(data?.issues)) error.issues = data.issues.map(normalizaIssue);
    throw error;
  }
  return data;
}
export const post = (path: string, data: unknown) =>
  api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

function normalizaIssue(raw: any): Issue {
  if (typeof raw === 'string') { const m = /^([A-Za-z0-9_.]+): (.+)$/s.exec(raw); return m ? { path: m[1], message: m[2] } : { message: raw }; }
  const path = Array.isArray(raw?.path) ? raw.path.join('.') : raw?.path ? String(raw.path) : raw?.field ? String(raw.field) : undefined;
  return { path, message: String(raw?.message ?? raw?.error ?? 'Valor inválido') };
}

// ---------------------------------------------------------------------------
// Catálogos de etiquetas
// ---------------------------------------------------------------------------
export const KPI_CODES = ['B-1.1', 'B-1.2', 'B-2.1', 'B-2.2', 'B-2.3', 'B-3.1'] as const;
export const KPI_NOMBRES: Record<string, string> = {
  'B-1.1': 'Cobertura de atribución a campañas', 'B-1.2': 'Costo por LEADs nuevos por campaña',
  'B-2.1': 'Tasa de visualización completa', 'B-2.2': 'Tasa de avance al 50 %',
  'B-2.3': 'Conversión a LEAD tras el 50 %', 'B-3.1': 'Tasa de conversión a LEADS'
};
export const ACTIVIDAD: Record<string, { corto: string; titulo: string; pista: string }> = {
  B1: { corto: 'B-1', titulo: 'B-1 · Publicaciones', pista: 'Difusión en TikTok, Instagram y WhatsApp hacia la landing' },
  B2: { corto: 'B-2', titulo: 'B-2 · Video y guion', pista: 'Visualización y avance del video de la landing' },
  B3: { corto: 'B-3', titulo: 'B-3 · Formulario breve', pista: 'Captación de datos (sin IA)' }
};
export const ESTADO_KPI: Record<string, { label: string; cls: string; icono: string }> = {
  ROJO: { label: 'Requiere atención', cls: 'rojo', icono: '▲' }, AMARILLO: { label: 'En seguimiento', cls: 'amarillo', icono: '■' },
  VERDE: { label: 'Favorable', cls: 'verde', icono: '●' }, SIN_DATOS: { label: 'Sin datos', cls: 'sin', icono: '○' }
};
export const CANALES = ['TIKTOK', 'INSTAGRAM', 'WHATSAPP'];
export const PUBLICOS: Record<string, string> = { POSTULANTE: 'Estudiantes postulantes', APODERADO: 'Padres o apoderados' };
export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// ---------------------------------------------------------------------------
// Semáforo (misma regla que el servidor: los bordes pertenecen al estado mejor)
// ---------------------------------------------------------------------------
export type Umbral = { direction: 'HIGHER_BETTER' | 'LOWER_BETTER'; yellow: number; green: number };
export function estadoDe(th: Partial<Umbral> | undefined | null, value: number | null | undefined): string {
  if (!th || th.yellow == null || th.green == null || value == null || !Number.isFinite(value)) return 'SIN_DATOS';
  if (th.direction === 'HIGHER_BETTER') return value < th.yellow ? 'ROJO' : value >= th.green ? 'VERDE' : 'AMARILLO';
  return value > th.yellow ? 'ROJO' : value <= th.green ? 'VERDE' : 'AMARILLO';
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------
export const num2 = (v: number) => v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const int = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('es-PE'));
export const fmt = (value: number | null | undefined, unit: string) =>
  value == null ? '—' : unit === 'S/' ? `S/ ${num2(value)}` : `${num2(value)} %`;
export function textoNiveles(th: Partial<Umbral> | undefined | null, unit: string) {
  if (!th || th.yellow == null || th.green == null) return 'Niveles no disponibles';
  const u = unit === 'S/' ? 'S/ ' : '', s = unit === 'S/' ? '' : ' %';
  return th.direction === 'HIGHER_BETTER'
    ? `Rojo < ${u}${th.yellow}${s} · Verde ≥ ${u}${th.green}${s}`
    : `Rojo > ${u}${th.yellow}${s} · Verde ≤ ${u}${th.green}${s}`;
}
export const lima = (value?: string | null, withDate = false) => value
  ? new Date(value).toLocaleString('es-PE', { timeZone: 'America/Lima', ...(withDate ? { day: '2-digit', month: 'short' } : {}), hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  : '—';
export const fechaLima = (value?: string | null) => value
  ? new Date(value).toLocaleString('es-PE', { timeZone: 'America/Lima', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
  : '—';
export function fechaCorta(value?: string | null) {
  if (!value) return '—';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}
/** Duración legible a partir de milisegundos: «42 s», «3 min 05 s», «2 h 10 min». */
export function duracion(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min`;
}
export function haceCuanto(value: string | null | undefined, now: number) {
  if (!value) return '—';
  const ms = now - new Date(value).getTime();
  if (ms < 5000) return 'ahora mismo';
  if (ms < 86400_000) return `hace ${duracion(ms)}`;
  return `hace ${Math.floor(ms / 86400_000)} d`;
}
/** Convierte un campo JSON que el servidor pudo enviar como texto. */
export function comoLista(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) { try { const v = JSON.parse(value); return Array.isArray(v) ? v : []; } catch { return []; } }
  return [];
}
export function evidenceLines(ev: unknown): string[] {
  let value: any = ev;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return value.trim() ? [value] : []; } }
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(v => (typeof v === 'string' ? v : JSON.stringify(v)));
  if (typeof value === 'object') return Object.entries(value).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  return [String(value)];
}
export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text; area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.appendChild(area); area.select();
      const copiado = document.execCommand('copy'); area.remove(); return copiado;
    } catch { return false; }
  }
}
