import type { Contact } from './types';
import { planCapabilities, planSupportAction } from './catalog';

export type WeeklyReport = {
  weekStart: string | Date; activitiesCompleted: number | null; activitiesPlanned: number | null;
  score: number | null; simulations: number | null; missingCourses: string | null;
  assessmentId?: string | number | null; assessmentType?: string | null;
  equivalentGroup?: string | null; equivalent?: boolean | null;
  sourceUpdatedAt?: string | Date | null;
};
export type LifecycleMessage = { id: number; direction: string; body: string; createdAt: string | Date; recipientKind?: string };
export type LifecycleEvent = { id?: number; type: string; summary: string; detail?: string | null; createdAt: string | Date };
export type RiskLevel = 'BAJO' | 'MEDIO' | 'ALTO';
export type LifecycleActionState = 'PROPUESTA' | 'PENDIENTE' | 'EJECUTADA' | 'FALLIDA' | 'DERIVADA';
export type RiskEvidence = { signal: string; status: 'CONFIRMADA' | 'INDICIO'; evidence: string; observedAt: string | null };
const day = 86400000;
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const time = (value: string | Date | null | undefined) => value ? new Date(value).getTime() : NaN;
export const isLifecycle = (stage: string) => stage === 'CUSTOMER' || stage === 'TURNED';
export const CUSTOMER_INACTIVITY_DAYS = 5;
export const TURNED_CONTACT_WINDOW_DAYS = 30;
export const REACTIVATION_ATTRIBUTION_WINDOW_DAYS = 30;

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

export type TurnedReason = 'PRICE' | 'TIME' | 'ACADEMIC_DIFFICULTY' | 'TECHNICAL' | 'DISSATISFACTION' | 'OBJECTIVE_COMPLETED' | 'UNKNOWN';

export function classifyTurnedReason(declaration: string | null): TurnedReason {
  if (!declaration) return 'UNKNOWN';
  const value = normalize(declaration);
  if (/ingres|admit|universidad/.test(value)) return 'OBJECTIVE_COMPLETED';
  if (/precio|caro|dinero|pago|costo|cuota/.test(value)) return 'PRICE';
  if (/tiempo|horario|trabajo|ocupad/.test(value)) return 'TIME';
  if (/curso|dificult|academ|no entiendo|resultado|puntaje/.test(value)) return 'ACADEMIC_DIFFICULTY';
  if (/acceso|error|funciona|plataforma|tecnico/.test(value)) return 'TECHNICAL';
  if (/insatisf|queja|reclamo|no me sirve|no me ayuda/.test(value)) return 'DISSATISFACTION';
  return 'UNKNOWN';
}

export function individualRecommendationScore(body: string) {
  const match = normalize(body).match(/(?:recomend(?:arias|ar|acion)|nps)[^0-9]{0,20}(10|[0-9])/);
  return match ? Number(match[1]) : null;
}

