'use client';
import { ArrowRight, Megaphone } from 'lucide-react';
import { fmt } from './api';
import { useBlock } from './hooks';
import { StatusChip } from './ui';

/** Tarjeta del Dashboard con B-3.1 y acceso al panel de Buyers. */
export default function BuyerDashboardCard() {
  const block = useBlock('buyer/kpis');
  const k = (block.data?.kpis || []).find((x: Record<string, any>) => x.code === 'B-3.1');
  return <a className="metric-card bp-dash-card" href="/buyers">
    <div className="metric-icon purple"><Megaphone size={22} /></div><p>Conversión a LEADS (B-3.1)</p>
    <strong>{k ? fmt(k.value, '%') : '—'}</strong>
    <small>{k ? <StatusChip status={k.status} /> : block.loading ? 'Consultando...' : block.error || 'Sin datos'} <span className="bp-dash-link">Panel del agente <ArrowRight size={12} /></span></small>
  </a>;
}
