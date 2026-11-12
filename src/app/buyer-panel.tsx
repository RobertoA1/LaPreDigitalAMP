'use client';
import { useEffect, useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, Check, Copy, Pencil, RefreshCw, Sparkles, Trash2, Video, Megaphone } from 'lucide-react';

type Obj = Record<string, any>;
type ApiError = Error & { status?: number };

// ---------------------------------------------------------------------------
// Acceso a la API y estado por bloque (cada bloque carga de forma independiente)
// ---------------------------------------------------------------------------
async function api(path: string, options?: RequestInit) {
  const response = await fetch(`/api/${path}`, { ...options, cache: 'no-store' });
  let data: any = null;
  try { data = await response.json(); } catch { /* respuesta sin JSON */ }
  if (!response.ok) { const error: ApiError = new Error(data?.error || `Error ${response.status}`); error.status = response.status; throw error; }
  return data;
}
const post = (path: string, data: unknown) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

type Block<T = any> = { data: T | null; error: string; status: number; loading: boolean; refresh: () => void };
type BlockOptions = {
  /** Recarga cuando llega un evento `amp-live` (con antirrebote de 2 s). Solo para tiempo real, ejecuciones y propuestas. */
  live?: boolean;
  /** Recarga periódica de respaldo (ms). Por defecto no hay: KPI, tendencia, desgloses y curva solo se cargan al montar, al cambiar filtros o al actualizar. */
  intervalMs?: number;
};
const LIVE_DEBOUNCE_MS = 2000;
function useBlock<T = any>(path: string | null, options: BlockOptions = {}): Block<T> {
  const { live = false, intervalMs = 0 } = options;
  const [state, setState] = useState<{ data: T | null; error: string; status: number; loading: boolean }>({ data: null, error: '', status: 0, loading: !!path });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) { setState({ data: null, error: '', status: 0, loading: false }); return; }
    const controller = new AbortController();
    let active = true, inFlight = false, debounce: ReturnType<typeof setTimeout> | null = null;
    const load = () => {
      if (inFlight || !active) return; // sin solapar peticiones: si hay una en curso no se lanza otra
      inFlight = true;
      api(path, { signal: controller.signal })
        .then(value => { if (active) setState({ data: value, error: '', status: 200, loading: false }); })
        .catch((err: ApiError) => { if (active && err.name !== 'AbortError') setState(prev => ({ data: prev.data, error: err.message, status: err.status || 0, loading: false })); })
        .finally(() => { inFlight = false; });
    };
    const onLive = () => { if (!debounce) debounce = setTimeout(() => { debounce = null; load(); }, LIVE_DEBOUNCE_MS); };
    setState(prev => ({ ...prev, loading: true }));
    load();
    const timer = intervalMs > 0 ? setInterval(load, intervalMs) : null;
    if (live) window.addEventListener('amp-live', onLive);
    return () => { active = false; controller.abort(); if (timer) clearInterval(timer); if (debounce) clearTimeout(debounce); if (live) window.removeEventListener('amp-live', onLive); };
  }, [path, tick, live, intervalMs]);
  return { ...state, refresh: () => setTick(x => x + 1) };
}

