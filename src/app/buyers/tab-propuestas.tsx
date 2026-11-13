'use client';
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Pencil, Search, Trash2, X } from 'lucide-react';
import { CANALES, PUBLICOS, copyText, evidenceLines, lima, post, type Obj } from './api';
import { ACT_NOMBRE } from './agent-meta';
import { useBlock, useBuyer, useDebounced } from './hooks';
import { Dialog, Empty, Msg, Section, Spinner, StaleNote, Tag } from './ui';

const KINDS: Record<string, string> = { PUBLICACION: 'Publicación', GUION: 'Guion', LLAMADO: 'Llamado al formulario', RECOMENDACION: 'Recomendación' };
const ESTADOS: Record<string, [string, string]> = { DRAFT: ['Borrador', 'orange'], APPROVED: ['Aprobada', 'teal'], DISCARDED: ['Descartada', 'neutral'] };
const MAX_LOTE = 50;

type Filtro = { status: string; activity: string; kind: string; audience: string; channel: string; q: string; page: number; pageSize: number };
const FILTRO0: Filtro = { status: 'DRAFT', activity: '', kind: '', audience: '', channel: '', q: '', page: 1, pageSize: 20 };

export default function TabPropuestas() {
  const { search, setFilters, toast, agent } = useBuyer();
  const runId = search.get('run') || '';
  const [f, setF] = useState<Filtro>(FILTRO0);
  const [agrupar, setAgrupar] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const q = useDebounced(f.q, 400).trim();
  const upd = (patch: Partial<Filtro>) => setF(prev => ({ ...prev, page: 1, ...patch }));

  const path = useMemo(() => {
    const p = new URLSearchParams();
    for (const k of ['status', 'activity', 'kind', 'audience', 'channel'] as const) if (f[k]) p.set(k, f[k]);
    if (q) p.set('q', q);
    if (runId) p.set('runId', runId);
    p.set('page', String(f.page)); p.set('pageSize', String(f.pageSize));
    return `buyer/proposals?${p.toString()}`;
  }, [f.status, f.activity, f.kind, f.audience, f.channel, f.page, f.pageSize, q, runId]);
  const block = useBlock(path, { live: true, intervalMs: 60000 });
  useEffect(() => { setSel(new Set()); }, [path]);

  const items: Obj[] = block.data?.proposals || [];
  const total: number = block.data?.total ?? items.length;
  const counts: Obj = block.data?.counts || {};
  const paginas = Math.max(1, Math.ceil(total / f.pageSize));
  const borradores = items.filter(p => p.status === 'DRAFT');
  const m = Msg({ block, what: 'propuestas', unavailable: 'El servidor aún no expone la bandeja de propuestas.' });

  function alternar(id: number) { setSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else if (n.size < MAX_LOTE) n.add(id); return n; }); }
  const todasMarcadas = borradores.length > 0 && borradores.every(p => sel.has(p.id));
  function marcarVisibles(on: boolean) { setSel(on ? new Set(borradores.slice(0, MAX_LOTE).map(p => p.id)) : new Set()); }
  function agruparPorEjecucion() {
    const g = new Map<number, Obj[]>();
    for (const p of items) { const k = Number(p.runId) || 0; g.set(k, [...(g.get(k) || []), p]); }
    return [...g.entries()];
  }
  const alResolver = () => { block.refresh(); agent.refresh(); };

  return <>
    <Section eyebrow="BANDEJA" title="Propuestas del agente" right={<Tag tone="light">{total}</Tag>}>
      <div className="bp-statusbar" role="group" aria-label="Estado">
        {([['DRAFT', 'Por revisar'], ['APPROVED', 'Aprobadas'], ['DISCARDED', 'Descartadas'], ['', 'Todas']] as const).map(([k, label]) =>
          <button key={k || 'todas'} className={`bp-chipbtn ${f.status === k ? 'on' : ''}`} aria-pressed={f.status === k} onClick={() => upd({ status: k })}>
            {label}{k && counts[k] != null ? <b>{counts[k]}</b> : null}</button>)}
      </div>
      <div className="bp-proposal-filters">
        <label className="bp-grow">Buscar<span className="search bp-search"><Search size={15} aria-hidden="true" /><input type="search" placeholder="Título, contenido o justificación" value={f.q} onChange={e => upd({ q: e.target.value })} /></span></label>
        <label>Actividad<select value={f.activity} onChange={e => upd({ activity: e.target.value })}><option value="">Todas</option><option value="B1">B-1 Publicaciones</option><option value="B2">B-2 Video y guion</option></select></label>
        <label>Tipo<select value={f.kind} onChange={e => upd({ kind: e.target.value })}><option value="">Todos</option>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Público<select value={f.audience} onChange={e => upd({ audience: e.target.value })}><option value="">Todos</option>{Object.entries(PUBLICOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Canal<select value={f.channel} onChange={e => upd({ channel: e.target.value })}><option value="">Todos</option>{CANALES.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
      </div>
      {runId && <p className="bp-runfilter"><Tag tone="purple">Solo la ejecución #{runId}</Tag>
        <button className="button secondary" onClick={() => setFilters({ run: '' })}><X size={12} /> Quitar filtro</button></p>}
      <div className="bp-bulkbar" role="toolbar" aria-label="Acciones en bloque">
        <label className="bp-check"><input type="checkbox" checked={todasMarcadas} disabled={!borradores.length} onChange={e => marcarVisibles(e.target.checked)} /> Seleccionar borradores visibles</label>
        <label className="bp-check"><input type="checkbox" checked={agrupar} onChange={e => setAgrupar(e.target.checked)} /> Agrupar por ejecución</label>
        <BulkActions ids={[...sel]} onDone={() => { setSel(new Set()); alResolver(); }} toast={toast} />
      </div>
      <StaleNote block={block} what="la bandeja" />
      {m || (items.length ? <div aria-busy={block.loading}>
        {agrupar ? agruparPorEjecucion().map(([rid, lista]) => <div key={rid} className="bp-group">
          <h4>Ejecución #{rid || '—'} · {ACT_NOMBRE[lista[0]?.activity] || ''} <small>{lima(lista[0]?.createdAt, true)} · {lista.length} en esta página</small></h4>
          <div className="bp-proposals">{lista.map(p => <Card key={p.id} p={p} marcada={sel.has(p.id)} onMarcar={() => alternar(p.id)} onDone={alResolver} />)}</div></div>)
          : <div className="bp-proposals">{items.map(p => <Card key={p.id} p={p} marcada={sel.has(p.id)} onMarcar={() => alternar(p.id)} onDone={alResolver} />)}</div>}
      </div> : <Empty>No hay propuestas con estos filtros.</Empty>)}
      {block.data && <nav className="bp-pager" aria-label="Paginación">
        <button className="button secondary" disabled={f.page <= 1} onClick={() => setF(p => ({ ...p, page: p.page - 1 }))}><ChevronLeft size={14} /> Anterior</button>
        <span>Página {f.page} de {paginas} · {total} propuestas</span>
        <button className="button secondary" disabled={f.page >= paginas} onClick={() => setF(p => ({ ...p, page: p.page + 1 }))}>Siguiente <ChevronRight size={14} /></button>
        <label>Por página<select value={f.pageSize} onChange={e => upd({ pageSize: Number(e.target.value) })}>{[10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      </nav>}
    </Section>
  </>;
}

// ---------------------------------------------------------------------------
// Acciones en bloque
// ---------------------------------------------------------------------------
function BulkActions({ ids, onDone, toast }: { ids: number[]; onDone: () => void; toast: (m: string) => void }) {
  const [modo, setModo] = useState<'' | 'aprobar' | 'descartar'>('');
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  async function decidir() {
    setOcupado(true);
    try {
      const r = await post('buyer/proposals/decide-many', { ids, decision: modo === 'aprobar' ? 'APPROVED' : 'DISCARDED', ...(motivo.trim() ? { reason: motivo.trim() } : {}) });
      const hechas: number = Array.isArray(r?.decided) ? r.decided.length : ids.length;
      const omitidas: Obj[] = Array.isArray(r?.skipped) ? r.skipped : [];
      const motivoOmitida: Record<string, string> = { NO_ENCONTRADA: 'no existe', YA_DECIDIDA: 'ya estaba decidida', PROHIBIDO: 'contiene términos prohibidos vigentes: edítala antes de aprobarla' };
      const detalle = omitidas.slice(0, 3).map(o => `#${o.id} (${motivoOmitida[o.reason] || o.reason})`).join('; ');
      toast(`${hechas} ${hechas === 1 ? 'propuesta' : 'propuestas'} ${modo === 'aprobar' ? 'aprobadas' : 'descartadas'}${omitidas.length ? `; ${omitidas.length} omitidas: ${detalle}${omitidas.length > 3 ? '…' : ''}` : ''}.${modo === 'aprobar' && hechas ? ' Recuerda publicarlas manualmente.' : ''}`);
      setModo(''); setMotivo(''); onDone();
    } catch (err) { toast(`No se pudo decidir en bloque: ${(err as Error).message}`); }
    finally { setOcupado(false); }
  }
  return <div className="bp-bulk-actions">
    <span aria-live="polite">{ids.length ? `${ids.length} seleccionadas` : 'Ninguna seleccionada'}{ids.length >= MAX_LOTE ? ` (máximo ${MAX_LOTE})` : ''}</span>
    <button className="button primary" disabled={!ids.length} onClick={() => setModo('aprobar')}><Check size={14} /> Aprobar seleccionadas</button>
    <button className="button secondary" disabled={!ids.length} onClick={() => setModo('descartar')}><Trash2 size={14} /> Descartar seleccionadas</button>
    <Dialog open={!!modo} onClose={() => setModo('')} title={modo === 'aprobar' ? `Aprobar ${ids.length} propuestas` : `Descartar ${ids.length} propuestas`}
      actions={<><button className="button primary" disabled={ocupado} onClick={decidir}>{ocupado ? <Spinner /> : modo === 'aprobar' ? <Check size={14} /> : <Trash2 size={14} />} Confirmar</button>
        <button className="button secondary" onClick={() => setModo('')}>Cancelar</button></>}>
      {modo === 'aprobar'
        ? <p>Se marcarán como aprobadas {ids.length} propuestas. Aprobar no publica nada: tendrás que publicarlas manualmente.</p>
        : <label className="bp-field">Motivo del descarte (opcional)<input value={motivo} maxLength={300} onChange={e => setMotivo(e.target.value)} /></label>}
    </Dialog>
  </div>;
}

// ---------------------------------------------------------------------------
// Tarjeta compacta de propuesta
// ---------------------------------------------------------------------------
function Card({ p, marcada, onMarcar, onDone }: { p: Obj; marcada: boolean; onMarcar: () => void; onDone: () => void }) {
  const { toast } = useBuyer();
  const [abierta, setAbierta] = useState(false);
  const [modo, setModo] = useState<'' | 'edit' | 'discard'>('');
  const shown: string = p.editedContent || p.content || '';
  const [texto, setTexto] = useState(shown);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [st, tone] = ESTADOS[p.status] || [p.status, 'light'];
  const ev = evidenceLines(p.evidence);
  const borrador = p.status === 'DRAFT';

  async function decidir(decision: 'APPROVED' | 'DISCARDED', extra: Obj = {}) {
    setOcupado(true);
    try { await post('buyer/proposal/decide', { id: p.id, decision, ...extra }); toast(decision === 'APPROVED' ? 'Propuesta aprobada. Recuerda publicarla manualmente.' : 'Propuesta descartada.'); setModo(''); onDone(); }
    catch (err) { toast((err as Error).message); } finally { setOcupado(false); }
  }
  return <article className={`bp-proposal ${marcada ? 'sel' : ''} ${borrador ? '' : 'cerrada'}`}>
    <div className="bp-prop-head">
      {borrador ? <input type="checkbox" checked={marcada} onChange={onMarcar} aria-label={`Seleccionar «${p.title}»`} /> : <span className="bp-check-gap" />}
      <div className="bp-prop-main">
        <div className="bp-prop-tags"><Tag tone={tone}>{st}</Tag><Tag tone="purple">{KINDS[p.kind] || p.kind}</Tag><Tag>{p.activity === 'B1' ? 'B-1' : 'B-2'}</Tag>
          {p.audience && <Tag>{PUBLICOS[p.audience] || p.audience}</Tag>}{p.channel && <Tag>{p.channel}</Tag>}
          {p.campaignType && <Tag>{p.campaignType === 'PAGADA' ? 'Pagada' : 'Orgánica'}</Tag>}{p.recommendationType && <Tag>{p.recommendationType}</Tag>}
          {p.editedContent && <Tag tone="teal">Editada</Tag>}<span className="bp-prop-id">#{p.id}{p.runId ? ` · ejecución #${p.runId}` : ''}</span></div>
        <h4>{p.title}</h4>
        {!abierta && <p className="bp-prop-preview">{shown}</p>}
      </div>
      <button className="button secondary bp-icon-btn" aria-expanded={abierta} aria-label={abierta ? 'Contraer propuesta' : 'Ver contenido completo'} onClick={() => setAbierta(a => !a)}>{abierta ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
    </div>
    {abierta && <div className="bp-prop-body">
      <p className="bp-pre">{shown}</p>
      {p.rationale && <p className="bp-rationale"><b>Justificación:</b> {p.rationale}</p>}
      {ev.length > 0 && <div className="bp-evidence"><b>Evidencia</b><ul>{ev.map((l, i) => <li key={i}>{l}</li>)}</ul></div>}
      {!borrador && <small className="muted">{p.status === 'APPROVED' ? 'Aprobada' : 'Descartada'}{p.decidedBy ? ` por ${p.decidedBy}` : ''}{p.decidedAt ? ` · ${lima(p.decidedAt, true)}` : ''}{p.decisionReason ? ` · ${p.decisionReason}` : ''}</small>}
    </div>}
    {modo === 'edit' && <div className="bp-editor"><label>Texto final<textarea rows={8} value={texto} maxLength={4000} onChange={e => setTexto(e.target.value)} /></label>
      <div className="bp-actions"><button className="button primary" disabled={ocupado || !texto.trim()} onClick={() => decidir('APPROVED', { editedContent: texto.trim() })}>{ocupado ? <Spinner /> : <Check size={14} />} Guardar y aprobar</button><button className="button secondary" onClick={() => setModo('')}>Cancelar</button></div></div>}
    {modo === 'discard' && <div className="bp-editor"><label>Motivo del descarte (opcional)<input value={motivo} maxLength={300} onChange={e => setMotivo(e.target.value)} /></label>
      <div className="bp-actions"><button className="button primary" disabled={ocupado} onClick={() => decidir('DISCARDED', motivo.trim() ? { reason: motivo.trim() } : {})}>{ocupado ? <Spinner /> : <Trash2 size={14} />} Confirmar descarte</button><button className="button secondary" onClick={() => setModo('')}>Cancelar</button></div></div>}
    {!modo && <div className="bp-actions bp-prop-actions">
      {borrador && <><button className="button primary" disabled={ocupado} onClick={() => decidir('APPROVED')}><Check size={14} /> Aprobar</button>
        <button className="button secondary" disabled={ocupado} onClick={() => { setTexto(shown); setAbierta(true); setModo('edit'); }}><Pencil size={14} /> Editar y aprobar</button>
        <button className="button secondary" disabled={ocupado} onClick={() => setModo('discard')}><Trash2 size={14} /> Descartar</button></>}
      <button className="button secondary" onClick={async () => toast((await copyText(shown)) ? 'Texto copiado al portapapeles.' : 'No se pudo copiar el texto.')}><Copy size={14} /> Copiar</button>
    </div>}
  </article>;
}
