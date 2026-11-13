'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { ESTADO_KPI } from './api';
import type { Block } from './hooks';

export function Tag({ children, tone = 'light' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

/** Estado de semáforo: color + símbolo + texto (no depende solo del color). */
export function StatusChip({ status }: { status: string }) {
  const s = ESTADO_KPI[status] || ESTADO_KPI.SIN_DATOS;
  return <span className={`bp-st ${s.cls}`}><i aria-hidden="true">{s.icono}</i>{s.label}</span>;
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <Loader2 size={size} className="bp-spin" aria-hidden="true" />;
}

export function Empty({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return <div className="empty">{icon || <Sparkles size={28} />}<p>{children}</p></div>;
}

/**
 * Estados de carga / vacío / error de un bloque. Devuelve null cuando hay datos que mostrar.
 * `unavailable` explica un 404 (ruta aún no disponible en el servidor).
 */
export function Msg({ block, what, unavailable }: { block: Block<any>; what: string; unavailable?: string }) {
  if (block.data) return null;
  if (block.loading) return <div className="loading" role="status"><Spinner /> Cargando {what}...</div>;
  const text = block.status === 404 && unavailable ? unavailable : block.error || 'Sin datos';
  return <div className="empty" role="alert"><AlertTriangle size={28} /><p>{text}</p>
    <button className="button secondary" onClick={block.refresh}><RefreshCw size={13} /> Reintentar</button></div>;
}

/** Aviso inline cuando hay datos pero la última actualización falló. */
export function StaleNote({ block, what }: { block: Block<any>; what: string }) {
  if (!block.data || !block.error) return null;
  return <p className="error" role="alert">No se pudo actualizar {what}: {block.error}</p>;
}

export function Section({ eyebrow, title, right, children, className = '', id }: {
  eyebrow?: string; title: string; right?: React.ReactNode; children: React.ReactNode; className?: string; id?: string;
}) {
  return <section id={id} className={`panel bp-section ${className}`}>
    <div className="panel-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h3>{title}</h3></div>{right}</div>
    {children}
  </section>;
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => { if (!message) return; const t = setTimeout(onClose, 6000); return () => clearTimeout(t); }, [message, onClose]);
  return message ? <div className="notice" role="status" aria-live="polite">{message}</div> : null;
}

/** Diálogo modal accesible (`<dialog>`): foco atrapado, Esc cierra. */
export function Dialog({ open, title, onClose, children, actions }: {
  open: boolean; title: string; onClose: () => void; children: React.ReactNode; actions: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return <dialog ref={ref} className="bp-dialog" onClose={onClose} onCancel={onClose} aria-labelledby="bp-dialog-title">
    {open && <div className="bp-dialog-body">
      <h3 id="bp-dialog-title">{title}</h3>
      <div>{children}</div>
      <div className="bp-actions">{actions}</div>
    </div>}
  </dialog>;
}

/** Interruptor de dos o más opciones (grupo de radio visual). */
export function Segmented<T extends string>({ label, value, options, onChange, disabled, busy }: {
  label: string; value: T; options: Array<{ value: T; label: string; icon?: React.ReactNode }>; onChange: (v: T) => void; disabled?: boolean; busy?: boolean;
}) {
  return <div className="bp-seg" role="radiogroup" aria-label={label} aria-busy={busy}>
    {options.map(o => <button key={o.value} type="button" role="radio" aria-checked={value === o.value} disabled={disabled || busy}
      className={value === o.value ? 'on' : ''} onClick={() => value !== o.value && onChange(o.value)}>{o.icon}{o.label}</button>)}
  </div>;
}

/** Casilla tipo interruptor. */
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <label className="bp-toggle"><input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} /><span>{label}</span></label>;
}

// ---------------------------------------------------------------------------
// Tabla ordenable por columna
// ---------------------------------------------------------------------------
export type Col<R> = {
  key: string; label: string; align?: 'right';
  /** Valor para ordenar; por defecto `row[key]`. */
  sort?: (row: R) => number | string | null | undefined;
  render?: (row: R) => React.ReactNode;
};
export function SortTable<R extends Record<string, any>>({ cols, rows, rowKey, initial, footer, caption, empty }: {
  cols: Col<R>[]; rows: R[]; rowKey: (row: R) => string | number; initial?: { key: string; dir: 'asc' | 'desc' };
  footer?: Record<string, React.ReactNode>; caption: string; empty?: string;
}) {
  const [sort, setSort] = useState(initial || null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = cols.find(c => c.key === sort.key); if (!col) return rows;
    const val = (r: R) => (col.sort ? col.sort(r) : r[col.key]);
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1; // los vacíos siempre al final
      if (y == null) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es')) * factor;
    });
  }, [rows, cols, sort]);
  if (!rows.length) return <p className="muted">{empty || 'Sin datos.'}</p>;
  const toggle = (key: string) => setSort(s => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={caption}>
    <table className="bp-table"><caption className="bp-sr">{caption}</caption>
      <thead><tr>{cols.map(c => {
        const on = sort?.key === c.key;
        return <th key={c.key} scope="col" className={c.align === 'right' ? 'r' : ''} aria-sort={on ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
          <button type="button" className="bp-th" onClick={() => toggle(c.key)}>{c.label}
            {on ? (sort!.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="faint" />}</button>
        </th>;
      })}</tr></thead>
      <tbody>{sorted.map(r => <tr key={rowKey(r)}>{cols.map(c => <td key={c.key} className={c.align === 'right' ? 'r' : ''}>{c.render ? c.render(r) : String(r[c.key] ?? '—')}</td>)}</tr>)}</tbody>
      {footer && <tfoot><tr>{cols.map((c, i) => <td key={c.key} className={c.align === 'right' ? 'r' : ''}>{footer[c.key] ?? (i === 0 ? 'Total' : '')}</td>)}</tr></tfoot>}
    </table>
  </div>;
}
