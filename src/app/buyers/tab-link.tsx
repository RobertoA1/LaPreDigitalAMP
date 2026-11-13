'use client';
import { useBuyer, type TabKey } from './hooks';

/** Enlace a una pestaña del panel: navega sin recargar y conserva los filtros globales. */
export function TabLink({ tab, extra, className, children, onNavigate, ...rest }: {
  tab: TabKey; extra?: Record<string, string>; className?: string; children: React.ReactNode; onNavigate?: () => void;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'>) {
  const { hrefFor, go } = useBuyer();
  return <a {...rest} href={hrefFor(tab, extra)} className={className} onClick={e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // abrir en otra pestaña funciona como siempre
    e.preventDefault(); go(tab, extra); onNavigate?.();
  }}>{children}</a>;
}
