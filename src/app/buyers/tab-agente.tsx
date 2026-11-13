'use client';
import { useState } from 'react';
import { Check, Circle, Megaphone, Video } from 'lucide-react';
import { duracion, lima, post, textoNiveles, type Obj } from './api';
import { ACT_NOMBRE, DISPARADOR, ESTADO_AGENTE, PASOS, PASO_CORTO, PASO_TEXTO, logDe } from './agent-meta';
import { useBlock, useBuyer, useNow, type Block } from './hooks';
import { TabLink } from './tab-link';
import { Empty, Msg, Section, Spinner, Tag } from './ui';

export default function TabAgente() {
  const { agent } = useBuyer();
  const runs = useBlock('buyer/runs', { live: true, intervalMs: 60000 });
  return <>
    <EnCurso />
    <Lanzar onLaunched={() => { agent.refresh(); runs.refresh(); }} />
    <Historial runs={runs} />
  </>;
}

// ---------------------------------------------------------------------------
// Ejecución en curso: línea de tiempo en vivo
// ---------------------------------------------------------------------------
function EnCurso() {
  const { agent } = useBuyer();
  const activities: Obj[] = agent.data?.activities || [];
  const activas = activities.filter(a => a.currentRun || a.state === 'EJECUTANDO' || a.state === 'EN_COLA');
  const now = useNow(activas.length > 0);
  return <Section eyebrow="EN VIVO" title="Ejecución en curso">
    {!agent.data ? <Msg block={agent} what="el estado del agente" unavailable="El servidor aún no expone el estado del agente." /> :
      activas.length ? <div className="bp-live">{activas.map(a => <LiveRun key={a.activity} a={a} now={now} />)}</div>
        : <Empty>El agente está en reposo: no hay ninguna ejecución en curso. Lanza una abajo o espera a la próxima automática.</Empty>}
  </Section>;
}

function LiveRun({ a, now }: { a: Obj; now: number }) {
  const run: Obj = a.currentRun || {};
  const est = ESTADO_AGENTE[a.state] || ESTADO_AGENTE.EJECUTANDO;
  const paso = String(run.step || 'COLA');
  const idx = Math.max(0, PASOS.indexOf(paso as (typeof PASOS)[number]));
  const log = logDe(run);
  const inicio = run.startedAt || run.stepStartedAt;
  return <article className="bp-liverun" aria-live="polite">
    <div className="bp-liverun-head"><h4>{ACT_NOMBRE[a.activity]}{run.id ? ` · ejecución #${run.id}` : ''}</h4>
      <span className={`bp-state ${est.cls}`}>{est.icon}<b>{est.label}</b>{inicio && <span>· {duracion(now - new Date(inicio).getTime())} en total</span>}</span></div>
    <ol className="bp-steps" aria-label="Pasos de la ejecución">
      {PASOS.map((p, i) => {
        const estado = i < idx ? 'hecho' : i === idx ? 'actual' : 'pendiente';
        return <li key={p} className={estado} aria-current={estado === 'actual' ? 'step' : undefined}>
          <span className="bp-step-dot">{estado === 'hecho' ? <Check size={13} aria-hidden="true" /> : estado === 'actual' ? <Spinner size={13} /> : <Circle size={9} aria-hidden="true" />}</span>
          <b>{PASO_CORTO[p]}</b><small>{estado === 'actual' ? PASO_TEXTO[p] : estado === 'hecho' ? 'listo' : 'pendiente'}</small></li>;
      })}
    </ol>
    <Log items={log} empty="Aún no hay registro: la ejecución acaba de empezar." />
  </article>;
}

function Log({ items, empty }: { items: ReturnType<typeof logDe>; empty?: string }) {
  if (!items.length) return empty ? <p className="muted">{empty}</p> : null;
  return <ol className="bp-log" aria-label="Registro de la ejecución">{items.map((l, i) => <li key={i}>
    <time dateTime={l.at}>{lima(l.at)}</time><Tag tone="light">{PASO_CORTO[l.step] || l.step}</Tag><span>{l.message}</span></li>)}</ol>;
}

