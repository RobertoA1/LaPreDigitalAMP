'use client';
import { useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Search } from 'lucide-react';
import { ESTADO_KPI, KPI_CODES, KPI_NOMBRES, estadoDe, fmt, int, num2, type Obj } from './api';
import FilterBar from './filters';
import { useBlock, useBuyer, useDebounced } from './hooks';
import { Empty, Msg, Section, SortTable, StaleNote, type Col } from './ui';
import { TabLink } from './tab-link';
import { leerPeriodo } from './period-reading';

export default function TabAnalisis() {
  const { kpis } = useBuyer();
  const lectura = kpis.data ? leerPeriodo(kpis.data.kpis || []) : null;
  return <>
    <FilterBar />
    <StaleNote block={kpis} what="el análisis" />
    <Section eyebrow="LECTURA DEL PERIODO" title="Lectura del periodo">
      {lectura ? <div className="bp-grid-2">
          <div><h4>Qué pasó</h4><p>{lectura.quePaso}</p></div>
          <div><h4>Qué hacer</h4><p>{lectura.queHacer}</p></div>
          <div><h4>Qué acción tomar</h4><p>{lectura.queAccion}{lectura.abrirAgente && <> <TabLink tab="agente" className="text-link">Abrir Agente</TabLink></>}</p></div>
        </div> : <Msg block={kpis} what="la lectura del período" />}
    </Section>
    <div className="bp-grid-2">
      <Trend />
      <Abandonment />
    </div>
    <Desgloses />
  </>;
}

