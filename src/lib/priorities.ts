import type { Contact } from './types';

type Insight = { id: number; phase: string; alert: boolean; draft?: string | null; channel?: string | null; silenceDays?: number } | null;
export type PrioritizedContact = Contact & { priorityScore: number; priorityLabel: string; priorityReason: string; requiresAttention: boolean; insight: Insight };
export function prioritize(c: Contact, insight: Insight, approvalPending: boolean, topNonAdmitted: boolean, now = new Date()): PrioritizedContact {
  let score = 100, label = 'En espera', reason = 'Seguimiento regular';
  const raise = (value: number, newLabel: string, newReason: string) => { if (value > score) { score = value; label = newLabel; reason = newReason; } };
  const activeInsight = insight && !['WAIT'].includes(insight.phase);
  if (topNonAdmitted && c.stage === 'BUYER') raise(690, 'Alta', 'Entre los diez primeros no ingresantes');
  if (c.stage === 'CUSTOMER' && c.lastActivityAt && now.getTime() - new Date(c.lastActivityAt).getTime() >= 7 * 86400000) raise(500, 'Media', 'Sin actividad académica reciente');
  if ((c.stage === 'PAYER' || c.stage === 'CUSTOMER') && c.renewalAt && !['RENEWED', 'CANCELLED'].includes(c.paymentStatus || '')) {
    const days = Math.ceil((new Date(c.renewalAt).getTime() - now.getTime()) / 86400000);
    if (days <= 1) raise(650, 'Alta', 'Renovación inminente');
    else if (days <= 3) raise(580, 'Media', 'Renovación próxima');
  }
  if (approvalPending) raise(760, 'Alta', 'Aprobación de operador pendiente');
  if (insight?.phase === 'STOP') raise(790, 'Alta', 'Límite de seguimiento alcanzado');
  if (insight?.phase.startsWith('FOLLOWUP_')) raise(820, 'Alta', `Sugerencia tras ${insight.silenceDays || 0} días sin respuesta`);
  if (insight?.phase === 'REPLY') raise(900, 'Alta', 'Hay una respuesta del contacto por atender');
  if (insight?.phase === 'MANUAL_REPLY') raise(1000, 'Crítica', 'El agente requiere respuesta manual');
  if (c.contactPaused || (c.stage === 'TURNED' && c.admissionStatus === 'ADMITTED')) return insight?.phase === 'MANUAL_REPLY' ? { ...c, insight, priorityScore: 1000, priorityLabel: 'Crítica', priorityReason: 'Revisión manual sin envío automático', requiresAttention: true } : { ...c, insight, priorityScore: 0, priorityLabel: 'Pausado', priorityReason: 'Contacto detenido', requiresAttention: false };
  return { ...c, insight, priorityScore: score, priorityLabel: label, priorityReason: reason, requiresAttention: !!activeInsight || approvalPending };
}