// ---------------------------------------------------------------------------
// Lanzar con indicaciones opcionales
// ---------------------------------------------------------------------------
function Lanzar({ onLaunched }: { onLaunched: () => void }) {
  const { agent, toast } = useBuyer();
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState('');
  const workerOff = !!agent.data && !agent.data.worker?.alive;
  const activities: Obj[] = agent.data?.activities || [];
  const enCurso = (act: string) => ['EN_COLA', 'EJECUTANDO'].includes(activities.find(a => a.activity === act)?.state);
  async function lanzar(activity: 'B1' | 'B2') {
    setOcupado(activity);
    try {
      await post('buyer/run', { activity, ...(texto.trim() ? { instructions: texto.trim() } : {}) });
      toast(`${ACT_NOMBRE[activity]} en cola${workerOff ? ', pero el worker está detenido: no empezará hasta que se inicie' : '. Las propuestas aparecerán como borradores'}.`);
      onLaunched();
    } catch (err) { toast(`No se pudo lanzar: ${(err as Error).message}`); }
    finally { setOcupado(''); }
  }
  return <Section eyebrow="MANUAL" title="Lanzar una ejecución">
    <p className="muted">El agente solo genera borradores y recomendaciones: nada se publica solo ni se contacta a nadie. Las directrices activas de <TabLink tab="reglas" className="text-link">Reglas</TabLink> se aplican siempre.</p>
    <label className="bp-field">Indicaciones opcionales para esta ejecución (máx. 500 caracteres)
      <textarea maxLength={500} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Ej. Enfatiza el seguimiento académico para apoderados." /><small>{texto.length}/500</small></label>
    <div className="bp-actions">
      <button className="button primary" disabled={!!ocupado || enCurso('B1')} onClick={() => lanzar('B1')}>{ocupado === 'B1' ? <Spinner /> : <Megaphone size={15} />} {enCurso('B1') ? 'B-1 ya está en curso' : 'Generar propuestas de publicaciones (B-1)'}</button>
      <button className="button primary" disabled={!!ocupado || enCurso('B2')} onClick={() => lanzar('B2')}>{ocupado === 'B2' ? <Spinner /> : <Video size={15} />} {enCurso('B2') ? 'B-2 ya está en curso' : 'Analizar video y guion (B-2)'}</button>
    </div>
  </Section>;
}

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------
const RUN_STATUS: Record<string, [string, string]> = { PENDING: ['En cola', 'light'], RUNNING: ['En proceso', 'purple'], DONE: ['Terminada', 'teal'], FAILED: ['Fallida', 'orange'] };

function Historial({ runs }: { runs: Block }) {
  const list: Obj[] = runs.data?.runs || [];
  const m = Msg({ block: runs, what: 'ejecuciones', unavailable: 'El servidor aún no expone las ejecuciones del agente.' });
  return <Section eyebrow="HISTORIAL" title="Ejecuciones recientes" right={<Tag tone="light">{list.length}</Tag>}>
    {m || (list.length ? <ul className="bp-runs">{list.map(r => <Run key={r.id} r={r} />)}</ul> : <p className="muted">Aún no hay ejecuciones. Usa los botones de arriba para iniciar una.</p>)}
  </Section>;
}