// ---------------------------------------------------------------------------
// Formato y semáforos
// ---------------------------------------------------------------------------
const STATUS: Record<string, { label: string; cls: string }> = {
  ROJO: { label: 'Requiere atención', cls: 'rojo' }, AMARILLO: { label: 'En seguimiento', cls: 'amarillo' },
  VERDE: { label: 'Favorable', cls: 'verde' }, SIN_DATOS: { label: 'Sin datos', cls: 'sin' }
};
function estadoDe(th: Obj | undefined, value: number | null | undefined): string {
  if (!th || value == null || !Number.isFinite(value)) return 'SIN_DATOS';
  if (th.direction === 'HIGHER_BETTER') return value < th.yellow ? 'ROJO' : value >= th.green ? 'VERDE' : 'AMARILLO';
  return value > th.yellow ? 'ROJO' : value <= th.green ? 'VERDE' : 'AMARILLO';
}
const num2 = (v: number) => v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = (v: number | null | undefined) => v == null ? '—' : Number(v).toLocaleString('es-PE');
function fmt(value: number | null | undefined, unit: string) { if (value == null) return '—'; return unit === 'S/' ? `S/ ${num2(value)}` : `${num2(value)} %`; }
function thresholdText(k: Obj) {
  const t = k.thresholds || {}, u = k.unit === 'S/' ? 'S/ ' : '', s = k.unit === 'S/' ? '' : ' %';
  return t.direction === 'HIGHER_BETTER' ? `Rojo < ${u}${t.yellow}${s} · Verde ≥ ${u}${t.green}${s}` : `Rojo > ${u}${t.yellow}${s} · Verde ≤ ${u}${t.green}${s}`;
}
const KPI_CODES = ['B-1.1', 'B-1.2', 'B-2.1', 'B-2.2', 'B-2.3', 'B-3.1'];
const ACTIVITY: Record<string, { title: string; hint: string }> = {
  B1: { title: 'B-1 · Difusión en TikTok, Instagram y WhatsApp', hint: 'Publicaciones orgánicas y anuncios pagados hacia la landing' },
  B2: { title: 'B-2 · Video breve de la landing', hint: 'Visualización y avance del video' },
  B3: { title: 'B-3 · Formulario breve', hint: 'Captación de datos (sin IA)' }
};
const lima = (value?: string | null, withDate = false) => value ? new Date(value).toLocaleString('es-PE', { timeZone: 'America/Lima', ...(withDate ? { day: '2-digit', month: 'short' } : {}), hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—';
const fechaCorta = (value?: string | null) => { if (!value) return '—'; const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value); return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }); };

