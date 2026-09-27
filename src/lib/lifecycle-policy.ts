import type { Contact } from './types';

export type WeeklyReport = { weekStart: string | Date; activitiesCompleted: number | null; activitiesPlanned: number | null; score: number | null; simulations: number | null; missingCourses: string | null };
export type LifecycleMessage = { id: number; direction: string; body: string; createdAt: string | Date; recipientKind?: string };
export type LifecycleEvent = { id?: number; type: string; summary: string; detail?: string | null; createdAt: string | Date };
const day = 86400000;
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const time = (value: string | Date | null | undefined) => value ? new Date(value).getTime() : NaN;
export const isLifecycle = (stage: string) => stage === 'CUSTOMER' || stage === 'TURNED';

export function serviceSignal(body: string): 'CANCELLATION' | 'ACCESS' | 'DISSATISFACTION' | null {
  const text = normalize(body);
  if (/\b(no quiero cancelar|no voy a cancelar|no deseo cancelar)\b/.test(text)) return null;
  if (/\b(quiero cancelar|deseo cancelar|voy a cancelar|quiero darme de baja|no (?:voy a|quiero|deseo) renovar|no renovare)\b/.test(text)) return 'CANCELLATION';
  if (/no (?:puedo|logro) (?:entrar|acceder)|no funciona|problema (?:de|con el) acceso|error al ingresar/.test(text)) return 'ACCESS';
  if (/insatisfech|no estoy satisfech|mal servicio|no me ayuda|no me sirve|reclamo|queja/.test(text)) return 'DISSATISFACTION';
  return null;
}

export function declaredExitReason(body: string) {
  // Preserve the declaration verbatim; keywords alone are not evidence of a cause.
  const text = normalize(body);
  return /(?:deje de (?:usar|estudiar)|no renove|cancele|me retire|me di de baja|deje la plataforma).*(?:porque|por |debido a)/.test(text) ? body.trim().slice(0, 1000) : null;
}

export function recoveryWindow(c: Contact, now = new Date()) {
  if (c.stage !== 'TURNED') return { allowed: true, reason: '', deadline: null as Date | null };
  if (c.contactPaused || c.admissionStatus === 'ADMITTED') return { allowed: false, reason: 'Recuperación detenida por pausa o ingreso confirmado.', deadline: null };
  const since = time(c.stageChangedAt);
  if (!Number.isFinite(since) || since > now.getTime()) return { allowed: false, reason: 'Falta una fecha válida de transición a TURNED en el datamart; revisar antes de contactar.', deadline: null };
  const deadline = new Date(since + 30 * day);
  return { allowed: now < deadline, reason: now >= deadline ? 'Finalizó el plazo de 30 días posteriores a la baja.' : 'Dentro de los 30 días posteriores a la transición registrada en el datamart.', deadline };
}

export function pendingServiceReview(events: LifecycleEvent[], messages: LifecycleMessage[]) {
  const resolved = Math.max(0, ...events.filter(e => e.type === 'SERVICE_REVIEW_RESOLVED').map(e => time(e.createdAt)));
  const pendingEvent = events.some(e => e.type === 'SERVICE_REVIEW_REQUIRED' && time(e.createdAt) > resolved);
  const signal = messages.filter(m => m.direction === 'IN' && time(m.createdAt) > resolved).sort((a, b) => time(b.createdAt) - time(a.createdAt)).find(m => serviceSignal(m.body));
  return pendingEvent || !!signal;
}

export function reactivated(previous: string, current: string) { return previous === 'TURNED' && current === 'PAYER'; }

