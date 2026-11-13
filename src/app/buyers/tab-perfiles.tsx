'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { fechaLima, int, type Obj } from './api';
import { useBlock, useBuyer, useDebounced } from './hooks';
import PerfilDetalle, { Avance, EstadoForm, ESTADO_FORM, ROL_TEXTO, campanaTexto, rolTexto } from './perfil-detalle';
import { Empty, Msg, Section, Spinner, StaleNote } from './ui';

const PAGE_SIZE = 25;
const ESTADOS = Object.keys(ESTADO_FORM);

/** Perfiles de los buyers capturados por el formulario (lectura directa del OLTP; el AMP no guarda estos datos). */
export default function TabPerfiles() {
  const { search, setFilters, kpis, filters } = useBuyer();
  const estado = search.get('estado') || '', rol = search.get('rol') || '';
  const qUrl = search.get('q') || '', formulario = search.get('formulario') || '';
  const page = Math.max(1, Number(search.get('pag')) || 1);
  const [q, setQ] = useState(qUrl);
  const qd = useDebounced(q, 450).trim();
  const qEfectiva = qd.length >= 3 ? qd : '';
  // La búsqueda de texto solo se envía con 3 o más caracteres; se refleja en la URL para poder compartir la vista.
  useEffect(() => { if (qEfectiva !== qUrl) setFilters({ q: qEfectiva, pag: '' }); }, [qEfectiva]); // eslint-disable-line react-hooks/exhaustive-deps

  const path = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (estado) p.set('estado', estado);
    if (rol) p.set('rol', rol);
    if (qUrl) p.set('q', qUrl);
    for (const k of ['canal', 'campana', 'from', 'to'] as const) if (filters[k]) p.set(k, filters[k]);
    return `buyer/profiles?${p.toString()}`;
  }, [page, estado, rol, qUrl, filters]);
  // Se pide al montar, al cambiar filtros o página y al pulsar actualizar; nunca por eventos en vivo.
  const block = useBlock(path);
  const d: Obj | null = block.data;
  const rows: Obj[] = d?.profiles || [];
  const counts: Obj = d?.counts || {};
  const total = Number(d?.total ?? 0);
  const paginas = Math.max(1, Math.ceil(total / (d?.pageSize || PAGE_SIZE)));
  const lists = kpis.data?.filters || { canales: [], campanas: [] };
  const abierto = useRef<HTMLElement | null>(null);
  const abrir = (id: string | number, el?: HTMLElement | null) => { abierto.current = el || null; setFilters({ formulario: String(id) }); };
  const cerrar = () => { setFilters({ formulario: '' }); abierto.current?.focus(); };
  const hayFiltros = !!(estado || rol || qUrl || filters.canal || filters.campana || filters.from || filters.to);
  const m = Msg({ block, what: 'perfiles', unavailable: 'El servidor aún no expone los perfiles de buyers.' });

  return <>
    <Section eyebrow="BUYERS CAPTURADOS POR EL FORMULARIO" title="Perfiles" right={
      <button className="button secondary" onClick={block.refresh} disabled={block.loading}>{block.loading ? <Spinner /> : <RefreshCw size={14} />} Actualizar</button>}>
      <p className="bp-privacy"><ShieldCheck size={14} aria-hidden="true" /> Datos leídos del OLTP; el AMP no los guarda. Cada consulta de detalle queda registrada. Correo y teléfono se muestran enmascarados en la lista.</p>
      <div className="bp-countcards" role="group" aria-label="Filtrar por estado del formulario">
        <button className={`bp-countcard ${estado === '' ? 'on' : ''}`} aria-pressed={estado === ''} onClick={() => setFilters({ estado: '', pag: '' })}>
          <span>Todos</span><b>{d ? int(ESTADOS.reduce((s, k) => s + Number(counts[k] || 0), 0)) : '—'}</b></button>
        {ESTADOS.map(k => <button key={k} className={`bp-countcard ${estado === k ? 'on' : ''}`} aria-pressed={estado === k} onClick={() => setFilters({ estado: estado === k ? '' : k, pag: '' })}>
          <span><EstadoForm estado={k} /></span><b>{d ? int(counts[k] ?? 0) : '—'}</b></button>)}
      </div>
      <div className="bp-proposal-filters">
        <label className="bp-grow">Buscar<span className="search bp-search"><Search size={15} aria-hidden="true" />
          <input type="search" placeholder="Nombre, correo o teléfono (mín. 3 caracteres)" value={q} onChange={e => setQ(e.target.value)} /></span>
          {q.trim().length > 0 && q.trim().length < 3 && <small className="muted">Escribe al menos 3 caracteres para buscar.</small>}</label>
        <label>Rol<select value={rol} onChange={e => setFilters({ rol: e.target.value, pag: '' })}><option value="">Todos</option>{Object.entries(ROL_TEXTO).filter(([k]) => k !== 'POSTULANTE').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Canal<select value={filters.canal} onChange={e => setFilters({ canal: e.target.value, pag: '' })}><option value="">Todos</option>{(lists.canales || []).map((c: Obj) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}</select></label>
        <label>Campaña<select value={filters.campana} onChange={e => setFilters({ campana: e.target.value, pag: '' })}><option value="">Todas</option>{(lists.campanas || []).map((c: Obj) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
        <label>Desde<input type="date" value={filters.from} onChange={e => setFilters({ from: e.target.value, pag: '' })} /></label>
        <label>Hasta<input type="date" value={filters.to} onChange={e => setFilters({ to: e.target.value, pag: '' })} /></label>
        <button className="button secondary bp-end" disabled={!hayFiltros} onClick={() => { setQ(''); setFilters({ estado: '', rol: '', q: '', pag: '', canal: '', campana: '', from: '', to: '' }); }}>Restablecer</button>
      </div>
      <StaleNote block={block} what="la lista" />
      {m || (rows.length ? <div aria-busy={block.loading}>
        <div className="table-scroll" role="region" aria-label="Perfiles capturados" tabIndex={0}>
          <table className="bp-table bp-perfiles"><caption className="bp-sr">Perfiles de buyers capturados por el formulario</caption>
            <thead><tr><th scope="col">Nombre</th><th scope="col">Rol</th><th scope="col">Estado</th><th scope="col">Canal</th><th scope="col">Campaña</th><th scope="col">Avance del video</th><th scope="col">Enviado</th></tr></thead>
            <tbody>{rows.map(r => <tr key={r.idFormulario} className="bp-rowlink" onClick={e => abrir(r.idFormulario, e.currentTarget.querySelector('button'))}>
              <td><button className="bp-namebtn" onClick={e => { e.stopPropagation(); abrir(r.idFormulario, e.currentTarget); }}>{r.nombre || 'Sin nombre'}</button>
                <small>{r.correo || '—'} · {r.telefono || '—'}</small></td>
              <td>{rolTexto(r.rol)}</td><td><EstadoForm estado={r.estado} /></td><td>{r.canal || '—'}</td><td className="bp-wrap">{campanaTexto(r.campana)}</td>
              <td><Avance pct={r.avancePct} /></td><td>{fechaLima(r.enviadoEn)}</td></tr>)}</tbody>
          </table>
        </div>
        <nav className="bp-pager" aria-label="Paginación de perfiles">
          <button className="button secondary" disabled={page <= 1} onClick={() => setFilters({ pag: String(page - 1) })}><ChevronLeft size={14} /> Anterior</button>
          <span>Página {page} de {paginas} · {int(total)} perfiles</span>
          <button className="button secondary" disabled={page >= paginas} onClick={() => setFilters({ pag: String(page + 1) })}>Siguiente <ChevronRight size={14} /></button>
        </nav>
      </div> : <Empty>{hayFiltros ? 'Ningún perfil coincide con estos filtros.' : 'Aún no hay formularios capturados.'}</Empty>)}
    </Section>
    <PerfilDetalle id={formulario} onClose={cerrar} />
  </>;
}
