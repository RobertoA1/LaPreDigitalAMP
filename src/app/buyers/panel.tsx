'use client';
import { Suspense, useCallback, useMemo, useState } from 'react';
import AgentBar, { MiniStatus } from './agent-bar';
import { BuyerContext, TABS, useBlock, useUrlState, type BuyerCtx, type TabKey } from './hooks';
import { TabLink } from './tab-link';
import TabAgente from './tab-agente';
import TabAnalisis from './tab-analisis';
import TabPropuestas from './tab-propuestas';
import TabReglas from './tab-reglas';
import TabResumen from './tab-resumen';
import { Toast } from './ui';

/** Contenedor de la página Buyers: barra del agente, pestañas con URL propia y filtros globales en la URL. */
export default function BuyerPanel({ role }: { role: string }) {
  return <Suspense fallback={<div className="loading">Cargando panel...</div>}><Panel role={role} /></Suspense>;
}

function Panel({ role }: { role: string }) {
  const url = useUrlState();
  const [mensaje, setMensaje] = useState('');
  const cerrar = useCallback(() => setMensaje(''), []);
  const { from, to } = url.filters;
  const rangoInvalido = !!(from && to && from > to);

  // KPI, tendencia, desgloses: solo al montar, al cambiar filtros o al actualizar (nunca por eventos en vivo ni por intervalo).
  const kpis = useBlock(rangoInvalido ? null : `buyer/kpis${url.qs ? `?${url.qs}` : ''}`);
  // Lo vivo reacciona a `amp-live` (con antirrebote) y tiene un respaldo lento para el latido del worker.
  const agent = useBlock('buyer/agent', { live: true, intervalMs: 15000 });

  const ctx: BuyerCtx = useMemo(() => ({
    role, puedeEditar: role === 'ADMIN' || role === 'DIRECCION', agent, kpis, filters: url.filters, setFilters: url.setFilters,
    hrefFor: url.hrefFor, go: url.go, search: url.search, toast: setMensaje
  }), [role, agent, kpis, url.filters, url.setFilters, url.hrefFor, url.go, url.search]);

  const contador: Partial<Record<TabKey, number>> = {
    propuestas: Number(agent.data?.pendingProposals ?? 0), resumen: (agent.data?.alerts || []).length
  };
  const etiqueta: Partial<Record<TabKey, string>> = { propuestas: 'por revisar', resumen: 'avisos' };

  return <BuyerContext.Provider value={ctx}><div className="bp">
    <Toast message={mensaje} onClose={cerrar} />
    <AgentBar />
    <nav className="bp-tabs" aria-label="Secciones de Buyers"><ul>
      {TABS.map(t => <li key={t.key}><TabLink tab={t.key} className={url.tab === t.key ? 'on' : ''} aria-current={url.tab === t.key ? 'page' : undefined}>
        {t.label}{contador[t.key] ? <b className="bp-badge" title={`${contador[t.key]} ${etiqueta[t.key]}`} aria-label={`, ${contador[t.key]} ${etiqueta[t.key]}`}>{contador[t.key]}</b> : null}</TabLink></li>)}
    <li><MiniStatus /></li>
    </ul></nav>
    {url.tab === 'resumen' && <TabResumen />}
    {url.tab === 'analisis' && <TabAnalisis />}
    {url.tab === 'agente' && <TabAgente />}
    {url.tab === 'propuestas' && <TabPropuestas />}
    {url.tab === 'reglas' && <TabReglas />}
  </div></BuyerContext.Provider>;
}