export function lifecycleAssessment(c: Contact, reports: WeeklyReport[], messages: LifecycleMessage[], events: LifecycleEvent[], now = new Date()) {
  const evidence: string[] = [];
  const limits = ['Sin NPS, satisfacción estructurada ni tickets: no se calculan esos indicadores.', 'Los puntajes semanales no acreditan evaluaciones equivalentes: no se calcula mejora porcentual ni estancamiento entre evaluaciones.'];
  const review = pendingServiceReview(events, messages);
  if (review) {
    const resolved = Math.max(0, ...events.filter(e => e.type === 'SERVICE_REVIEW_RESOLVED').map(e => time(e.createdAt)));
    const signal = messages.filter(m => m.direction === 'IN' && time(m.createdAt) > resolved && serviceSignal(m.body)).sort((a, b) => time(b.createdAt) - time(a.createdAt))[0];
    if (signal) evidence.push(`Declaración pendiente de revisión (mensaje #${signal.id}): ${signal.body.slice(0, 1000)}`);
    else evidence.push('Existe un evento de revisión de servicio pendiente de resolución humana.');
  }
  const window = recoveryWindow(c, now);
  const inactivity = Number.isFinite(time(c.lastActivityAt)) && time(c.lastActivityAt) <= now.getTime() ? Math.floor((now.getTime() - time(c.lastActivityAt)) / day) : null;
  const weekly = reports.filter(w => Number.isFinite(time(w.weekStart)) && time(w.weekStart) <= now.getTime()).sort((a, b) => time(b.weekStart) - time(a.weekStart));
  const latest = weekly[0];
  const valid = (n: number | null): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  let summary = 'No hay reporte semanal disponible.';
  if (latest) {
    const parts = [`Reporte de la semana del ${new Date(latest.weekStart).toISOString().slice(0, 10)}`];
    if (valid(latest.activitiesCompleted)) parts.push(`${latest.activitiesCompleted} actividades completadas`);
    if (valid(latest.activitiesPlanned)) parts.push(`${latest.activitiesPlanned} actividades programadas`);
    if (valid(latest.simulations)) parts.push(`${latest.simulations} simulacros`);
    if (valid(latest.score)) parts.push(`puntaje registrado: ${latest.score}`);
    if (latest.missingCourses) parts.push(`por reforzar: ${latest.missingCourses}`);
    summary = parts.join('; ') + '.';
    evidence.push(summary);
    if (weekly[1] && valid(weekly[1].score)) evidence.push(`Puntaje anterior registrado: ${weekly[1].score} (${new Date(weekly[1].weekStart).toISOString().slice(0, 10)}). Comparabilidad de evaluaciones no disponible.`);
  }
  if (inactivity !== null) evidence.push(`Última actividad registrada: ${new Date(c.lastActivityAt!).toISOString().slice(0, 10)} (${inactivity} días).`);
  else evidence.push('Última actividad desconocida; no se presume inactividad.');
  const first = c.fullName.split(' ')[0];
  let recommendation = 'Revisar el progreso disponible y acompañar la continuidad del servicio.';
  let draft = `Hola, ${first}. ${summary} ${latest && valid(latest.activitiesCompleted) && latest.activitiesCompleted > 0 ? 'Reconocemos las actividades que has completado. ' : ''}${inactivity !== null && inactivity >= 5 ? 'Llevas al menos cinco días sin actividad registrada. ¿Te ayudaría retomar con una sesión breve?' : '¿Hay algún tema en el que necesites acompañamiento?'}`;
  let reason: string | null = null;
  let origin: string | null = null;
  if (c.stage === 'TURNED') {
    const since = time(c.stageChangedAt);
    const transition = events.filter(e => e.type === 'STAGE_CHANGE' && time(e.createdAt) >= since && /^(PAYER|CUSTOMER) → TURNED/.test(e.summary)).sort((a, b) => time(b.createdAt) - time(a.createdAt))[0];
    origin = transition?.summary.split(' → ')[0] || null;
    const declaration = messages.filter(m => m.direction === 'IN' && time(m.createdAt) >= since && declaredExitReason(m.body)).sort((a, b) => time(b.createdAt) - time(a.createdAt))[0];
    reason = declaration ? declaredExitReason(declaration.body) : null;
    evidence.push(`Etapa anterior: ${origin || 'sin evidencia registrada'}.`, window.reason, reason ? `Motivo declarado (mensaje #${declaration!.id}): ${reason}` : 'Motivo de baja desconocido; no inferido.');
    if (valid(c.progress)) evidence.push(`Progreso registrado previo a reactivación: ${c.progress} %. No acredita actividad posterior a la baja.`);
    if (Number.isFinite(time(c.examDate)) && time(c.examDate) >= now.getTime()) evidence.push(`Examen registrado: ${new Date(c.examDate!).toISOString().slice(0, 10)}.`);
    const context = normalize(reason || '');
    const action = /tiempo|horario|trabajo/.test(context) ? '¿Te ayudaría conversar sobre una preparación compatible con tu tiempo disponible?' : /dinero|precio|caro|econom|pago/.test(context) ? 'Un operador puede revisar tus dudas económicas, sin comprometer una oferta. ¿Quieres que revise tu caso?' : /acceso|error|servicio|funciona/.test(context) ? 'Podemos solicitar que un operador revise el problema con el servicio. ¿Qué dificultad encontraste?' : /curso|dificultad|academ|entend/.test(context) ? 'Podemos solicitar orientación académica. ¿Qué tema te resultó más difícil?' : reason ? '¿Te gustaría conversar sobre lo que necesitarías para retomar tu preparación?' : '¿Podrías contarnos cuál fue el motivo de tu salida?';
    recommendation = 'Propuesta de apoyo a la sección 7.3: comprender la baja y preparar un contacto respetuoso; la reactivación exige confirmación del datamart.';
    draft = `Hola, ${first}. ${action}`;
  }
  if (review) {
    recommendation = 'Revisión humana pendiente por cancelación, insatisfacción o acceso. Comunicaciones automáticas suspendidas hasta resolver el caso.';
    draft = `Hola, ${first}. Queremos atender tu situación de forma personalizada. Un operador revisará tu caso antes de proponer la continuidad del servicio. ¿Qué necesitas que revise?`;
  } else if (c.stage === 'CUSTOMER' && inactivity !== null && inactivity >= 5) recommendation = 'Cinco o más días sin actividad: ofrecer una sesión breve y revisar dificultades, sin inventar tareas pendientes.';
  const blocked = c.contactPaused || (c.stage === 'TURNED' && c.admissionStatus === 'ADMITTED');
  return { evidence, limits, summary, recommendation, draft: blocked || (c.stage === 'TURNED' && !window.allowed && !review) ? null : draft, guardianDraft: `Hola. Compartimos el seguimiento de ${c.fullName}: ${summary} Si necesita acompañamiento, puede solicitar una revisión al equipo.`, review, inactivity, reason, origin, window, blocked, alert: review || (c.stage === 'CUSTOMER' && inactivity !== null && inactivity >= 5), proposal: c.stage === 'TURNED' };
}
