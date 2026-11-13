'use client';
import { useEffect, useState } from 'react';
import { fechaCorta, type Obj } from './api';
import { useBuyer } from './hooks';

/** Filtros globales (periodo, canal, campaña, video). Viven en la URL: se conservan al cambiar de pestaña y se pueden compartir. */
export default function FilterBar() {
  const { kpis, filters, setFilters } = useBuyer();
  const d = kpis.data;
  const lists = d?.filters || { canales: [], campanas: [], videos: [] };
  const { from, to } = filters;
  const defaultFrom = from || d?.period?.from || '';
  const defaultTo = to || d?.period?.to || '';
  const [fechaDesde, setFechaDesde] = useState(defaultFrom);
  const [fechaHasta, setFechaHasta] = useState(defaultTo);
  useEffect(() => { setFechaDesde(defaultFrom); }, [defaultFrom]);
  useEffect(() => { setFechaHasta(defaultTo); }, [defaultTo]);

  const mesesDisponibles = new Set<string>();
  for (const r of (d?.trend || []) as Obj[]) {
    const digits = String(r.mes ?? '').replace(/\D/g, '');
    if (digits.length !== 6) continue;
    const year = digits.slice(0, 4), month = digits.slice(4);
    if (Number(month) >= 1 && Number(month) <= 12) mesesDisponibles.add(`${year}-${month}`);
  }
  const meses = [...mesesDisponibles].sort();
  const mesSeleccionado = from && to && from.slice(0, 7) === to.slice(0, 7)
    && from.endsWith('-01')
    && Number(to.slice(8)) === new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)), 0)).getUTCDate()
    ? from.slice(0, 7) : '';
  const invalido = !!(from && to && from > to);
  const activos = (Object.values(filters) as string[]).some(Boolean);
  function seleccionarMes(mes: string) {
    if (!mes) return;
    const [year, month] = mes.split('-').map(Number);
    const ultimoDia = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const nuevoDesde = `${mes}-01`, nuevoHasta = `${mes}-${String(ultimoDia).padStart(2, '0')}`;
    setFechaDesde(nuevoDesde);
    setFechaHasta(nuevoHasta);
    setFilters({ from: nuevoDesde, to: nuevoHasta });
  }
  function etiquetaMes(mes: string) {
    const nombre = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${mes}-01T00:00:00Z`));
    return nombre.charAt(0).toLocaleUpperCase('es-PE') + nombre.slice(1);
  }
  return <form className="panel bp-filters" role="search" aria-label="Filtros globales" onSubmit={e => e.preventDefault()}>
    <label>Mes<select aria-label="Filtrar por mes" value={mesSeleccionado} onChange={e => seleccionarMes(e.target.value)}>
      <option value="">Elegir un mes</option>
      {meses.map(mes => <option key={mes} value={mes}>{etiquetaMes(mes)}</option>)}
    </select></label>
    <label>Desde<input type="date" value={fechaDesde} max={fechaHasta || d?.period?.to || undefined}
      onChange={e => setFechaDesde(e.target.value)}
      onBlur={() => setFilters({ from: fechaDesde })}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setFilters({ from: fechaDesde }); } }} /></label>
    <label>Hasta<input type="date" value={fechaHasta} min={fechaDesde || d?.period?.from || undefined}
      onChange={e => setFechaHasta(e.target.value)}
      onBlur={() => setFilters({ to: fechaHasta })}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setFilters({ to: fechaHasta }); } }} /></label>
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