export function academicVariationPercent(previous: number | null, current: number | null) {
  if (typeof previous !== 'number' || !Number.isFinite(previous) || typeof current !== 'number' || !Number.isFinite(current) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function comparableEvaluations(current: WeeklyReport, previous: WeeklyReport) {
  if (current.equivalent === true && previous.equivalent === true) return true;
  if (current.equivalentGroup && current.equivalentGroup === previous.equivalentGroup) return true;
  return !!current.assessmentId && !!previous.assessmentId && !!current.assessmentType && current.assessmentType === previous.assessmentType;
}

export function academicAssessment(reports: WeeklyReport[], now = new Date()) {
  const ordered = reports.filter(report => Number.isFinite(time(report.weekStart)) && time(report.weekStart) <= now.getTime())
    .slice().sort((a, b) => time(b.weekStart) - time(a.weekStart));
  const pairs = ordered.slice(0, -1).map((current, index) => ({ current, previous: ordered[index + 1] }))
    .filter(pair => comparableEvaluations(pair.current, pair.previous) && pair.current.score != null && pair.previous.score != null);
  const variations = pairs.map(pair => ({
    currentDate: new Date(pair.current.weekStart).toISOString().slice(0, 10),
    previousDate: new Date(pair.previous.weekStart).toISOString().slice(0, 10),
    variationPercent: academicVariationPercent(pair.previous.score, pair.current.score)
  }));
  const decline = variations.find(item => item.variationPercent != null && item.variationPercent <= -10) || null;
  const noImprovementConsecutive = variations.length >= 2 && variations.slice(0, 2).every(item => item.variationPercent != null && item.variationPercent <= 0);
  const latest = ordered[0] || null;
  const previous = ordered[1] || null;
  const comparable = pairs.length > 0;
  return {
    status: comparable ? 'CONFIRMADA' as const : ordered.length ? 'NO_COMPARABLE' as const : 'NO_DATA' as const,
    latest, previous, variations, decline10: decline, noImprovementConsecutive,
    needsReinforcement: !!decline || noImprovementConsecutive || !!latest?.missingCourses,
    limitation: comparable ? null : 'Comparabilidad de evaluaciones no disponible: no hay identificadores o grupos que demuestren que los puntajes pertenecen a evaluaciones equivalentes.'
  };
}

export function activityAssessment(c: Contact, reports: WeeklyReport[], now = new Date()) {
  const last = time(c.lastActivityAt);
  const validLast = Number.isFinite(last) && last <= now.getTime();
  const inactivityDays = validLast ? Math.floor((now.getTime() - last) / day) : null;
  const ordered = reports.slice().sort((a, b) => time(b.weekStart) - time(a.weekStart));
  const latest = ordered[0];
  const previous = ordered[1];
  const planned = latest?.activitiesPlanned;
  const completed = latest?.activitiesCompleted;
  const lowCompliance = typeof planned === 'number' && planned > 0 && typeof completed === 'number' && completed < planned;
  return {
    inactivityDays, thresholdReached: inactivityDays != null && inactivityDays >= CUSTOMER_INACTIVITY_DAYS,
    latest: latest ? { weekStart: latest.weekStart, planned, completed, simulations: latest.simulations } : null,
    previous: previous ? { weekStart: previous.weekStart, planned: previous.activitiesPlanned, completed: previous.activitiesCompleted, simulations: previous.simulations } : null,
    lowCompliance, limitation: validLast ? null : 'Última actividad desconocida o futura; no se presume inactividad.'
  };
}

function eventDetail(event: LifecycleEvent) {
  if (!event.detail) return {} as Record<string, any>;
  try { const value = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail; return value && typeof value === 'object' ? value as Record<string, any> : {}; } catch { return {}; }
}

export function lifecycleRisk(c: Contact, reports: WeeklyReport[], messages: LifecycleMessage[], events: LifecycleEvent[], now = new Date()) {
  const activity = activityAssessment(c, reports, now);
  const academic = academicAssessment(reports, now);
  const evidence: RiskEvidence[] = [];
  if (activity.thresholdReached) evidence.push({ signal: 'INACTIVIDAD', status: 'CONFIRMADA', evidence: `Última actividad registrada hace ${activity.inactivityDays} días.`, observedAt: c.lastActivityAt });
  if (activity.lowCompliance) evidence.push({ signal: 'BAJO_CUMPLIMIENTO', status: 'CONFIRMADA', evidence: `Semana ${String(activity.latest?.weekStart).slice(0, 10)}: ${activity.latest?.completed} de ${activity.latest?.planned} actividades.`, observedAt: String(activity.latest?.weekStart || '') });
  if (academic.needsReinforcement) evidence.push({ signal: 'DIFICULTAD_ACADEMICA', status: academic.status === 'CONFIRMADA' ? 'CONFIRMADA' : 'INDICIO', evidence: academic.decline10 ? `Variación ${academic.decline10.variationPercent!.toFixed(1)} % entre evaluaciones comparables.` : 'Hay cursos pendientes o evidencia académica insuficiente para comparar evaluaciones.', observedAt: academic.latest ? new Date(academic.latest.weekStart).toISOString() : null });
  const inbound = messages.filter(message => message.direction === 'IN').sort((a, b) => time(b.createdAt) - time(a.createdAt));
  const cancellation = inbound.find(message => serviceSignal(message.body) === 'CANCELLATION');
  if (cancellation) evidence.push({ signal: 'CANCELACION', status: 'CONFIRMADA', evidence: cancellation.body.slice(0, 500), observedAt: new Date(cancellation.createdAt).toISOString() });
  const dissatisfaction = inbound.find(message => serviceSignal(message.body) === 'DISSATISFACTION');
  if (dissatisfaction) evidence.push({ signal: 'INSATISFACCION', status: 'CONFIRMADA', evidence: dissatisfaction.body.slice(0, 500), observedAt: new Date(dissatisfaction.createdAt).toISOString() });
  const access = inbound.find(message => serviceSignal(message.body) === 'ACCESS');
  const latestOpen = events.filter(item => item.type === 'INCIDENT_OPEN').sort((a, b) => time(b.createdAt) - time(a.createdAt))[0];
  const latestResolved = events.filter(item => item.type === 'INCIDENT_RESOLVED').sort((a, b) => time(b.createdAt) - time(a.createdAt))[0];
  const latestReview = events.filter(item => item.type === 'SERVICE_REVIEW_REQUIRED' && ['ACCESS', 'DISSATISFACTION'].includes(String(eventDetail(item).signal)) && (!latestResolved || time(item.createdAt) > time(latestResolved.createdAt))).sort((a, b) => time(b.createdAt) - time(a.createdAt))[0];
  const openIncident = latestOpen && (!latestResolved || time(latestOpen.createdAt) > time(latestResolved.createdAt)) ? latestOpen : latestReview;
  if (access || openIncident) evidence.push({ signal: 'INCIDENCIA', status: 'CONFIRMADA', evidence: access?.body.slice(0, 500) || openIncident?.summary || 'Incidencia abierta registrada.', observedAt: access ? new Date(access.createdAt).toISOString() : openIncident ? new Date(openIncident.createdAt).toISOString() : null });
  const serviceMessages = inbound.filter(message => ['ACCESS', 'DISSATISFACTION'].includes(serviceSignal(message.body) || ''));
  if (serviceMessages.length >= 2) evidence.push({ signal: 'INCIDENCIA_REPETIDA', status: 'CONFIRMADA', evidence: `Se registraron ${serviceMessages.length} incidencias de servicio en mensajes distintos.`, observedAt: new Date(serviceMessages[0].createdAt).toISOString() });
  if (latestOpen && (!latestResolved || time(latestOpen.createdAt) > time(latestResolved.createdAt)) && Number.isFinite(time(latestOpen.createdAt)) && now.getTime() - time(latestOpen.createdAt) >= day) evidence.push({ signal: 'INCIDENCIA_MAYOR_24H', status: 'CONFIRMADA', evidence: 'La incidencia abierta supera 24 horas sin evento de resolución.', observedAt: new Date(latestOpen.createdAt).toISOString() });
  const lowRecommendation = inbound.find(message => { const score = individualRecommendationScore(message.body); return score != null && score <= 6; });
  if (lowRecommendation) evidence.push({ signal: 'RECOMENDACION_BAJA', status: 'CONFIRMADA', evidence: `Valoración individual ${individualRecommendationScore(lowRecommendation.body)}/10; no es NPS agregado.`, observedAt: new Date(lowRecommendation.createdAt).toISOString() });
  const signals = new Set(evidence.map(item => item.signal));
  const explicitCancellation = signals.has('CANCELACION');
  const level: RiskLevel = explicitCancellation || signals.size >= 2 ? 'ALTO' : signals.size === 1 ? 'MEDIO' : 'BAJO';
  return { level, evidence, signalCount: signals.size, explicitCancellation, activity, academic };
}

export function recoveryWindow(c: Contact, now = new Date()) {
  if (c.stage !== 'TURNED') return { allowed: true, reason: '', deadline: null as Date | null };
  if (c.contactPaused || c.admissionStatus === 'ADMITTED') return { allowed: false, reason: 'Recuperación detenida por pausa o ingreso confirmado.', deadline: null };
  const since = time(c.stageChangedAt);
  if (!Number.isFinite(since) || since > now.getTime()) return { allowed: false, reason: 'Falta una fecha válida de transición a TURNED en el datamart; revisar antes de contactar.', deadline: null };
  const deadline = new Date(since + TURNED_CONTACT_WINDOW_DAYS * day);
  return { allowed: now < deadline, reason: now >= deadline ? `Finalizó el plazo de ${TURNED_CONTACT_WINDOW_DAYS} días posteriores a la baja.` : `Dentro de los ${TURNED_CONTACT_WINDOW_DAYS} días posteriores a la transición registrada en el datamart.`, deadline };
}

export function reactivationAttributionWindow(contact: Contact, contactEvents: LifecycleEvent[], now = new Date()) {
  const isReactivation = contact.stage === 'TURNED' || contactEvents.some(item => item.type === 'STAGE_CHANGE' && /TURNED → PAYER/.test(item.summary));
  if (!isReactivation) return { eligible: false, reason: 'La ventana solo aplica a TURNED o a su transición confirmada a PAYER.', deadline: null as Date | null, startedAt: null as Date | null };
  const firstContact = contactEvents.filter(item => item.type === 'LIFECYCLE_CONTACT' && Number.isFinite(time(item.createdAt))).sort((a, b) => time(a.createdAt) - time(b.createdAt))[0];
  if (!firstContact) return { eligible: false, reason: 'Aún no existe un contacto ejecutado por el agente.', deadline: null, startedAt: null };
  const startedAt = new Date(time(firstContact.createdAt));
  const deadline = new Date(startedAt.getTime() + REACTIVATION_ATTRIBUTION_WINDOW_DAYS * day);
  return {
    eligible: now < deadline,
    reason: now < deadline ? `Reactivación atribuible si el nuevo pago llega dentro de ${REACTIVATION_ATTRIBUTION_WINDOW_DAYS} días del contacto ejecutado.` : 'La ventana de atribución terminó; un retorno posterior no se atribuye al agente.',
    deadline, startedAt
  };
}

export function pendingServiceReview(events: LifecycleEvent[], messages: LifecycleMessage[]) {
  const resolved = Math.max(0, ...events.filter(e => e.type === 'SERVICE_REVIEW_RESOLVED').map(e => time(e.createdAt)));
  const pendingEvent = events.some(e => e.type === 'SERVICE_REVIEW_REQUIRED' && time(e.createdAt) > resolved);
  const signal = messages.filter(m => m.direction === 'IN' && time(m.createdAt) > resolved).sort((a, b) => time(b.createdAt) - time(a.createdAt)).find(m => serviceSignal(m.body));
  const lowRecommendation = messages.filter(m => m.direction === 'IN' && time(m.createdAt) > resolved).some(message => {
    const score = individualRecommendationScore(message.body);
    return score != null && score <= 6;
  });
  return pendingEvent || !!signal || lowRecommendation;
}

export function reactivated(previous: string, current: string) { return previous === 'TURNED' && current === 'PAYER'; }

export function lifecycleAssessment(c: Contact, reports: WeeklyReport[], messages: LifecycleMessage[], events: LifecycleEvent[], now = new Date()) {
  const evidence: string[] = [];
  const limits = ['No hay NPS ni encuesta estructurada: una recomendación individual de 0 a 6 requiere revisión, pero no se calcula NPS agregado.', 'Los reportes semanales solo permiten calcular variación cuando traen identificadores o grupos de evaluaciones equivalentes.', 'No existe un conector de rutas académicas ni de pagos: las modificaciones y confirmaciones quedan pendientes del sistema responsable.'];
  const review = pendingServiceReview(events, messages);
  if (review) {
    const resolved = Math.max(0, ...events.filter(e => e.type === 'SERVICE_REVIEW_RESOLVED').map(e => time(e.createdAt)));
    const signal = messages.filter(m => m.direction === 'IN' && time(m.createdAt) > resolved && serviceSignal(m.body)).sort((a, b) => time(b.createdAt) - time(a.createdAt))[0];
    if (signal) evidence.push(`Declaración pendiente de revisión (mensaje #${signal.id}): ${signal.body.slice(0, 1000)}`);
    else evidence.push('Existe un evento de revisión de servicio pendiente de resolución humana.');
  }
  const window = recoveryWindow(c, now);
  const weekly = reports.filter(w => Number.isFinite(time(w.weekStart)) && time(w.weekStart) <= now.getTime()).sort((a, b) => time(b.weekStart) - time(a.weekStart));
  const activity = activityAssessment(c, weekly, now);
  const academic = academicAssessment(weekly, now);
  const risk = lifecycleRisk(c, weekly, messages, events, now);
  const inactivity = activity.inactivityDays;
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
    if (weekly[1] && valid(latest.activitiesCompleted) && valid(weekly[1].activitiesCompleted)) evidence.push(`Cambio de actividades completadas: ${weekly[1].activitiesCompleted} → ${latest.activitiesCompleted} entre semanas fechadas.`);
    if (weekly[1] && valid(latest.activitiesPlanned) && valid(weekly[1].activitiesPlanned)) evidence.push(`Cambio de actividades programadas: ${weekly[1].activitiesPlanned} → ${latest.activitiesPlanned} entre semanas fechadas.`);
    if (weekly[1] && valid(latest.simulations) && valid(weekly[1].simulations)) evidence.push(`Cambio de simulacros registrados: ${weekly[1].simulations} → ${latest.simulations} entre semanas fechadas.`);
    if (weekly[1] && valid(weekly[1].score)) evidence.push(`Puntaje anterior registrado: ${weekly[1].score} (${new Date(weekly[1].weekStart).toISOString().slice(0, 10)}). ${academic.limitation || 'Se comparó con la evaluación equivalente registrada.'}`);
  }
  if (inactivity !== null) evidence.push(`Última actividad registrada: ${new Date(c.lastActivityAt!).toISOString().slice(0, 10)} (${inactivity} días).`);
  else evidence.push('Última actividad desconocida; no se presume inactividad.');
  if (Number.isFinite(time(c.examDate)) && time(c.examDate) >= now.getTime()) evidence.push(`Próxima evaluación/examen registrado: ${new Date(c.examDate!).toISOString().slice(0, 10)}.`);
  const first = c.fullName.split(' ')[0];
  let recommendation = 'Revisar el progreso disponible y acompañar la continuidad del servicio.';
  let actionType = 'WEEKLY_REVIEW';
  let actionState: LifecycleActionState = 'PROPUESTA';
  let humanIntervention = false;
  let draft = `Hola, ${first}. ${summary} ${latest && valid(latest.activitiesCompleted) && latest.activitiesCompleted > 0 ? 'Reconocemos las actividades que has completado. ' : ''}${inactivity !== null && inactivity >= CUSTOMER_INACTIVITY_DAYS ? `Llevas al menos cinco días sin actividad registrada. ¿Te ayudaría retomar con una sesión breve?` : '¿Hay algún tema en el que necesites acompañamiento?'}`;
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
    const reasonType = classifyTurnedReason(reason);
    const action = reasonType === 'TIME' ? '¿Te ayudaría conversar sobre una preparación más manejable para tu tiempo disponible?' : reasonType === 'PRICE' ? 'Un operador puede revisar las alternativas del catálogo vigente, sin comprometer una oferta. ¿Quieres que revise tu caso?' : reasonType === 'TECHNICAL' ? 'Primero podemos solicitar que un operador resuelva el problema técnico antes de hablar de tu regreso. ¿Qué dificultad encontraste?' : reasonType === 'ACADEMIC_DIFFICULTY' ? 'Podemos solicitar una revisión académica antes de que decidas retomar. ¿Qué tema te resultó más difícil?' : reasonType === 'DISSATISFACTION' ? 'Un operador debe revisar tu experiencia antes de proponer el regreso. ¿Qué parte del servicio necesitas que atendamos?' : reason ? '¿Te gustaría conversar sobre lo que necesitarías para retomar tu preparación?' : '¿Podrías contarnos cuál fue el motivo de tu salida?';
    recommendation = 'Comprender la baja y preparar un contacto respetuoso; la contratación y reactivación exigen confirmación del datamart.';
    actionType = reasonType === 'TECHNICAL' || reasonType === 'DISSATISFACTION' ? 'HUMAN_REVIEW' : 'RECOVERY_PROPOSAL';
    actionState = reasonType === 'TECHNICAL' || reasonType === 'DISSATISFACTION' ? 'DERIVADA' : 'PROPUESTA';
    humanIntervention = reasonType === 'TECHNICAL' || reasonType === 'DISSATISFACTION' || reasonType === 'PRICE';
    draft = `Hola, ${first}. ${action}`;
    evidence.push(`Motivo ${reason ? 'confirmado' : 'desconocido'}: ${reasonType}.`);
  }
  if (review) {
    recommendation = 'Revisión humana pendiente por cancelación, insatisfacción o acceso. Comunicaciones automáticas suspendidas hasta resolver el caso.';
    draft = `Hola, ${first}. Queremos atender tu situación de forma personalizada. Un operador revisará tu caso antes de proponer la continuidad del servicio. ¿Qué necesitas que revise?`;
    actionType = 'HUMAN_REVIEW'; actionState = 'DERIVADA'; humanIntervention = true;
  } else if (c.stage === 'CUSTOMER' && inactivity !== null && inactivity >= CUSTOMER_INACTIVITY_DAYS) recommendation = `Cinco o más días sin actividad: ofrecer una sesión breve y revisar dificultades, sin inventar tareas pendientes.`;
  if (c.stage === 'CUSTOMER' && !review) {
    if (risk.explicitCancellation) {
      recommendation = 'Intención explícita de cancelar: atención prioritaria humana antes de cualquier propuesta de continuidad.';
      actionType = 'HUMAN_REVIEW'; actionState = 'DERIVADA'; humanIntervention = true;
    } else if (academic.needsReinforcement) {
      const support = planSupportAction(c.plan, true);
      recommendation = academic.decline10 || academic.noImprovementConsecutive ? `Recomendar refuerzo: ${academic.decline10 ? `la variación de la evaluación comparable fue ${academic.decline10.variationPercent!.toFixed(1)} %` : 'hay dos evaluaciones comparables consecutivas sin mejora'}.` : 'Hay cursos pendientes o dificultad académica que requiere revisión.';
      actionType = support.type; actionState = support.state; humanIntervention = support.state === 'PENDIENTE';
      if (academic.limitation) evidence.push(academic.limitation);
    }
  }
  const blocked = c.contactPaused || (c.stage === 'TURNED' && c.admissionStatus === 'ADMITTED');
  if (c.admissionStatus === 'ADMITTED' && c.stage === 'TURNED') {
    recommendation = 'Objetivo académico cumplido: cerrar el seguimiento de recuperación.';
    actionType = 'OBJECTIVE_COMPLETED'; actionState = 'DERIVADA'; humanIntervention = false;
    evidence.push('Ingreso universitario confirmado por el datamart; no se promueve el retorno.');
  }
  const capabilities = planCapabilities(c.plan);
  return {
    evidence, limits, summary, recommendation,
    draft: blocked || (c.stage === 'TURNED' && !window.allowed && !review) ? null : draft,
    guardianDraft: `Hola. Compartimos el seguimiento de ${c.fullName}: ${summary} Si necesita acompañamiento, puede solicitar una revisión al equipo.`,
    guardianReportAllowed: capabilities.guardianReports,
    review, inactivity, reason, reasonType: c.stage === 'TURNED' ? classifyTurnedReason(reason) : null, origin, window, blocked,
    activity, academic, risk,
    action: { type: actionType, state: blocked ? 'DERIVADA' as const : actionState, destination: humanIntervention ? 'HUMAN' : 'STUDENT', needsHuman: humanIntervention, result: blocked ? 'NO_EJECUTADA' : 'PENDIENTE' },
    nextReviewAt: new Date(now.getTime() + 7 * day).toISOString(),
    alert: review || risk.level !== 'BAJO' || (c.stage === 'CUSTOMER' && inactivity !== null && inactivity >= CUSTOMER_INACTIVITY_DAYS),
    priority: risk.level, proposal: c.stage === 'TURNED'
  };
}