// ---------------------------------------------------------------------------
// Tendencia mensual
// ---------------------------------------------------------------------------
function Trend() {
  const { kpis } = useBuyer();
  const [code, setCode] = useState<string>('B-3.1');
  const kpi: Obj | undefined = (kpis.data?.kpis || []).find((k: Obj) => k.code === code);
  const unit = kpi?.unit || (code === 'B-1.2' ? 'S/' : '%');
  const rows = (kpis.data?.trend || []).map((r: Obj) => ({ mes: String(r.mes), value: r[code] ?? null }));
  const m = Msg({ block: kpis, what: 'tendencia' });
  const hayDatos = rows.some((r: Obj) => r.value != null);
  const th = kpi?.thresholds;
  return <Section eyebrow="TENDENCIA MENSUAL" title="Evolución de un KPI" right={
    <select aria-label="KPI de la tendencia" value={code} onChange={e => setCode(e.target.value)}>
      {KPI_CODES.map(c => <option key={c} value={c}>{c} · {KPI_NOMBRES[c]}</option>)}</select>}>
    {m || (!hayDatos ? <Empty>Sin datos mensuales para este KPI con los filtros actuales.</Empty> :
      <div className="bp-chart" role="img" aria-label={`Tendencia mensual de ${code}`}><ResponsiveContainer width="100%" height={260}>
        <LineChart data={rows} margin={{ left: 0, right: 14, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#edf0f6" />
          <XAxis dataKey="mes" tick={{ fill: '#68758a', fontSize: 11 }} />
          <YAxis width={56} tick={{ fill: '#68758a', fontSize: 11 }} tickFormatter={(v: number) => (unit === 'S/' ? `S/${v}` : `${v}%`)} />
          <Tooltip formatter={(v: any) => [fmt(Number(v), unit), code]} />
          {th && <ReferenceLine y={th.yellow} stroke="#e0a21b" strokeDasharray="4 4" label={{ value: 'amarillo', fontSize: 10, fill: '#7d5200', position: 'insideTopRight' }} />}
          {th && <ReferenceLine y={th.green} stroke="#1aa37f" strokeDasharray="4 4" label={{ value: 'verde', fontSize: 10, fill: '#0f7358', position: 'insideTopRight' }} />}
          <Line type="monotone" dataKey="value" name={code} stroke="#7656df" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
        </LineChart></ResponsiveContainer></div>)}
  </Section>;
}

// ---------------------------------------------------------------------------
// Curva de abandono (OLTP)
// ---------------------------------------------------------------------------
function Abandonment() {
  const { kpis, filters } = useBuyer();
  const videos: Obj[] = kpis.data?.filters?.videos || [];
  const [sel, setSel] = useState('');
  const masVisto = [...(kpis.data?.byVideo || [])].sort((a: Obj, b: Obj) => (b.reproducciones || 0) - (a.reproducciones || 0))[0];
  const current = sel || filters.video || (masVisto ? String(masVisto.videoId) : videos[0] ? String(videos[0].id) : '');
  const period = kpis.data?.period;
  const path = current && period?.from && period?.to ? `buyer/abandonment?video=${current}&from=${period.from}&to=${period.to}` : null;
  const block = useBlock(path);
  const d = block.data;
  const dur = Number(d?.duracionSeg) || 0;
  const rows = (d?.curve || []).map((p: Obj) => ({ pct: p.pct, alcanzan: d.total > 0 ? Math.round((p.alcanzan / d.total) * 10000) / 100 : 0, conversion: p.conversion }));
  const mc = d?.mayorCaida;
  const seg = (pct: number) => (dur ? ` (${Math.round((pct * dur) / 100)} s)` : '');
  return <Section eyebrow="VIDEO · B-2" title="Curva de abandono" right={
    <select aria-label="Video de la curva" value={current} onChange={e => setSel(e.target.value)} disabled={!videos.length}>
      {videos.length ? videos.map(v => <option key={v.id} value={v.id}>{v.nombre} {v.version}</option>) : <option value="">Sin videos</option>}</select>}>
    {!path ? (kpis.data ? <Empty>No hay videos o periodo disponibles para la curva.</Empty> : <Msg block={kpis} what="curva" />) : <>
      {Msg({ block, what: 'curva de abandono' }) || (!d.total ? <Empty>Este video no tiene reproducciones en el periodo.</Empty> : <>
        <div className="bp-chart" role="img" aria-label="Curva de abandono del video"><ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={rows} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#edf0f6" />
            <XAxis dataKey="pct" tickFormatter={(v: number) => `${v}%`} tick={{ fill: '#68758a', fontSize: 11 }} />
            <YAxis yAxisId="l" domain={[0, 100]} width={40} tickFormatter={(v: number) => `${v}%`} tick={{ fill: '#68758a', fontSize: 11 }} />
            <YAxis yAxisId="r" orientation="right" width={40} tickFormatter={(v: number) => `${v}%`} tick={{ fill: '#68758a', fontSize: 11 }} />
            <Tooltip labelFormatter={(v: any) => `Tramo ${v} % del video`} formatter={(v: any, name: any) => [v == null ? 'Sin datos' : `${num2(Number(v))} %`, name]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {mc && <ReferenceArea yAxisId="l" x1={mc.desdePct} x2={mc.hastaPct} fill="#d64545" fillOpacity={0.14} stroke="#d64545" strokeDasharray="3 3" label={{ value: 'Mayor caída', fontSize: 10, fill: '#b3261e', position: 'insideTop' }} />}
            <Area yAxisId="l" type="monotone" dataKey="alcanzan" name="% que alcanzan el tramo" stroke="#3f84ed" fill="#3f84ed33" />
            <Line yAxisId="r" type="monotone" dataKey="conversion" name="% conversión en el tramo" stroke="#ff6b57" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
          </ComposedChart></ResponsiveContainer></div>
        <p className="bp-callout">{mc ? <><b>Mayor caída:</b> entre el {mc.desdePct} %{seg(mc.desdePct)} y el {mc.hastaPct} %{seg(mc.hastaPct)} del video se pierden {int(mc.perdida)} reproducciones ({num2(mc.perdidaPct)} % del total de {int(d.total)}).</> : 'No se detecta una caída relevante en el periodo.'}</p>
      </>)}</>}
  </Section>;
}

// ---------------------------------------------------------------------------
// Desgloses ordenables
// ---------------------------------------------------------------------------
function KpiCell({ kpis, code, value }: { kpis: Obj[]; code: string; value: number | null | undefined }) {
  const k = kpis.find(x => x.code === code);
  const st = estadoDe(k?.thresholds, value);
  const e = ESTADO_KPI[st];
  return <span className={`bp-cell ${e.cls}`} title={e.label}><i aria-hidden="true">{e.icono}</i>{value == null ? '—' : fmt(value, k?.unit || '%')}<span className="bp-sr"> {e.label}</span></span>;
}

function Desgloses() {
  const { kpis } = useBuyer();
  const d = kpis.data;
  const lista: Obj[] = d?.kpis || [];
  const global = (code: string) => lista.find(k => k.code === code)?.value ?? null;
  const m = Msg({ block: kpis, what: 'desgloses' });
  if (m) return <Section eyebrow="DESGLOSES" title="Por canal, campaña y video">{m}</Section>;
  return <>
    <PorCanal rows={d.byCanal || []} lista={lista} global={global} />
    <PorCampana rows={d.byCampana || []} lista={lista} />
    <PorVideo rows={d.byVideo || []} lista={lista} global={global} />
  </>;
}

function PorCanal({ rows, lista, global }: { rows: Obj[]; lista: Obj[]; global: (c: string) => number | null }) {
  const cols: Col<Obj>[] = [
    { key: 'canal', label: 'Canal', render: r => r.canalNombre || r.canal, sort: r => r.canalNombre || r.canal },
    { key: 'visitas', label: 'Visitas', align: 'right', render: r => int(r.visitas) },
    ...KPI_CODES.map<Col<Obj>>(c => ({ key: c, label: c, align: 'right', render: r => <KpiCell kpis={lista} code={c} value={r[c]} /> }))
  ];
  const footer: Record<string, React.ReactNode> = { canal: 'Total del periodo', visitas: int(rows.reduce((s, r) => s + (r.visitas || 0), 0)) };
  for (const c of KPI_CODES) footer[c] = <KpiCell kpis={lista} code={c} value={global(c)} />;
  return <Section eyebrow="DESGLOSE" title="Por canal"><SortTable caption="KPI por canal" cols={cols} rows={rows} rowKey={r => r.canal} footer={footer} initial={{ key: 'visitas', dir: 'desc' }} empty="Sin datos por canal." /></Section>;
}

function PorCampana({ rows, lista }: { rows: Obj[]; lista: Obj[] }) {
  const [q, setQ] = useState('');
  const qd = useDebounced(q, 200).trim().toLowerCase();
  const visibles = useMemo(() => rows.filter(r => !qd || `${r.campana} ${r.tipo}`.toLowerCase().includes(qd)), [rows, qd]);
  const cols: Col<Obj>[] = [
    { key: 'campana', label: 'Campaña' }, { key: 'tipo', label: 'Tipo' },
    { key: 'visitas', label: 'Visitas', align: 'right', render: r => int(r.visitas) },
    { key: 'leadsNuevos', label: 'Leads nuevos', align: 'right', render: r => int(r.leadsNuevos) },
    { key: 'costo', label: 'Costo', align: 'right', render: r => fmt(r.costo, 'S/') },
    { key: 'costoPorLead', label: 'Costo por lead', align: 'right', render: r => (r.costoPorLead == null ? '—' : <KpiCell kpis={lista} code="B-1.2" value={r.costoPorLead} />) }
  ];
  const sum = (k: string, f: Obj[] = visibles) => f.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const pagadas = visibles.filter(r => r.costoPorLead != null || String(r.tipo).toUpperCase().includes('PAGAD'));
  const leadsPag = sum('leadsNuevos', pagadas);
  const footer = { campana: `Total (${visibles.length} campañas)`, visitas: int(sum('visitas')), leadsNuevos: int(sum('leadsNuevos')), costo: fmt(sum('costo'), 'S/'),
    costoPorLead: leadsPag > 0 ? <KpiCell kpis={lista} code="B-1.2" value={Math.round((sum('costo', pagadas) / leadsPag) * 100) / 100} /> : '—' };
  return <Section eyebrow="DESGLOSE" title="Por campaña" right={
    <label className="search bp-search"><Search size={15} aria-hidden="true" /><input type="search" aria-label="Buscar campaña" placeholder="Buscar campaña o tipo" value={q} onChange={e => setQ(e.target.value)} /></label>}>
    <SortTable caption="KPI por campaña" cols={cols} rows={visibles} rowKey={r => r.campanaId} footer={footer} initial={{ key: 'visitas', dir: 'desc' }}
      empty={rows.length ? 'Ninguna campaña coincide con la búsqueda.' : 'Sin campañas con visitas en el periodo.'} />
  </Section>;
}

function PorVideo({ rows, lista, global }: { rows: Obj[]; lista: Obj[]; global: (c: string) => number | null }) {
  const cols: Col<Obj>[] = [
    { key: 'video', label: 'Video', render: r => <>{r.video} <small>{r.version}</small></> },
    { key: 'duracionSeg', label: 'Duración', align: 'right', render: r => (r.duracionSeg == null ? '—' : `${r.duracionSeg} s`) },
    { key: 'reproducciones', label: 'Reproducciones', align: 'right', render: r => int(r.reproducciones) },
    ...(['B-2.1', 'B-2.2', 'B-2.3'] as const).map<Col<Obj>>(c => ({ key: c, label: c, align: 'right', render: r => <KpiCell kpis={lista} code={c} value={r[c]} /> }))
  ];
  const footer: Record<string, React.ReactNode> = { video: 'Total del periodo', reproducciones: int(rows.reduce((s, r) => s + (r.reproducciones || 0), 0)) };
  for (const c of ['B-2.1', 'B-2.2', 'B-2.3']) footer[c] = <KpiCell kpis={lista} code={c} value={global(c)} />;
  return <Section eyebrow="DESGLOSE" title="Por video"><SortTable caption="KPI por video" cols={cols} rows={rows} rowKey={r => r.videoId} footer={footer} initial={{ key: 'reproducciones', dir: 'desc' }} empty="Sin datos por video." /></Section>;
}
