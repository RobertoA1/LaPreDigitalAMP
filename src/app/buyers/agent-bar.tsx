'use client';
import { useState } from 'react';
import { AlertTriangle, Bell, Bot, Hand, Inbox, Lock, Play, RefreshCw, Zap } from 'lucide-react';
import { duracion, fechaLima, haceCuanto, post, type Obj } from './api';
import { ACT_NOMBRE, DISPARADOR, ESTADO_AGENTE, pasoActual, textoLatido, workerEstado } from './agent-meta';
import { useBuyer, useNow } from './hooks';
import { TabLink } from './tab-link';
import { Dialog, Segmented, Spinner, Tag } from './ui';

const ACTIVIDADES = ['B1', 'B2'] as const;
type Act = (typeof ACTIVIDADES)[number];

/** Barra del agente: siempre visible. Muestra si el agente trabaja, qué hace y cuándo volverá a hacerlo. */
export default function AgentBar() {
  const { agent, puedeEditar, toast } = useBuyer();
  const d: Obj | null = agent.data;
  const activities: Obj[] = d?.activities || [];
  const activo = activities.some(a => a.state === 'EJECUTANDO' || a.state === 'EN_COLA');
  const now = useNow(true, activo ? 1000 : 5000);
  const worker = workerEstado(d, now);
  const [confirmar, setConfirmar] = useState<Act | null>(null);
  const [ocupado, setOcupado] = useState('');
  const canChange = puedeEditar && d?.canChangeMode !== false;

  async function cambiarModo(activity: Act, mode: 'AUTOMATICO' | 'MANUAL') {
    setOcupado(`modo-${activity}`);
    try {
      await post('buyer/agent/mode', { activity, mode });
      toast(`${ACT_NOMBRE[activity]}: ${mode === 'AUTOMATICO' ? 'Automático (cada semana)' : 'Manual (al pulsar Ejecutar)'} activado.`);
      agent.refresh();
    } catch (err) { toast(`No se pudo cambiar el modo: ${(err as Error).message}`); }
    finally { setOcupado(''); setConfirmar(null); }
  }
  async function ejecutar(activity: Act) {
    setOcupado(`run-${activity}`);
    try {
      await post('buyer/run', { activity });
      toast(worker.alive ? `${ACT_NOMBRE[activity]} en cola. Las propuestas aparecerán como borradores.` : `${ACT_NOMBRE[activity]} en cola, pero el worker está detenido: no empezará hasta que se inicie.`);
      agent.refresh();
    } catch (err) { toast(`No se pudo lanzar la ejecución: ${(err as Error).message}`); }
    finally { setOcupado(''); }
  }

  const pendientes = Number(d?.pendingProposals ?? 0);
  const avisos = (d?.alerts || []).length;
  return <section className="panel bp-agentbar" aria-label="Estado del agente de conversión">
    <div className="bp-ab-head">
      <div className="bp-ab-title"><Bot size={18} aria-hidden="true" /><strong>Agente Buyer → Lead</strong>
        <WorkerChip loading={agent.loading && !d} worker={worker} unknown={!d} />
      </div>
      <div className="bp-ab-counts">
        <TabLink tab="propuestas" className={`bp-count ${pendientes ? 'hot' : ''}`}><Inbox size={14} aria-hidden="true" /><b>{pendientes}</b> por revisar</TabLink>
        <TabLink tab="resumen" className={`bp-count ${avisos ? 'warn' : ''}`}><Bell size={14} aria-hidden="true" /><b>{avisos}</b> {avisos === 1 ? 'aviso' : 'avisos'}</TabLink>
        <button className="button secondary bp-icon-btn" onClick={agent.refresh} aria-label="Actualizar estado del agente" title="Actualizar"><RefreshCw size={14} /></button>
      </div>
    </div>
    {!d && !agent.loading && <p className="bp-ab-error" role="alert"><AlertTriangle size={14} /> {agent.status === 404 ? 'El servidor aún no expone el estado del agente.' : agent.error || 'Sin datos del agente.'}</p>}
    {d && !worker.alive && <p className="bp-ab-error" role="alert"><AlertTriangle size={14} aria-hidden="true" /> Detenido: el worker no está en ejecución. Las ejecuciones quedan en cola y las automáticas no se lanzan hasta que se inicie (<code>npm run worker</code>).</p>}
    {(d || agent.loading) && <div className="bp-ab-cards">
      {ACTIVIDADES.map(act => {
        const a = activities.find(x => x.activity === act) || { activity: act, mode: d?.mode?.[act] || 'MANUAL', state: 'EN_REPOSO' };
        return <ActivityCard key={act} a={a} now={now} workerOn={worker.alive} loading={!d}
          canChange={canChange} role={puedeEditar} ocupado={ocupado}
          onMode={m => (m === 'AUTOMATICO' ? setConfirmar(act) : cambiarModo(act, 'MANUAL'))} onRun={() => ejecutar(act)} />;
      })}
    </div>}
    <Dialog open={!!confirmar} onClose={() => setConfirmar(null)} title={`Pasar ${confirmar ? ACT_NOMBRE[confirmar] : ''} a Automático (cada semana)`}
      actions={<>
        <button className="button primary" disabled={!!ocupado} onClick={() => confirmar && cambiarModo(confirmar, 'AUTOMATICO')}>{ocupado ? <Spinner /> : <Zap size={14} />} Activar Automático (cada semana)</button>
        <button className="button secondary" onClick={() => setConfirmar(null)}>Cancelar</button></>}>
      <p>Con Automático (cada semana), el agente trabaja solo según el horario configurado en Reglas. También puede ejecutar las alertas configuradas:</p>
      <ul className="bp-list">
        <li>lanzará la ejecución semanal programada (día y hora de Lima definidos en <TabLink tab="reglas" onNavigate={() => setConfirmar(null)}>Reglas</TabLink>);</li>
        <li>lanzará las ejecuciones de las alertas cuya acción sea «ejecutar», respetando los días de enfriamiento.</li>
      </ul>
      <p className="muted">Las propuestas siguen naciendo como <b>borrador</b>: una persona debe aprobarlas. Nada se publica ni se envía solo. Puedes cambiar a Manual (al pulsar Ejecutar) cuando quieras.</p>
    </Dialog>
  </section>;
}