function Run({ r }: { r: Obj }) {
  const [label, tone] = RUN_STATUS[r.status] || [r.status, 'light'];
  const log = logDe(r);
  const reglas = r.context?.reglas;
  const dur = r.finishedAt && r.createdAt ? duracion(new Date(r.finishedAt).getTime() - new Date(r.createdAt).getTime()) : null;
  return <li className="bp-run">
    <div className="bp-run-head">
      <strong>#{r.id} · {ACT_NOMBRE[r.activity] || r.activity}</strong><Tag tone={tone}>{label}</Tag>
      <span>{DISPARADOR[r.trigger] || r.trigger}</span>
      <span>{r.provider ? `${r.provider}${r.model ? ` · ${r.model}` : ''}` : 'Proveedor pendiente'}</span>
      <span>{lima(r.createdAt, true)}{dur ? ` · ${dur}` : ''}</span>
      <TabLink tab="propuestas" extra={{ run: String(r.id) }} className="text-link bp-run-link">Ver sus propuestas{r.proposals != null ? ` (${r.proposals})` : ''}</TabLink>
    </div>
    {r.provider === 'PLANTILLA' && <p className="bp-warn" role="alert">Generado con plantilla: IA no disponible.{r.error ? ` Motivo: ${r.error}` : ''}</p>}
    {r.status === 'FAILED' && r.error && r.provider !== 'PLANTILLA' && <p className="error">{r.error}</p>}
    {r.instructions && <small className="muted">Indicaciones: {r.instructions}</small>}
    {(log.length > 0 || r.analysis || reglas) ? <details>
      <summary>Ver registro, análisis y reglas aplicadas</summary>
      {log.length > 0 && <><h5>Registro</h5><Log items={log} /></>}
      {r.analysis && <><h5>Análisis</h5><p className="bp-pre">{r.analysis}</p></>}
      {reglas && <><h5>Reglas aplicadas en esta ejecución</h5><ReglasAplicadas reglas={reglas} /></>}
    </details> : r.status === 'PENDING' || r.status === 'RUNNING' ? <small className="muted">Procesando...</small> : null}
  </li>;
}

const corto = (v: unknown): string => {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = JSON.stringify(v);
  return s.length > 220 ? `${s.slice(0, 217)}...` : s;
};
const activa = (r: Obj | undefined, texto: string) => (r?.activo === false ? 'Desactivada' : texto);
/** Describe la instantánea de reglas que el servidor guardó en el contexto de la ejecución (`context.reglas`). */
function describirReglas(r: Obj): Array<[string, string]> {
  const filas: Array<[string, string]> = [];
  if (r.version) filas.push(['Versión de las reglas', String(r.version)]);
  if (r.semaforos) filas.push(['Niveles de semáforo', Object.entries(r.semaforos as Obj).map(([k, t]) => `${k}: ${textoNiveles(t as Obj, k === 'B-1.2' ? 'S/' : '%')}`).join(' · ')]);
  if (r.prohibidos) { const l: Obj[] = r.prohibidos.terminos || []; filas.push(['Términos prohibidos', activa(r.prohibidos, `${l.length}: ${l.map(t => t.etiqueta).join(', ')}`)]); }
  if (r.pilares) filas.push(['Pilares', activa(r.pilares, `${(r.pilares.pilares || []).map((p: Obj) => p.nombre).join(', ')} (mínimo ${r.pilares.minimo ?? 1})`)]);
  if (r.llamado) filas.push(['Llamado a la landing', activa(r.llamado, 'Obligatorio en cada publicación')]);
  if (r.evidencia) filas.push(['Evidencia numérica', activa(r.evidencia, 'Obligatoria en cada recomendación')]);
  if (r.cobertura) {
    const c = r.cobertura as Obj;
    const atr = c.atribucion ? `atribución: ${c.atribucion.activo === false ? 'desactivada' : c.atribucion.cuando === 'ROJO' ? 'si B-1.1 está en rojo' : 'si B-1.1 no está en verde'}` : '';
    filas.push(['Cobertura', [c.publicos && `públicos: ${c.publicos.join(', ')}`, c.canales && `canales: ${c.canales.join(', ')}`, c.guiones != null && `${c.guiones} guiones`, c.llamados != null && `${c.llamados} llamados`, c.maxVideos != null && `hasta ${c.maxVideos} videos`, atr].filter(Boolean).join(' · ')]);
  }
  const d: Obj[] = Array.isArray(r.directrices) ? r.directrices : [];
  filas.push(['Directrices de usuario', d.length ? d.map(x => `«${x.texto}» (${x.aplicaA})`).join(' · ') : 'Ninguna']);
  return filas;
}
function ReglasAplicadas({ reglas }: { reglas: unknown }) {
  const items: Array<[string, string]> = reglas && typeof reglas === 'object' && !Array.isArray(reglas) ? describirReglas(reglas as Obj) : [['Reglas', corto(reglas)]];
  return <ul className="bp-rules-snap">{items.map(([k, v], i) => <li key={i}><b>{k}</b><span>{v}</span></li>)}</ul>;
}
