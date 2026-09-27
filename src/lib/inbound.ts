import { z } from 'zod';
import { plain, plainMany, tables } from './db';
import { contact, event } from './contacts';
import { generate } from './ai';
import { fallbackDraft } from './radar';
import { sendMessage } from './messaging';
import { agents, type Channel, type Contact } from './types';
import { learnExplicitData } from './agents';
import {
  alreadyRecordedForMessage, assessPayerOnboarding, buildLeadFallback, buildLeadProfile,
  detectBuyerIntent, eventDetails, explicitBenefitApproval, inboundPromptForStage,
  payerOnboardingFallback
} from './stage-agents';
import { isLifecycle, serviceSignal, declaredExitReason } from './lifecycle-policy';


const modelDecision = z.object({ decision: z.enum(['AUTO', 'MANUAL']), reason: z.string().max(500), draft: z.string().max(4000) }).strict();
export type InboundDecision = { decision: 'AUTO' | 'MANUAL'; reason: string; reply: string | null; optOut?: boolean };
function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
const sensitive = /\b(precio|cuanto cuesta|costo|pago|cuota|descuento|promocion|promo|oferta|beca|semibeca|cupon|factura|renov\w*|cancel\w*|baja|reembolso|plan|cambiar|queja|reclamo|contrasena|correo|telefono|datos|privacidad|ingres\w*|admision|resultado|asesor|persona|humano|llamame)\b/i;
const optOut = /\b(no me (?:escriban|contacten|llamen)|dejen de (?:escribirme|contactarme|llamarme)|no quiero (?:mas )?(?:mensajes|comunicaciones))\b/i;
export function decideInbound(message: string, c: Pick<Contact, 'fullName' | 'stage' | 'contactPaused' | 'admissionStatus'>): InboundDecision {
  const raw = message.trim();
  const value = normalize(raw);
  const first = c.fullName.split(' ')[0];
  if (optOut.test(value)) return { decision: 'MANUAL', reason: 'El contacto pidió detener comunicaciones; se pausa el contacto y se alerta al operador.', reply: null, optOut: true };
  if (c.contactPaused || (c.stage === 'TURNED' && c.admissionStatus === 'ADMITTED')) return { decision: 'MANUAL', reason: 'El perfil requiere revisión humana antes de cualquier respuesta.', reply: null };
  const signal = isLifecycle(c.stage) ? serviceSignal(raw) : null;
  if (signal) return { decision: 'MANUAL', reason: `${signal}: requiere revisión humana de fidelización o reactivación; detener comunicaciones automáticas hasta resolver el caso.`, reply: null };
  if (sensitive.test(value)) return { decision: 'MANUAL', reason: 'La consulta necesita datos vigentes o una decisión autorizada por un operador.', reply: null };
  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|holi)[.!? ]*$/.test(value)) return { decision: 'AUTO', reason: 'Saludo simple y respuesta informativa segura.', reply: `Hola, ${first}. Soy el ${agents[c.stage]} de LaPreDigital. ¿En qué puedo ayudarte con tu preparación?` };
  if (/^(gracias|muchas gracias|ok|de acuerdo|perfecto)[.!? ]*$/.test(value)) return { decision: 'AUTO', reason: 'Agradecimiento o confirmación simple.', reply: `Con gusto, ${first}. Si necesitas algo más sobre tu preparación, escríbenos por aquí.` };
  if (/\b(virtual(?:es)?|presencial(?:es)?|digital(?:es)?|en linea|online)\b/.test(value) && /\b(es|son|tienen|hay|modalidad|clases|servicio)\b/.test(value)) return { decision: 'AUTO', reason: 'Modalidad digital confirmada por la organización.', reply: `Hola, ${first}. LaPreDigital brinda preparación académica completamente digital; no tenemos clases presenciales. ¿Quieres que te explique cómo funciona la experiencia en línea?` };
  if (/\b(unt|nacional de trujillo)\b/.test(value) && /\b(preparan|preparacion|preparar|para)\b/.test(value)) return { decision: 'AUTO', reason: 'Universidad objetivo confirmada por la organización.', reply: `Sí, ${first}. LaPreDigital ofrece preparación digital para los exámenes de admisión de la Universidad Nacional de Trujillo. ¿Qué carrera te interesa?` };
  return { decision: 'MANUAL', reason: 'La respuesta depende del contexto y no está cubierta por una base de conocimiento verificada.', reply: null };
}