function WorkerChip({ worker, unknown, loading }: { worker: ReturnType<typeof workerEstado>; unknown: boolean; loading: boolean }) {
  if (loading) return <span className="bp-worker"><Spinner /> Consultando al worker...</span>;
  if (unknown) return <span className="bp-worker off">Estado desconocido</span>;
  return <span className={`bp-worker ${worker.alive ? 'on' : 'off'}`} role="status">
    <i aria-hidden="true" />{worker.alive ? 'Worker activo' : 'Worker detenido'}<small>{textoLatido(worker.ageMs)}</small></span>;
}

function ActivityCard({ a, now, workerOn, loading, canChange, role, ocupado, onMode, onRun }: {
  a: Obj; now: number; workerOn: boolean; loading: boolean; canChange: boolean; role: boolean; ocupado: string;
  onMode: (m: 'AUTOMATICO' | 'MANUAL') => void; onRun: () => void;
}) {
  const act = a.activity as Act;
  const est = ESTADO_AGENTE[a.state] || ESTADO_AGENTE.EN_REPOSO;
  const run: Obj | undefined = a.currentRun;
  const last: Obj | undefined = a.lastRun;
  const busy = a.state === 'EN_COLA' || a.state === 'EJECUTANDO';
  const { texto: paso } = pasoActual(run);
  const desde = run?.stepStartedAt || run?.startedAt;
  const mode: 'AUTOMATICO' | 'MANUAL' = a.mode === 'AUTOMATICO' ? 'AUTOMATICO' : 'MANUAL';
  const proximo = mode === 'AUTOMATICO' && a.nextRunAt
    ? <><b>{fechaLima(a.nextRunAt)}</b> (Lima){a.nextRunReason ? <> · {a.nextRunReason}</> : null}</>
    : mode === 'AUTOMATICO' ? <>Sin ejecución automática prevista{a.nextRunReason ? ` · ${a.nextRunReason}` : ''}</> : <b>Solo manual</b>;
  return <article className={`bp-act ${est.cls} ${mode === 'AUTOMATICO' ? 'auto' : ''}`} aria-label={ACT_NOMBRE[act]}>
    <div className="bp-act-top">
      <h4>{ACT_NOMBRE[act]}</h4>
      <span className={`bp-state ${est.cls}`} role="status">{est.icon}<b>{est.label}</b>
        {a.state === 'EJECUTANDO' && <span>· {paso}{desde ? ` · ${duracion(now - new Date(desde).getTime())}` : ''}</span>}
        {a.state === 'EN_COLA' && desde && <span>· hace {duracion(now - new Date(desde).getTime())}</span>}
      </span>
    </div>
    <div className="bp-act-mode">
      <Segmented label={`Modo de ${ACT_NOMBRE[act]}`} value={mode} disabled={!canChange || loading} busy={ocupado === `modo-${act}`} onChange={onMode}
        options={[{ value: 'AUTOMATICO', label: 'Automático (cada semana)', icon: <Zap size={14} aria-hidden="true" /> }, { value: 'MANUAL', label: 'Manual (al pulsar Ejecutar)', icon: <Hand size={14} aria-hidden="true" /> }]} />
      {!canChange && <small className="bp-lock"><Lock size={11} aria-hidden="true" /> {role ? 'No disponible ahora.' : 'Solo Administración o Dirección pueden cambiar el modo.'}</small>}
    </div>
    <dl className="bp-act-info">
      <div><dt>Última ejecución</dt><dd>{last ? <>
        {haceCuanto(last.finishedAt, now)} <Tag tone={last.status === 'FAILED' ? 'orange' : 'teal'}>{last.status === 'FAILED' ? 'Fallida' : 'Terminada'}</Tag>
        <small>{DISPARADOR[last.trigger] || last.trigger} · {last.provider ? `${last.provider}${last.model ? ` ${last.model}` : ''}` : 'sin proveedor'} · {last.proposals ?? 0} {last.proposals === 1 ? 'propuesta' : 'propuestas'}</small>
        {last.status === 'FAILED' && last.error && <small className="bp-err">{last.error}</small>}</> : 'Aún no se ha ejecutado'}</dd></div>
      <div><dt>Próxima ejecución automática</dt><dd>{proximo}</dd></div>
    </dl>
    <div className="bp-act-run">
      <button className="button primary" disabled={busy || loading || ocupado === `run-${act}`} onClick={onRun}>
        {busy || ocupado === `run-${act}` ? <Spinner /> : <Play size={14} aria-hidden="true" />} {busy ? (a.state === 'EN_COLA' ? 'En cola...' : 'Ejecutando...') : 'Ejecutar ahora'}</button>
      {!workerOn && !loading && !busy && <small className="bp-lock"><AlertTriangle size={11} aria-hidden="true" /> El worker está detenido: quedará en cola.</small>}
      {busy && <TabLink tab="agente" className="text-link">Ver en vivo</TabLink>}
    </div>
  </article>;
}
