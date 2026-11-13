'use client';
import { fechaCorta, type Obj } from './api';
import { useBuyer } from './hooks';

/** Filtros globales (periodo, canal, campaña, video). Viven en la URL: se conservan al cambiar de pestaña y se pueden compartir. */
export default function FilterBar() {
  const { kpis, filters, setFilters } = useBuyer();
  const d = kpis.data;
  const lists = d?.filters || { canales: [], campanas: [], videos: [] };
  const { from, to } = filters;
  const invalido = !!(from && to && from > to);
  const activos = (Object.values(filters) as string[]).some(Boolean);
  return <form className="panel bp-filters" role="search" aria-label="Filtros globales" onSubmit={e => e.preventDefault()}>
    <label>Desde<input type="date" value={from || d?.period?.from || ''} max={to || d?.period?.to || undefined} onChange={e => setFilters({ from: e.target.value })} /></label>
    <label>Hasta<input type="date" value={to || d?.period?.to || ''} min={from || d?.period?.from || undefined} onChange={e => setFilters({ to: e.target.value })} /></label>
    <label>Canal<select value={filters.canal} onChange={e => setFilters({ canal: e.target.value })}><option value="">Todos</option>
      {lists.canales.map((c: Obj) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}</select></label>
    <label>Campaña<select value={filters.campana} onChange={e => setFilters({ campana: e.target.value })}><option value="">Todas</option>
      {lists.campanas.map((c: Obj) => <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>)}</select></label>
    <label>Video<select value={filters.video} onChange={e => setFilters({ video: e.target.value })}><option value="">Todos</option>
      {lists.videos.map((v: Obj) => <option key={v.id} value={v.id}>{v.nombre} {v.version}</option>)}</select></label>
    <button type="button" className="button secondary" disabled={!activos} onClick={() => setFilters({ from: '', to: '', canal: '', campana: '', video: '' })}>Restablecer</button>
    <p className="bp-legend">{d?.lastLoad?.fechaDatos ? <>Datos del DataMart al <b>{fechaCorta(d.lastLoad.fechaDatos)}</b></> : kpis.loading ? 'Consultando DataMart...' : 'Sin fecha de datos del DataMart'}</p>
    {invalido && <p className="error" role="alert">La fecha inicial no puede ser posterior a la final.</p>}
  </form>;
}
