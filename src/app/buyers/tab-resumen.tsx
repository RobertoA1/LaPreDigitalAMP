'use client';
import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Bell, Check, Minus, Settings2 } from 'lucide-react';
import { fmt, int, lima, num2, post, textoNiveles, type Obj } from './api';
import FilterBar from './filters';
import { useBlock, useBuyer } from './hooks';
import { TabLink } from './tab-link';
import { Empty, Msg, Section, Spinner, StaleNote, StatusChip, Tag } from './ui';

export default function TabResumen() {
  return <>
    <FilterBar />
    <AlertsSection />
    <Kpis />
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
// KPI del periodo
// ---------------------------------------------------------------------------
function Kpis() {
  const { kpis } = useBuyer();
  const rules = useBlock('buyer/rules'); // solo para saber qué niveles no son los de fábrica
  const personalizadas = new Map<string, boolean>();
  for (const r of (rules.data?.rules || []) as Obj[]) if (r.category === 'SEMAFORO') personalizadas.set(String(r.code).replace(/^SEM_/, ''), r.isDefault === false);
  const m = Msg({ block: kpis, what: 'KPI' });
  if (m) return <Section eyebrow="INDICADORES" title="KPI del periodo">{m}</Section>;
  const list: Obj[] = kpis.data?.kpis || [];
  if (!list.length) return <Section eyebrow="INDICADORES" title="KPI del periodo"><Empty>El DataMart aún no tiene datos para el periodo.</Empty></Section>;
  return <Section eyebrow="INDICADORES" title="KPI del periodo">
    <StaleNote block={kpis} what="los KPI" />
    <div className="bp-kpis" aria-busy={kpis.loading}>
      {[...list].sort((a, b) => String(a.code).localeCompare(String(b.code))).map(k =>
        <KpiCard key={k.code} k={k} custom={personalizadas.get(k.code)} />
      )}
    </div>
  </Section>;
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
    <small className="bp-kpi-frac">{k.denominator > 0 ? <>{k.unit === 'S/' ? `S/ ${num2(k.numerator)}` : int(k.numerator)} / {int(k.denominator)}{k.code === 'B-1.2' ? ' LEADs nuevos' : ''}</> : 'No aplicable'}</small>
    {v && <small className={`bp-var ${mejor ? 'mejor' : peor ? 'peor' : ''}`}>
      {sube ? <ArrowUpRight size={13} aria-hidden="true" /> : baja ? <ArrowDownRight size={13} aria-hidden="true" /> : <Minus size={13} aria-hidden="true" />}
      {sube ? '+' : ''}{num2(v.delta)} {unidad} frente al periodo anterior{v.prev != null ? ` (${fmt(v.prev, k.unit)})` : ''}</small>}
    <small className="bp-kpi-th">{textoNiveles(k.thresholds, k.unit)}
      {custom && <TabLink tab="reglas" extra={{ regla: `SEM_${k.code}` }} className="bp-custom"><Settings2 size={11} aria-hidden="true" /> Niveles personalizados</TabLink>}</small>
  </article>;
}