export function lifecycleMetricDefinitions() {
  return {
    CUSTOMER: {
      weeklyActivity: 'Clientes CUSTOMER con al menos un registro de actividad en cada semana de la ventana; reportes fechados por weekStart.',
      routesReviewed: 'Población: acciones académicas con estado EJECUTADA emitidas por el componente académico; este agente solo registra propuestas PENDIENTE porque no tiene esa herramienta.',
      measuredProgress: 'Pares de evaluaciones con equivalentGroup/assessmentId compatible; variación = (actual - anterior) / |anterior| * 100.',
      riskUpdated: 'Clientes con evaluación de riesgo registrada durante la ventana.',
      activityRecovery: 'Customer que vuelve a registrar actividad después de una alerta de cinco días.',
      consultationResolution: 'Incidencia con INCIDENT_RESOLVED posterior a INCIDENT_OPEN; una respuesta no equivale a resolución.',
      renewal: 'CUSTOMER con nuevo vencimiento y estado confirmado por datamart dentro de la ventana.',
      satisfaction: 'Valoración individual registrada; NPS agregado no disponible sin encuesta estructurada.',
      abandonment: 'Transición datamart CUSTOMER -> TURNED dentro de la ventana.'
    },
    TURNED: {
      knownReasons: 'Bajas con TURNED_REASON declarado; desconocidos quedan fuera del numerador.',
      contactsInWindow: `Contactos ejecutados entre la fecha de baja y ${TURNED_CONTACT_WINDOW_DAYS} días posteriores.`,
      reactivations: `Cambio confirmado TURNED -> PAYER dentro de ${REACTIVATION_ATTRIBUTION_WINDOW_DAYS} días de un contacto ejecutado; retorno espontáneo no se atribuye al agente.`
    }
  };
}