export async function processInbound(messageId: number) {
  const db = tables();
  const incoming = plain<any>(await db.amp_messages.findByPk(messageId));
  if (!incoming || incoming.direction !== 'IN') return { skipped: true };
const existingClaim = plain<any>(await db.amp_inbound_triage.findOne({ where: { messageId } }));
  if (existingClaim) {
    const staleProcessing = existingClaim.decision === 'PROCESSING' && Date.now() - new Date(existingClaim.createdAt).getTime() > 5 * 60_000;
    if (!staleProcessing) return { duplicate: true };
    await db.amp_inbound_triage.destroy({ where: { id: existingClaim.id, decision: 'PROCESSING' } });
  }
  let claim: any;
  try {
    claim = await db.amp_inbound_triage.create({ messageId, contactId: incoming.contactId, decision: 'PROCESSING', reason: 'Triaje entrante en curso.', createdAt: new Date() });
  } catch (error) {
    if (await db.amp_inbound_triage.findOne({ where: { messageId } })) return { duplicate: true };
    throw error;
  }
  try {
    const c = await contact(incoming.contactId);
    if (!c) throw new Error('Contacto entrante no disponible');
    if (c.stage === 'BUYER' || c.stage === 'LEAD') await learnExplicitData(c.id, c, incoming.body);
    if (isLifecycle(c.stage) && serviceSignal(incoming.body)) {
      const exists = await db.amp_events.findOne({ where: { contactId: c.id, type: 'SERVICE_REVIEW_REQUIRED', actorId: `message:${messageId}` } });
      if (!exists) await event(c.id, 'SERVICE_REVIEW_REQUIRED', 'Revisión humana pendiente por una declaración del contacto.', 'CONTACT', `message:${messageId}`, { messageId, signal: serviceSignal(incoming.body), declaration: incoming.body });
    }
    const exitReason = c.stage === 'TURNED' ? declaredExitReason(incoming.body) : null;
    if (exitReason && !(await db.amp_events.findOne({ where: { contactId: c.id, type: 'TURNED_REASON', actorId: `message:${messageId}` } }))) {
      await event(c.id, 'TURNED_REASON', 'Motivo de baja declarado por el contacto; no inferido.', 'CONTACT', `message:${messageId}`, { messageId, declaration: exitReason });
    }

    if (c.stage === 'BUYER') {
      const signals = detectBuyerIntent(incoming.body);
      const existingSignals = plainMany<any>(await db.amp_events.findAll({ where: { contactId: c.id, type: 'BUYER_INTENT_SIGNAL' }, order: [['createdAt', 'DESC']], limit: 100 }));
      for (const signal of signals) {
        if (alreadyRecordedForMessage(existingSignals, messageId, signal.type)) continue;
        await event(c.id, 'BUYER_INTENT_SIGNAL', `Señal de intención Buyer: ${signal.type}.`, 'AGENT', agents.BUYER, {
          messageId, intentType: signal.type, evidence: signal.evidence, observedAt: new Date().toISOString(),
          recommendation: signal.recommendation,
          funnelRecommendation: 'Revisar paso Buyer → Lead; la etapa solo cambia cuando el datamart la confirme.'
        });
      }
    }

    let leadProfile: ReturnType<typeof buildLeadProfile> | null = null;
    if (c.stage === 'LEAD') {
      const previousRows = plainMany<any>(await db.amp_events.findAll({ where: { contactId: c.id, type: 'LEAD_NEGOTIATION_PROFILE' }, order: [['createdAt', 'DESC']], limit: 20 }));
      const previous = previousRows.map(row => eventDetails(row.detail)).find(detail => detail.progressiveProfile)?.progressiveProfile || {};
      const profileMessages = plainMany<any>(await db.amp_messages.findAll({ where: { contactId: c.id }, order: [['createdAt', 'DESC']], limit: 50 }));
      leadProfile = buildLeadProfile(c, profileMessages.map(row => ({ id: Number(row.id), direction: String(row.direction), body: String(row.body) })), previous);
      const existingProfiles = previousRows.map(row => ({ detail: row.detail }));
      if (!alreadyRecordedForMessage(existingProfiles, messageId)) {
        await event(c.id, 'LEAD_NEGOTIATION_PROFILE', `Perfil progresivo del lead actualizado; prioridad ${leadProfile.priority}.`, 'AGENT', agents.LEAD, {
          messageId, progressiveProfile: leadProfile.progressiveProfile, missingFields: leadProfile.missingFields,
          priority: leadProfile.priority, priorityReason: leadProfile.priorityReason, evidence: leadProfile.evidence,
          nextAction: leadProfile.nextAction, updatedAt: new Date().toISOString()
        });
      }
      const benefitApproval = explicitBenefitApproval(incoming.body, messageId);
      if (benefitApproval) {
        const duplicateApproval = (await db.amp_approvals.findAll({ where: { contactId: c.id, kind: benefitApproval.kind } }))
          .some(row => eventDetails(row.get('payload')).messageId === messageId);
        if (!duplicateApproval) {
          await db.amp_approvals.create({ ...benefitApproval, contactId: c.id, requestedBy: agents.LEAD, createdAt: new Date() });
          await event(c.id, 'APPROVAL_REQUEST', 'Solicitud explícita de beneficio pendiente de revisión humana.', 'AGENT', agents.LEAD, { messageId, kind: benefitApproval.kind, evidence: incoming.body });
        }
      }
    }

    const history = plainMany<any>(await db.amp_messages.findAll({ where: { contactId: c.id }, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 50 }));
    let decision = decideInbound(incoming.body, c);
    const recentForRadar = [...history].reverse();
    let suggestedDraft = fallbackDraft(c, 'REPLY', recentForRadar);
    if (c.stage === 'BUYER') {
      const first = c.fullName.split(' ')[0];
      const goal = [c.career, c.university].filter(Boolean).join(' en ');
      suggestedDraft = `Hola, ${first}. ${goal ? `Puedo orientarte sobre tu preparación para ${goal}.` : 'Puedo orientarte sobre la preparación digital.'} ¿Qué información necesitas para continuar?`;
    } else if (c.stage === 'LEAD' && leadProfile) {
      suggestedDraft = buildLeadFallback(c, leadProfile, incoming.body);
    } else if (c.stage === 'PAYER') {
      const onboarding = assessPayerOnboarding(c, history, new Date());
      suggestedDraft = payerOnboardingFallback(c, onboarding);
      const existingAssessments = plainMany<any>(await db.amp_events.findAll({ where: { contactId: c.id, type: 'PAYER_ONBOARDING' }, order: [['createdAt', 'DESC']], limit: 30 }));
      if (!alreadyRecordedForMessage(existingAssessments.map(row => ({ detail: row.detail })), messageId)) {
        await event(c.id, 'PAYER_ONBOARDING', 'Estado disponible de onboarding actualizado desde la conversación.', 'AGENT', agents.PAYER, {
          messageId, ...onboarding, recommendation: onboarding.nextAction,
          sourceFields: ['stageChangedAt', 'lastActivityAt', 'academicStatus', 'progress']
        });
      }
    }
    const historyDesc = plainMany<any>(await db.amp_messages.findAll({ where: { contactId: c.id }, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 8 }));
    try {
      const inboundSystem = ['BUYER', 'LEAD', 'PAYER'].includes(c.stage) ? inboundPromptForStage(c.stage)
        : 'Eres el evaluador de respuesta entrante de LaPreDigital. Devuelve solo JSON válido con decision AUTO o MANUAL, reason y draft. Prioriza MANUAL ante cualquier duda, dato cambiante, pago, oferta, beca, queja, cancelación, datos personales o resultado de admisión. No inventes hechos ni promociones. Un AUTO solo sirve para saludo o un dato institucional confirmado.';
      const result = await generate(inboundSystem, JSON.stringify({
        task: 'classify_inbound_and_prepare_review_draft', stage: c.stage,
        confirmedProfile: { career: c.career, university: c.university, plan: c.plan, paymentStatus: c.paymentStatus, renewalAt: c.renewalAt },
        leadAssessment: leadProfile ? { priority: leadProfile.priority, priorityReason: leadProfile.priorityReason, missingFields: leadProfile.missingFields, nextAction: leadProfile.nextAction } : null,
        incoming: incoming.body, recentMessages: historyDesc.map(message => ({ direction: message.direction, body: message.body }))
      }));
      const parsed = modelDecision.parse(JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g, '')));
      if (decision.decision === 'AUTO' && parsed.decision === 'MANUAL') decision = { decision: 'MANUAL', reason: `El modelo solicitó revisión humana: ${parsed.reason}`, reply: null };
      if (parsed.draft && !/\b(?:descuento|beca|semibeca|cup[oó]n|promoci[oó]n|\d{1,3}\s?%)\b/i.test(parsed.draft)) suggestedDraft = parsed.draft;
    } catch { /* Sin modelo o salida inválida: prevalece la regla conservadora y el borrador de etapa. */ }

    if (decision.optOut) {
      await db.amp_overrides.create({ contactId: c.id, field: 'contactPaused', value: 'true', confidence: 1, source: 'AGENT', actorId: 'inbound-triage', reason: 'Solicitud explícita de no recibir comunicaciones.', createdAt: new Date() });
      await event(c.id, 'CONTACT_PAUSED', 'Contacto pausado por solicitud explícita en el chat.', 'AGENT', 'inbound-triage', { messageId });
    }
    const allowed = incoming.channel === 'WHATSAPP' ? c.consentWhatsapp && !!c.phone : c.consentEmail && !!c.email;
    if (decision.decision === 'AUTO' && !allowed) decision = { decision: 'MANUAL', reason: 'Falta autorización o dirección para responder en el canal de origen.', reply: null };
    if (decision.decision === 'AUTO' && decision.reply) {
      try {
        const existing = await db.amp_messages.findOne({ where: { replyToId: messageId, direction: 'OUT' } });
        if (!existing) await sendMessage(c.id, incoming.channel as Channel, decision.reply, 'AGENT', agents[c.stage], true, true, 'STUDENT', messageId);
        await claim.update({ decision: 'AUTO_SENT', reason: decision.reason });
        await event(c.id, 'AUTO_REPLY', 'El agente respondió una consulta verificada de bajo riesgo.', 'AGENT', agents[c.stage], { messageId, reason: decision.reason });
        return { decision: 'AUTO_SENT' };
      } catch (error) {
        decision = { decision: 'MANUAL', reason: `La respuesta automática no pudo enviarse: ${String(error)}`, reply: null };
      }
    }
    const key = `manual-reply:${messageId}`;
    const existingInsight = await db.amp_insights.findOne({ where: { dedupeKey: key } });
    if (!existingInsight) {
      await db.amp_insights.update({ status: 'SUPERSEDED', updatedAt: new Date() }, { where: { contactId: c.id, status: 'OPEN' } });
      await db.amp_insights.create({ dedupeKey: key, contactId: c.id, stage: c.stage, channel: allowed && !decision.optOut ? incoming.channel : null, phase: 'MANUAL_REPLY', status: 'OPEN', alert: true, silenceDays: 0, deadlineAt: null, sourceMessageId: messageId, draft: decision.optOut ? null : suggestedDraft, strategy: decision.reason, provider: 'TRIAGE', model: 'POLICY', createdAt: new Date(), updatedAt: new Date() });
    }
    await claim.update({ decision: 'MANUAL', reason: decision.reason });
    await event(c.id, 'MANUAL_REPLY_REQUIRED', `Respuesta manual requerida: ${decision.reason}`, 'AGENT', 'inbound-triage', { messageId });
    return { decision: 'MANUAL' };
  } catch (error) {
    await db.amp_inbound_triage.destroy({ where: { id: claim.id, decision: 'PROCESSING' } });
    throw error;
  }
}
