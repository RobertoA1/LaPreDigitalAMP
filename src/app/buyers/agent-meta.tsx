'use client';
import { AlertOctagon, Clock3, Loader2, Moon } from 'lucide-react';
import { duracion, type Obj } from './api';

/** Pasos de una ejecución, en orden (contrato §2). */
export const PASOS = ['COLA', 'CONTEXTO', 'IA', 'REGLAS', 'GUARDADO', 'FIN'] as const;
export const PASO_TEXTO: Record<string, string> = {
  COLA: 'En cola', CONTEXTO: 'Reuniendo el contexto', IA: 'Consultando a la IA', REGLAS: 'Aplicando las reglas', GUARDADO: 'Guardando propuestas', FIN: 'Finalizada'
};
export const PASO_CORTO: Record<string, string> = { COLA: 'Cola', CONTEXTO: 'Contexto', IA: 'IA', REGLAS: 'Reglas', GUARDADO: 'Guardado', FIN: 'Fin' };
export const DISPARADOR: Record<string, string> = { MANUAL: 'Manual', SCHEDULED: 'Programada', KPI_ALERT: 'Alerta de KPI' };
export const ACT_NOMBRE: Record<string, string> = { B1: 'B-1 Publicaciones', B2: 'B-2 Video y guion' };

export const ESTADO_AGENTE: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  EN_REPOSO: { label: 'En reposo', cls: 'reposo', icon: <Moon size={15} aria-hidden="true" /> },
  EN_COLA: { label: 'En cola', cls: 'cola', icon: <Clock3 size={15} aria-hidden="true" /> },
  EJECUTANDO: { label: 'Ejecutando', cls: 'ejecutando', icon: <Loader2 size={15} className="bp-spin" aria-hidden="true" /> },
  ERROR: { label: 'Error', cls: 'error', icon: <AlertOctagon size={15} aria-hidden="true" /> }
};

/** Latido del worker: vivo si el servidor lo dice y el último latido es reciente (45 s + margen de la consulta). */
export function workerEstado(agent: Obj | null, now: number) {
  const w = agent?.worker;
  if (!agent) return { known: false, alive: false, ageMs: null as number | null };
  const beat = w?.lastBeatAt ? new Date(w.lastBeatAt).getTime() : null;
  const ageMs = beat == null ? null : Math.max(0, now - beat);
  return { known: true, alive: !!w?.alive && (ageMs == null || ageMs < 75_000), ageMs };
}
export const textoLatido = (ageMs: number | null) => (ageMs == null ? 'sin latido registrado' : `último latido hace ${duracion(ageMs)}`);

/** Elapsed de la ejecución actual y paso en curso. */
export function pasoActual(run: Obj | null | undefined) {
  const paso = String(run?.step || (run ? 'COLA' : ''));
  return { paso, texto: PASO_TEXTO[paso] || paso };
}

/** El `log` puede llegar como arreglo o como texto JSON. */
export function logDe(run: Obj | null | undefined): Array<{ at: string; step: string; message: string }> {
  let v: any = run?.log;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = []; } }
  return Array.isArray(v) ? v.filter(x => x && x.message) : [];
}