function StatusChip({ status }: { status: string }) { const s = STATUS[status] || STATUS.SIN_DATOS; return <span className={`bp-st ${s.cls}`}><i aria-hidden="true"/>{s.label}</span>; }
function Tag({ children, tone = 'light' }: { children: React.ReactNode; tone?: string }) { return <span className={`tag ${tone}`}>{children}</span>; }
function Msg({ block, what, unavailable }: { block: Block<any>; what: string; unavailable?: string }) {
  // Estados de carga / vacío / error de un bloque. Devuelve null cuando hay datos que mostrar.
  if (block.data) return null;
  if (block.loading) return <div className="loading">Cargando {what}...</div>;
  if (block.status === 503) return <div className="empty"><Sparkles size={28}/><p>{block.error}</p></div>;
  if (block.status === 404 && unavailable) return <div className="empty"><Sparkles size={28}/><p>{unavailable}</p></div>;
  return <div className="empty"><Sparkles size={28}/><p>{block.error || 'Sin datos'}</p></div>;
}
function Section({ eyebrow, title, right, children, className = '' }: { eyebrow: string; title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`panel bp-section ${className}`}><div className="panel-header"><div><p className="eyebrow">{eyebrow}</p><h3>{title}</h3></div>{right}</div>{children}</section>;
}
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => { if (!message) return; const t = setTimeout(onClose, 5000); return () => clearTimeout(t); }, [message, onClose]);
  return message ? <div className="notice" role="status">{message}</div> : null;
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------
export default function BuyerPanel() {
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [canal, setCanal] = useState(''), [campana, setCampana] = useState(''), [video, setVideo] = useState('');
  const [toast, setToast] = useState('');
  const qs = useMemo(() => { const p = new URLSearchParams(); if (from) p.set('from', from); if (to) p.set('to', to); if (canal) p.set('canal', canal); if (campana) p.set('campana', campana); if (video) p.set('video', video); return p.toString(); }, [from, to, canal, campana, video]);
  const kpis = useBlock(`buyer/kpis${qs ? `?${qs}` : ''}`);
  const d = kpis.data;
  const filters = d?.filters || { canales: [], campanas: [], videos: [] };
  const invalidRange = !!(from && to && from > to);
  return <div className="bp">
    <Toast message={toast} onClose={() => setToast('')}/>
    <div className="panel bp-filters" role="search" aria-label="Filtros globales">
      <label>Desde<input type="date" value={from || d?.period?.from || ''} max={to || d?.period?.to || undefined} onChange={e => setFrom(e.target.value)}/></label>
      <label>Hasta<input type="date" value={to || d?.period?.to || ''} min={from || d?.period?.from || undefined} onChange={e => setTo(e.target.value)}/></label>
      <label>Canal<select value={canal} onChange={e => setCanal(e.target.value)}><option value="">Todos</option>{filters.canales.map((c: Obj) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}</select></label>
      <label>Campaña<select value={campana} onChange={e => setCampana(e.target.value)}><option value="">Todas</option>{filters.campanas.map((c: Obj) => <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>)}</select></label>
      <label>Video<select value={video} onChange={e => setVideo(e.target.value)}><option value="">Todos</option>{filters.videos.map((v: Obj) => <option key={v.id} value={v.id}>{v.nombre} {v.version}</option>)}</select></label>
      <button className="button secondary" onClick={() => { setFrom(''); setTo(''); setCanal(''); setCampana(''); setVideo(''); }}>Restablecer</button>
      <p className="bp-legend">{d?.lastLoad?.fechaDatos ? <>Datos del DataMart al <b>{fechaCorta(d.lastLoad.fechaDatos)}</b></> : kpis.loading ? 'Consultando DataMart...' : 'Sin fecha de datos del DataMart'}</p>
      {invalidRange && <p className="error" role="alert">La fecha inicial no puede ser posterior a la final.</p>}
    </div>
    {kpis.error && d && <p className="error" role="alert">No se pudo actualizar los KPI: {kpis.error}</p>}
    <KpiCards block={kpis}/>
    <div className="bp-grid-2">
      <TrendSection block={kpis}/>
      <AbandonmentSection kpis={kpis} videoFilter={video}/>
    </div>
    <BreakdownTables block={kpis}/>
    <RealtimeSection/>
    <AgentSection onToast={setToast}/>
    <ProposalsSection onToast={setToast}/>
  </div>;
}

function KpiCards({ block }: { block: Block }) {
  const m = Msg({ block, what: 'KPI' });
  if (m) return <Section eyebrow="INDICADORES" title="KPI del periodo">{m}</Section>;
  const list: Obj[] = block.data?.kpis || [];
  if (!list.length) return <Section eyebrow="INDICADORES" title="KPI del periodo"><div className="empty"><Sparkles size={28}/><p>El DataMart aún no tiene datos para el periodo.</p></div></Section>;
  return <div className="bp-kpi-groups">{(['B1', 'B2', 'B3'] as const).map(act => {
    const items = list.filter(k => k.activity === act);
    if (!items.length) return null;
    return <section key={act} aria-label={ACTIVITY[act].title}><div className="bp-group-head"><h3>{ACTIVITY[act].title}</h3><small>{ACTIVITY[act].hint}</small></div>
      <div className="bp-kpis">{items.map(k => <article key={k.code} className={`panel bp-kpi ${(STATUS[k.status] || STATUS.SIN_DATOS).cls}`}>
        <div className="bp-kpi-top"><Tag tone="purple">{k.code}</Tag><StatusChip status={k.status}/></div>
        <p className="bp-kpi-name">{k.name}</p>
        <strong className="bp-kpi-value">{fmt(k.value, k.unit)}</strong>
        <small className="bp-kpi-frac">{k.denominator > 0 ? <>{k.unit === 'S/' ? `S/ ${num2(k.numerator)}` : int(k.numerator)} / {int(k.denominator)}{k.code === 'B-1.2' ? ' LEADs nuevos' : ''}</> : 'Denominador 0: sin datos'}</small>
        <small className="bp-kpi-th">{thresholdText(k)}</small>
      </article>)}</div></section>;
  })}</div>;
}

function TrendSection({ block }: { block: Block }) {
  const [code, setCode] = useState('B-3.1');
  const kpi = (block.data?.kpis || []).find((k: Obj) => k.code === code);
  const unit = kpi?.unit || (code === 'B-1.2' ? 'S/' : '%');
  const rows = (block.data?.trend || []).map((r: Obj) => ({ mes: String(r.mes), value: r[code] ?? null }));
  const m = Msg({ block, what: 'tendencia' });
  const hasAny = rows.some((r: Obj) => r.value != null);
  return <Section eyebrow="TENDENCIA MENSUAL" title="Evolución de un KPI" right={<select aria-label="KPI de la tendencia" value={code} onChange={e => setCode(e.target.value)}>{KPI_CODES.map(c => <option key={c} value={c}>{c} · {(block.data?.kpis || []).find((k: Obj) => k.code === c)?.name || ''}</option>)}</select>}>
    {m || (!rows.length || !hasAny ? <div className="empty"><Sparkles size={28}/><p>Sin datos mensuales para este KPI con los filtros actuales.</p></div> :
      <div className="bp-chart"><ResponsiveContainer width="100%" height={260}><LineChart data={rows} margin={{ left: 0, right: 14, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#edf0f6"/><XAxis dataKey="mes" tick={{ fill: '#68758a', fontSize: 11 }}/><YAxis width={56} tick={{ fill: '#68758a', fontSize: 11 }} tickFormatter={(v: number) => unit === 'S/' ? `S/${v}` : `${v}%`}/>
        <Tooltip formatter={(v: any) => [fmt(Number(v), unit), code]}/><Line type="monotone" dataKey="value" name={code} stroke="#7656df" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false}/></LineChart></ResponsiveContainer></div>)}
  </Section>;
}

function AbandonmentSection({ kpis, videoFilter }: { kpis: Block; videoFilter: string }) {
  const videos: Obj[] = kpis.data?.filters?.videos || [];
  const [sel, setSel] = useState('');
  const masVisto = [...(kpis.data?.byVideo || [])].sort((a: Obj, b: Obj) => (b.reproducciones || 0) - (a.reproducciones || 0))[0];
  const current = sel || videoFilter || (masVisto ? String(masVisto.videoId) : videos[0] ? String(videos[0].id) : '');
  const period = kpis.data?.period;
  const path = current && period?.from && period?.to ? `buyer/abandonment?video=${current}&from=${period.from}&to=${period.to}` : null;
  const block = useBlock(path);
  const d = block.data;
  const dur = Number(d?.duracionSeg) || 0;
  const rows = (d?.curve || []).map((p: Obj) => ({ pct: p.pct, alcanzan: d.total > 0 ? Math.round((p.alcanzan / d.total) * 10000) / 100 : 0, conversion: p.conversion, n: p.alcanzan }));
  const m = d?.mayorCaida;
  const sec = (pct: number) => dur ? ` (${Math.round(pct * dur / 100)} s)` : '';
  return <Section eyebrow="VIDEO · B-2" title="Curva de abandono" right={<select aria-label="Video" value={current} onChange={e => setSel(e.target.value)} disabled={!videos.length}>{videos.length ? videos.map(v => <option key={v.id} value={v.id}>{v.nombre} {v.version}</option>) : <option value="">Sin videos</option>}</select>}>
    {!path ? (kpis.data ? <div className="empty"><Sparkles size={28}/><p>No hay videos o periodo disponibles para la curva.</p></div> : <Msg block={kpis} what="curva"/>) :
      <>{Msg({ block, what: 'curva de abandono' }) || (!d.total ? <div className="empty"><Sparkles size={28}/><p>Este video no tiene reproducciones en el periodo.</p></div> : <>
        <div className="bp-chart"><ResponsiveContainer width="100%" height={240}><ComposedChart data={rows} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#edf0f6"/><XAxis dataKey="pct" tickFormatter={(v: number) => `${v}%`} tick={{ fill: '#68758a', fontSize: 11 }}/>
          <YAxis yAxisId="l" domain={[0, 100]} width={40} tickFormatter={(v: number) => `${v}%`} tick={{ fill: '#68758a', fontSize: 11 }}/><YAxis yAxisId="r" orientation="right" width={40} tickFormatter={(v: number) => `${v}%`} tick={{ fill: '#68758a', fontSize: 11 }}/>
          <Tooltip labelFormatter={(v: any) => `Tramo ${v} % del video`} formatter={(v: any, name: any) => [v == null ? 'Sin datos' : `${num2(Number(v))} %`, name]}/><Legend wrapperStyle={{ fontSize: 11 }}/>
          <Area yAxisId="l" type="monotone" dataKey="alcanzan" name="% que alcanzan el tramo" stroke="#3f84ed" fill="#3f84ed33"/>
          <Line yAxisId="r" type="monotone" dataKey="conversion" name="% conversión en el tramo" stroke="#ff6b57" strokeWidth={2.5} dot={{ r: 3 }} connectNulls/></ComposedChart></ResponsiveContainer></div>
        <p className="bp-callout">{m ? <><b>Mayor caída:</b> entre el {m.desdePct} %{sec(m.desdePct)} y el {m.hastaPct} %{sec(m.hastaPct)} del video se pierden {int(m.perdida)} reproducciones ({num2(m.perdidaPct)} % del total de {int(d.total)}).</> : 'No se detecta una caída relevante en el periodo.'}</p></>)}</>}
  </Section>;
}

function KpiCell({ kpis, code, value }: { kpis: Obj[]; code: string; value: number | null | undefined }) {
  const k = kpis.find(x => x.code === code);
  const st = estadoDe(k?.thresholds, value);
  return <span className={`bp-cell ${STATUS[st].cls}`} title={STATUS[st].label}><i aria-hidden="true"/>{value == null ? '—' : fmt(value, k?.unit || '%')}<span className="bp-sr"> {STATUS[st].label}</span></span>;
}
function BreakdownTables({ block }: { block: Block }) {
  const d = block.data;
  const kpis: Obj[] = d?.kpis || [];
  const m = Msg({ block, what: 'desgloses' });
  return <Section eyebrow="DESGLOSES" title="Por canal, campaña y video">
    {m || <div className="bp-tables">
      <div><h4>Por canal</h4>{d.byCanal?.length ? <div className="table-scroll"><table><thead><tr><th>Canal</th><th>Visitas</th>{KPI_CODES.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{d.byCanal.map((r: Obj) => <tr key={r.canal}><td>{r.canalNombre || r.canal}</td><td>{int(r.visitas)}</td>{KPI_CODES.map(c => <td key={c}><KpiCell kpis={kpis} code={c} value={r[c]}/></td>)}</tr>)}</tbody></table></div> : <p className="muted">Sin datos por canal.</p>}</div>
      <div><h4>Por campaña</h4>{d.byCampana?.length ? <div className="table-scroll"><table><thead><tr><th>Campaña</th><th>Tipo</th><th>Visitas</th><th>Leads nuevos</th><th>Costo</th><th>Costo por lead</th></tr></thead><tbody>{d.byCampana.map((r: Obj) => <tr key={r.campanaId}><td>{r.campana}</td><td>{r.tipo}</td><td>{int(r.visitas)}</td><td>{int(r.leadsNuevos)}</td><td>{fmt(r.costo, 'S/')}</td><td>{r.costoPorLead == null ? '—' : <KpiCell kpis={kpis} code="B-1.2" value={r.costoPorLead}/>}</td></tr>)}</tbody></table></div> : <p className="muted">Sin campañas con visitas en el periodo.</p>}</div>
      <div><h4>Por video</h4>{d.byVideo?.length ? <div className="table-scroll"><table><thead><tr><th>Video</th><th>Duración</th><th>Reproducciones</th><th>B-2.1</th><th>B-2.2</th><th>B-2.3</th></tr></thead><tbody>{d.byVideo.map((r: Obj) => <tr key={r.videoId}><td>{r.video} <small>{r.version}</small></td><td>{r.duracionSeg == null ? '—' : `${r.duracionSeg} s`}</td><td>{int(r.reproducciones)}</td>{['B-2.1', 'B-2.2', 'B-2.3'].map(c => <td key={c}><KpiCell kpis={kpis} code={c} value={r[c]}/></td>)}</tr>)}</tbody></table></div> : <p className="muted">Sin datos por video.</p>}</div>
    </div>}
  </Section>;
}

const FORM_STATES: Record<string, string> = { VALIDO: 'Válido', DUPLICADO: 'Duplicado', INVALIDO: 'Inválido', REVISION: 'En revisión', DESCONOCIDO: 'Desconocido' };
function RealtimeSection() {
  const block = useBlock('buyer/realtime', { live: true, intervalMs: 30000 });
  const d = block.data;
  const t = d?.today;
  const m = Msg({ block, what: 'actividad de hoy' });
  const notes: Obj[] = d?.notifications || [];
  return <Section eyebrow="OLTP · HOY EN TIEMPO REAL" title="Hoy en tiempo real" right={<span className="muted tiny">Última actividad: {lima(d?.lastActivityAt, true)} (Lima)</span>}>
    {m || <>
      <div className="bp-today">
        <div><span>Visitas</span><strong>{int(t?.visitas)}</strong><small>{int(t?.visitasConCampana)} con campaña</small></div>
        <div><span>Reproducciones</span><strong>{int(t?.reproducciones)}</strong></div>
        <div><span>Conversión</span><strong>{t?.conversion == null ? '—' : `${num2(t.conversion)} %`}</strong><small>válidos + duplicados / visitas</small></div>
        <div><span>Formularios por estado</span><div className="bp-forms">{Object.keys(FORM_STATES).filter(k => k !== 'DESCONOCIDO').map(k => <Tag key={k} tone={k === 'VALIDO' ? 'teal' : k === 'REVISION' ? 'orange' : 'light'}>{FORM_STATES[k]}: {int(t?.formularios?.[k] ?? 0)}</Tag>)}</div></div>
      </div>
      <h4>Notificaciones de inscripciones en vivo</h4>
      {notes.length ? <ul className="bp-notes">{notes.map(n => <li key={n.id}><strong>Formulario #{n.formId}</strong><Tag tone={n.formStatus === 'VALIDO' ? 'teal' : n.formStatus === 'REVISION' ? 'orange' : 'light'}>{FORM_STATES[n.formStatus] || n.formStatus}</Tag><span>{n.channel || 'Canal sin identificar'}</span><span>{n.campaignName || 'Sin campaña'}</span><span>{lima(n.occurredAt || n.receivedAt, true)}</span><Tag tone={n.verified ? 'teal' : 'orange'}>{n.verified ? 'Verificada en el OLTP' : 'No verificada'}</Tag></li>)}</ul> : <p className="muted">Aún no llegan notificaciones de inscripciones.</p>}
    </>}
  </Section>;
}

const RUN_STATUS: Record<string, [string, string]> = { PENDING: ['En cola', 'light'], RUNNING: ['En proceso', 'purple'], DONE: ['Terminada', 'teal'], FAILED: ['Fallida', 'orange'] };
const TRIGGER: Record<string, string> = { MANUAL: 'Manual', SCHEDULED: 'Programada (semanal)', KPI_ALERT: 'Alerta de KPI' };
function AgentSection({ onToast }: { onToast: (m: string) => void }) {
  const [instructions, setInstructions] = useState(''), [busy, setBusy] = useState('');
  const runs = useBlock('buyer/runs', { live: true, intervalMs: 30000 });
  async function launch(activity: 'B1' | 'B2') {
    setBusy(activity);
    try { await post('buyer/run', { activity, ...(instructions.trim() ? { instructions: instructions.trim() } : {}) }); onToast(`Ejecución ${activity === 'B1' ? 'B-1' : 'B-2'} en cola. Las propuestas aparecerán como borradores.`); runs.refresh(); }
    catch (err) { onToast(String((err as Error).message)); }
    finally { setBusy(''); }
  }
  const list: Obj[] = runs.data?.runs || [];
  const m = Msg({ block: runs, what: 'ejecuciones', unavailable: 'El servidor aún no expone las ejecuciones del agente.' });
  return <Section eyebrow="AGENTE IA" title="Agente de conversión Buyer → Lead" right={<button className="button secondary" onClick={runs.refresh} aria-label="Actualizar ejecuciones"><RefreshCw size={14}/> Actualizar</button>}>
    <p className="muted">El agente solo genera borradores y recomendaciones: nada se publica solo ni se contacta a nadie.</p>
    <label className="bp-field">Indicaciones opcionales (máx. 500 caracteres)<textarea maxLength={500} value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Ej. Enfatiza el seguimiento académico para apoderados."/><small>{instructions.length}/500</small></label>
    <div className="bp-actions"><button className="button primary" disabled={!!busy} onClick={() => launch('B1')}><Megaphone size={15}/> Generar propuestas de publicaciones (B-1)</button><button className="button primary" disabled={!!busy} onClick={() => launch('B2')}><Video size={15}/> Analizar video y guion (B-2)</button></div>
    <h4>Ejecuciones recientes</h4>
    {m || (list.length ? <ul className="bp-runs">{list.map(r => {
      const [label, tone] = RUN_STATUS[r.status] || [r.status, 'light'];
      return <li key={r.id}><div className="bp-run-head"><strong>#{r.id} · {r.activity === 'B1' ? 'B-1 Publicaciones' : 'B-2 Video y guion'}</strong><Tag tone={tone}>{label}</Tag><span>{TRIGGER[r.trigger] || r.trigger}</span><span>{r.provider ? `${r.provider}${r.model ? ` · ${r.model}` : ''}` : 'Proveedor pendiente'}</span><span>{lima(r.createdAt, true)}</span></div>
        {r.provider === 'PLANTILLA' && <p className="bp-warn" role="alert">Generado con plantilla: IA no disponible.{r.error ? ` Motivo: ${r.error}` : ''}</p>}
        {r.status === 'FAILED' && r.error && r.provider !== 'PLANTILLA' && <p className="error">{r.error}</p>}
        {r.instructions && <small className="muted">Indicaciones: {r.instructions}</small>}
        {r.analysis ? <details><summary>Ver análisis</summary><p className="bp-pre">{r.analysis}</p></details> : r.status === 'PENDING' || r.status === 'RUNNING' ? <small className="muted">Procesando...</small> : null}</li>;
    })}</ul> : <p className="muted">Aún no hay ejecuciones. Usa los botones de arriba para iniciar una.</p>)}
  </Section>;
}

const KINDS: Record<string, string> = { PUBLICACION: 'Publicación', GUION: 'Guion', LLAMADO: 'Llamado al formulario', RECOMENDACION: 'Recomendación' };
const AUDIENCE: Record<string, string> = { POSTULANTE: 'Estudiantes postulantes', APODERADO: 'Padres o apoderados' };
const PROP_STATUS: Record<string, [string, string]> = { DRAFT: ['Borrador', 'orange'], APPROVED: ['Aprobada', 'teal'], DISCARDED: ['Descartada', 'neutral'] };
function evidenceLines(ev: unknown): string[] {
  let value: any = ev;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return value.trim() ? [value] : []; } }
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(v => typeof v === 'string' ? v : JSON.stringify(v));
  if (typeof value === 'object') return Object.entries(value).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  return [String(value)];
}
async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    try { const area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); const okCopy = document.execCommand('copy'); area.remove(); return okCopy; } catch { return false; }
  }
}
function ProposalsSection({ onToast }: { onToast: (m: string) => void }) {
  const [activity, setActivity] = useState(''), [kind, setKind] = useState(''), [status, setStatus] = useState('DRAFT');
  const path = `buyer/proposals?${new URLSearchParams({ ...(status ? { status } : {}), ...(activity ? { activity } : {}) }).toString()}`;
  const block = useBlock(path, { live: true, intervalMs: 60000 });
  const items: Obj[] = (block.data?.proposals || []).filter((p: Obj) => !kind || p.kind === kind);
  const m = Msg({ block, what: 'propuestas', unavailable: 'El servidor aún no expone la bandeja de propuestas.' });
  return <Section eyebrow="BANDEJA" title="Propuestas del agente" right={<Tag tone="light">{items.length}</Tag>}>
    <div className="bp-proposal-filters">
      <label>Actividad<select value={activity} onChange={e => setActivity(e.target.value)}><option value="">Todas</option><option value="B1">B-1 Publicaciones</option><option value="B2">B-2 Video y guion</option></select></label>
      <label>Tipo<select value={kind} onChange={e => setKind(e.target.value)}><option value="">Todos</option>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Estado<select value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos</option><option value="DRAFT">Borrador</option><option value="APPROVED">Aprobada</option><option value="DISCARDED">Descartada</option></select></label>
    </div>
    {m || (items.length ? <div className="bp-proposals">{items.map(p => <Proposal key={p.id} p={p} onToast={onToast} onDone={block.refresh}/>)}</div> : <p className="muted">No hay propuestas con estos filtros.</p>)}
  </Section>;
}
function Proposal({ p, onToast, onDone }: { p: Obj; onToast: (m: string) => void; onDone: () => void }) {
  const [mode, setMode] = useState<'' | 'edit' | 'discard'>(''), [text, setText] = useState(p.editedContent || p.content || ''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false);
  const [st, tone] = PROP_STATUS[p.status] || [p.status, 'light'];
  const shown = p.editedContent || p.content || '';
  async function decide(decision: 'APPROVED' | 'DISCARDED', extra: Obj = {}) {
    setBusy(true);
    try { await post('buyer/proposal/decide', { id: p.id, decision, ...extra }); onToast(decision === 'APPROVED' ? 'Propuesta aprobada. Recuerda publicarla manualmente.' : 'Propuesta descartada.'); setMode(''); onDone(); }
    catch (err) { onToast(String((err as Error).message)); } finally { setBusy(false); }
  }
  const ev = evidenceLines(p.evidence);
  return <article className="bp-proposal">
    <div className="bp-prop-tags"><Tag tone={tone}>{st}</Tag><Tag tone="purple">{KINDS[p.kind] || p.kind}</Tag><Tag>{p.activity === 'B1' ? 'B-1' : 'B-2'}</Tag>{p.audience && <Tag>{AUDIENCE[p.audience] || p.audience}</Tag>}{p.channel && <Tag>{p.channel}</Tag>}{p.campaignType && <Tag>{p.campaignType === 'PAGADA' ? 'Pagada' : 'Orgánica'}</Tag>}{p.recommendationType && <Tag>{p.recommendationType}</Tag>}{p.editedContent && <Tag tone="teal">Editada</Tag>}</div>
    <h4>{p.title}</h4>
    <p className="bp-pre">{shown}</p>
    {p.rationale && <p className="bp-rationale"><b>Justificación:</b> {p.rationale}</p>}
    {ev.length > 0 && <div className="bp-evidence"><b>Evidencia</b><ul>{ev.map((l, i) => <li key={i}>{l}</li>)}</ul></div>}
    {p.status !== 'DRAFT' && <small className="muted">{p.status === 'APPROVED' ? 'Aprobada' : 'Descartada'}{p.decidedBy ? ` por ${p.decidedBy}` : ''}{p.decidedAt ? ` · ${lima(p.decidedAt, true)}` : ''}{p.decisionReason ? ` · ${p.decisionReason}` : ''}</small>}
    {mode === 'edit' && <div className="bp-editor"><label>Texto final<textarea rows={8} value={text} onChange={e => setText(e.target.value)}/></label><div className="bp-actions"><button className="button primary" disabled={busy || !text.trim()} onClick={() => decide('APPROVED', { editedContent: text.trim() })}><Check size={14}/> Guardar y aprobar</button><button className="button secondary" onClick={() => setMode('')}>Cancelar</button></div></div>}
    {mode === 'discard' && <div className="bp-editor"><label>Motivo del descarte (opcional)<input value={reason} maxLength={300} onChange={e => setReason(e.target.value)}/></label><div className="bp-actions"><button className="button primary" disabled={busy} onClick={() => decide('DISCARDED', reason.trim() ? { reason: reason.trim() } : {})}><Trash2 size={14}/> Confirmar descarte</button><button className="button secondary" onClick={() => setMode('')}>Cancelar</button></div></div>}
    {!mode && <div className="bp-actions">
      {p.status === 'DRAFT' && <><button className="button primary" disabled={busy} onClick={() => decide('APPROVED')}><Check size={14}/> Aprobar</button><button className="button secondary" disabled={busy} onClick={() => { setText(shown); setMode('edit'); }}><Pencil size={14}/> Editar y aprobar</button><button className="button secondary" disabled={busy} onClick={() => setMode('discard')}><Trash2 size={14}/> Descartar</button></>}
      <button className="button secondary" onClick={async () => onToast((await copyText(shown)) ? 'Texto copiado al portapapeles.' : 'No se pudo copiar el texto.')}><Copy size={14}/> Copiar texto</button>
    </div>}
  </article>;
}

/** Tarjeta del Dashboard con B-3.1 y acceso al panel. */
export function BuyerDashboardCard() {
  const block = useBlock('buyer/kpis');
  const k = (block.data?.kpis || []).find((x: Obj) => x.code === 'B-3.1');
  return <a className="metric-card bp-dash-card" href="/buyers"><div className="metric-icon purple"><Megaphone size={22}/></div><p>Conversión a LEADS (B-3.1)</p><strong>{k ? fmt(k.value, '%') : '—'}</strong><small>{k ? <StatusChip status={k.status}/> : block.loading ? 'Consultando...' : (block.error || 'Sin datos')} <span className="bp-dash-link">Panel del agente <ArrowRight size={12}/></span></small></a>;
}
