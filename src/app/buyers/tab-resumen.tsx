'use client';
import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Bell, Check, Minus, Settings2 } from 'lucide-react';
import { ACTIVIDAD, fmt, int, lima, num2, post, textoNiveles, type Obj } from './api';
import { ACT_NOMBRE } from './agent-meta';
import FilterBar from './filters';
import { useBlock, useBuyer } from './hooks';
import { TabLink } from './tab-link';
import { Empty, Msg, Section, Spinner, StaleNote, StatusChip, Tag } from './ui';

export default function TabResumen() {
  return <>
    <FilterBar />
    <AlertsSection />
    <KpiGroups />
    <Realtime />
  </>;
}

// ---------------------------------------------------------------------------
// Avisos abiertos (reglas ALERTA)
// ---------------------------------------------------------------------------
const ACCION: Record<string, string> = { AVISAR: 'Solo avisar', EJECUTAR_B1: 'Ejecutar B-1', EJECUTAR_B2: 'Ejecutar B-2' };
function AlertsSection() {
  const { agent, toast } = useBuyer();
  const [ocupado, setOcupado] = useState<number | null>(null);
  const alerts: Obj[] = agent.data?.alerts || [];
  async function visto(id: number) {
    setOcupado(id);
    try { await post('buyer/alert/ack', { id }); agent.refresh(); toast('Aviso marcado como visto.'); }
    catch (err) { toast(`No se pudo marcar el aviso: ${(err as Error).message}`); }
    finally { setOcupado(null); }
  }
  return <Section id="avisos" eyebrow="REGLAS DE ALERTA" title="Avisos abiertos" right={<Tag tone={alerts.length ? 'orange' : 'light'}>{alerts.length}</Tag>}>
    {!agent.data ? <Msg block={agent} what="avisos" unavailable="El servidor aún no expone los avisos del agente." /> :
      alerts.length ? <ul className="bp-alerts">{alerts.map(a => <li key={a.id}>
        <Bell size={16} aria-hidden="true" />
        <div><strong>{a.message || `KPI ${a.kpi} fuera de nivel`}</strong>
          <small>{a.kpi ? `${a.kpi}` : ''}{a.value != null ? ` · valor ${num2(Number(a.value))}` : ''} · {lima(a.createdAt, true)} (Lima)</small></div>
        {a.action && <Tag tone={a.action === 'AVISAR' ? 'light' : 'purple'}>{ACCION[a.action] || a.action}</Tag>}
        {a.runId && <TabLink tab="agente" className="text-link">Ejecución #{a.runId}</TabLink>}
        <button className="button secondary" disabled={ocupado === a.id} onClick={() => visto(a.id)}>{ocupado === a.id ? <Spinner /> : <Check size={13} />} Marcar como visto</button>
      </li>)}</ul>
        : <p className="muted">No hay avisos abiertos. Los avisos nacen de las reglas de alerta definidas en <TabLink tab="reglas" className="text-link">Reglas</TabLink>.</p>}
  </Section>;
}

// ---------------------------------------------------------------------------
// KPI por actividad
// ---------------------------------------------------------------------------
function KpiGroups() {
  const { kpis } = useBuyer();
  const rules = useBlock('buyer/rules'); // solo para saber qué niveles no son los de fábrica
  const personalizadas = new Map<string, boolean>();
  for (const r of (rules.data?.rules || []) as Obj[]) if (r.category === 'SEMAFORO') personalizadas.set(String(r.code).replace(/^SEM_/, ''), r.isDefault === false);
  const m = Msg({ block: kpis, what: 'KPI' });
  if (m) return <Section eyebrow="INDICADORES" title="KPI del periodo">{m}</Section>;
  const list: Obj[] = kpis.data?.kpis || [];
  if (!list.length) return <Section eyebrow="INDICADORES" title="KPI del periodo"><Empty>El DataMart aún no tiene datos para el periodo.</Empty></Section>;
  return <div className="bp-kpi-groups" aria-busy={kpis.loading}>
    <StaleNote block={kpis} what="los KPI" />
    {(['B1', 'B2', 'B3'] as const).map(act => {
      const items = list.filter(k => k.activity === act);
      if (!items.length) return null;
      return <section key={act} aria-label={ACTIVIDAD[act].titulo}>
        <div className="bp-group-head"><h3>{ACTIVIDAD[act].titulo}</h3><small>{ACTIVIDAD[act].pista}</small>
          {act !== 'B3' && <small className="bp-group-agent">Lo gestiona el agente · {ACT_NOMBRE[act]}</small>}</div>
        <div className="bp-kpis">{items.map(k => <KpiCard key={k.code} k={k} custom={personalizadas.get(k.code)} />)}</div>
      </section>;
    })}
  </div>;
}

/** Variación frente al periodo anterior, si el servidor la entrega (`previous` o `delta`). */
function variacion(k: Obj) {
  const prev = k.previous ?? k.previousValue ?? null;
  const delta = k.delta ?? (prev != null && k.value != null ? k.value - prev : null);
  if (delta == null || !Number.isFinite(delta)) return null;
  return { prev: prev as number | null, delta: delta as number };
}
function KpiCard({ k, custom }: { k: Obj; custom?: boolean }) {
  const v = variacion(k);
  const sube = v ? v.delta > 0.005 : false, baja = v ? v.delta < -0.005 : false;
  const mejor = k.thresholds?.direction === 'LOWER_BETTER' ? baja : sube;
  const peor = k.thresholds?.direction === 'LOWER_BETTER' ? sube : baja;
  const unidad = k.unit === 'S/' ? 'S/' : 'pp';
  return <article className={`panel bp-kpi ${(k.status || 'SIN_DATOS') === 'SIN_DATOS' ? 'sin' : String(k.status).toLowerCase()}`}>
    <div className="bp-kpi-top"><Tag tone="purple">{k.code}</Tag><StatusChip status={k.status} /></div>
    <p className="bp-kpi-name">{k.name}</p>
    <strong className="bp-kpi-value">{fmt(k.value, k.unit)}</strong>
    <small className="bp-kpi-frac">{k.denominator > 0 ? <>{k.unit === 'S/' ? `S/ ${num2(k.numerator)}` : int(k.numerator)} / {int(k.denominator)}{k.code === 'B-1.2' ? ' LEADs nuevos' : ''}</> : 'Denominador 0: sin datos'}</small>
    {v && <small className={`bp-var ${mejor ? 'mejor' : peor ? 'peor' : ''}`}>
      {sube ? <ArrowUpRight size={13} aria-hidden="true" /> : baja ? <ArrowDownRight size={13} aria-hidden="true" /> : <Minus size={13} aria-hidden="true" />}
      {sube ? '+' : ''}{num2(v.delta)} {unidad} frente al periodo anterior{v.prev != null ? ` (${fmt(v.prev, k.unit)})` : ''}</small>}
    <small className="bp-kpi-th">{textoNiveles(k.thresholds, k.unit)}
      {custom && <TabLink tab="reglas" extra={{ regla: `SEM_${k.code}` }} className="bp-custom"><Settings2 size={11} aria-hidden="true" /> Niveles personalizados</TabLink>}</small>
  </article>;
}

// ---------------------------------------------------------------------------
// Hoy en tiempo real (OLTP) y notificaciones de inscripciones
// ---------------------------------------------------------------------------
const FORM_STATES: Record<string, string> = { VALIDO: 'Válido', DUPLICADO: 'Duplicado', INVALIDO: 'Inválido', REVISION: 'En revisión', DESCONOCIDO: 'Desconocido' };
const toneForm = (s: string) => (s === 'VALIDO' ? 'teal' : s === 'REVISION' ? 'orange' : 'light');
function Realtime() {
  const block = useBlock('buyer/realtime', { live: true, intervalMs: 60000 });
  const d = block.data, t = d?.today;
  const notes: Obj[] = d?.notifications || [];
  const m = Msg({ block, what: 'actividad de hoy' });
  return <Section eyebrow="OLTP · HOY EN TIEMPO REAL" title="Hoy en tiempo real" right={<span className="muted tiny">Última actividad: {lima(d?.lastActivityAt, true)} (Lima)</span>}>
    {m || <>
      <div className="bp-today">
        <div><span>Visitas</span><strong>{int(t?.visitas)}</strong><small>{int(t?.visitasConCampana)} con campaña</small></div>
        <div><span>Reproducciones</span><strong>{int(t?.reproducciones)}</strong></div>
        <div><span>Conversión</span><strong>{t?.conversion == null ? '—' : `${num2(t.conversion)} %`}</strong><small>válidos + duplicados / visitas</small></div>
        <div><span>Formularios por estado</span><div className="bp-forms">{Object.keys(FORM_STATES).filter(k => k !== 'DESCONOCIDO').map(k => <Tag key={k} tone={toneForm(k)}>{FORM_STATES[k]}: {int(t?.formularios?.[k] ?? 0)}</Tag>)}</div></div>
      </div>
      <h4>Notificaciones de inscripciones en vivo</h4>
      {notes.length ? <ul className="bp-notes">{notes.map(n => <li key={n.id}>
        <strong>Formulario #{n.formId}</strong><Tag tone={toneForm(n.formStatus)}>{FORM_STATES[n.formStatus] || n.formStatus}</Tag>
        <span>{n.channel || 'Canal sin identificar'}</span><span>{n.campaignName || 'Sin campaña'}</span><span>{lima(n.occurredAt || n.receivedAt, true)}</span>
        <Tag tone={n.verified ? 'teal' : 'orange'}>{n.verified ? 'Verificada en el OLTP' : 'No verificada'}</Tag></li>)}</ul>
        : <p className="muted">Aún no llegan notificaciones de inscripciones.</p>}
    </>}
  </Section>;
}
