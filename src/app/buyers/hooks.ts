'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { api, type ApiError } from './api';

// ---------------------------------------------------------------------------
// Bloques de datos: cada bloque carga de forma independiente.
// - Una pestaña oculta no hace peticiones (se recupera al volver a verse).
// - Sin solapar peticiones y con AbortController.
// - `live`: recarga con antirrebote de 2 s al llegar `amp-live`. Solo para lo vivo (agente, ejecuciones, propuestas, tiempo real).
// - `intervalMs`: respaldo periódico; los KPI, tendencia, desgloses y curva NO lo usan.
// ---------------------------------------------------------------------------
export type Block<T = any> = { data: T | null; error: string; status: number; loading: boolean; refresh: () => void };
type BlockOptions = { live?: boolean; intervalMs?: number };
const LIVE_DEBOUNCE_MS = 2000;

export function useBlock<T = any>(path: string | null, options: BlockOptions = {}): Block<T> {
  const { live = false, intervalMs = 0 } = options;
  const [state, setState] = useState<{ data: T | null; error: string; status: number; loading: boolean }>({ data: null, error: '', status: 0, loading: !!path });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) { setState({ data: null, error: '', status: 0, loading: false }); return; }
    const controller = new AbortController();
    let active = true, inFlight = false, pendiente = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const load = () => {
      if (!active) return;
      if (document.hidden) { pendiente = true; return; }
      if (inFlight) { pendiente = true; return; }
      pendiente = false; inFlight = true;
      api(path, { signal: controller.signal })
        .then(value => { if (active) setState({ data: value, error: '', status: 200, loading: false }); })
        .catch((err: ApiError) => { if (active && err.name !== 'AbortError') setState(prev => ({ data: prev.data, error: err.message, status: err.status || 0, loading: false })); })
        .finally(() => { inFlight = false; if (active && pendiente && !document.hidden && live) onLive(); });
    };
    const onLive = () => { if (!debounce) debounce = setTimeout(() => { debounce = null; load(); }, LIVE_DEBOUNCE_MS); };
    const onVisible = () => { if (!document.hidden && pendiente) load(); };
    setState(prev => ({ ...prev, loading: true }));
    load();
    const timer = intervalMs > 0 ? setInterval(load, intervalMs) : null;
    if (live) window.addEventListener('amp-live', onLive);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false; controller.abort();
      if (timer) clearInterval(timer);
      if (debounce) clearTimeout(debounce);
      if (live) window.removeEventListener('amp-live', onLive);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [path, tick, live, intervalMs]);
  const refresh = useCallback(() => setTick(x => x + 1), []);
  return { ...state, refresh };
}

/** Reloj local (sin peticiones) para tiempos transcurridos. Solo corre mientras `active`. */
export function useNow(active: boolean, everyMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [active, everyMs]);
  return now;
}

export function useDebounced<T>(value: T, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

// ---------------------------------------------------------------------------
// Pestañas y filtros en la URL
// ---------------------------------------------------------------------------
export const TABS = [
  { key: 'resumen', path: '/buyers', label: 'Resumen' },
  { key: 'analisis', path: '/buyers/analisis', label: 'Análisis' },
  { key: 'agente', path: '/buyers/agente', label: 'Agente' },
  { key: 'propuestas', path: '/buyers/propuestas', label: 'Propuestas' },
  { key: 'reglas', path: '/buyers/reglas', label: 'Reglas' },
  { key: 'perfiles', path: '/buyers/perfiles', label: 'Perfiles' }
] as const;
export type TabKey = (typeof TABS)[number]['key'];
export const FILTER_KEYS = ['from', 'to', 'canal', 'campana', 'video'] as const;
export type Filters = Record<(typeof FILTER_KEYS)[number], string>;

export function tabDe(pathname: string): TabKey {
  const seg = pathname.replace(/\/+$/, '').split('/')[2] || '';
  return TABS.find(t => t.key === seg)?.key || 'resumen';
}

/** Filtros globales y pestaña activa, derivados de la URL (se conservan al cambiar de pestaña y se pueden compartir). */
export function useUrlState() {
  const pathname = usePathname();
  const search = useSearchParams();
  const tab = tabDe(pathname);
  const filters = useMemo(() => {
    const f = {} as Filters;
    for (const k of FILTER_KEYS) f[k] = search.get(k) || '';
    return f;
  }, [search]);
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    for (const k of FILTER_KEYS) if (filters[k]) p.set(k, filters[k]);
    return p.toString();
  }, [filters]);
  const qsRef = useRef(qs); qsRef.current = qs;
  const hrefFor = useCallback((target: TabKey, extra?: Record<string, string>) => {
    const p = new URLSearchParams(qsRef.current);
    for (const [k, v] of Object.entries(extra || {})) if (v) p.set(k, v);
    const s = p.toString();
    return `${TABS.find(t => t.key === target)!.path}${s ? `?${s}` : ''}`;
  }, []);
  const go = useCallback((target: TabKey, extra?: Record<string, string>) => {
    window.history.pushState(null, '', hrefFor(target, extra));
    window.scrollTo({ top: 0 });
  }, [hrefFor]);
  const setFilters = useCallback((patch: Record<string, string>) => {
    const p = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    const s = p.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${s ? `?${s}` : ''}`);
  }, []);
  return { tab, filters, qs, search, hrefFor, go, setFilters };
}

// ---------------------------------------------------------------------------
// Contexto compartido por las pestañas
// ---------------------------------------------------------------------------
export type BuyerCtx = {
  role: string;
  /** Solo ADMIN y DIRECCION cambian reglas y modo del agente. */
  puedeEditar: boolean;
  agent: Block;
  kpis: Block;
  filters: Filters;
  setFilters: (patch: Record<string, string>) => void;
  hrefFor: (tab: TabKey, extra?: Record<string, string>) => string;
  go: (tab: TabKey, extra?: Record<string, string>) => void;
  search: URLSearchParams;
  toast: (message: string) => void;
};
export const BuyerContext = createContext<BuyerCtx | null>(null);
export function useBuyer() {
  const ctx = useContext(BuyerContext);
  if (!ctx) throw new Error('useBuyer fuera del panel Buyers');
  return ctx;
}
