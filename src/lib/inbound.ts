import { z } from 'zod';
import { plain, plainMany, tables } from './db';
import { contact, event } from './contacts';
import { generate } from './ai';
import { fallbackDraft } from './radar';
import { sendMessage } from './messaging';
import { agents, type Channel, type Contact } from './types';
import { learnExplicitData } from './agents';

const modelDecision = z.object({ decision: z.enum(['AUTO', 'MANUAL']), reason: z.string().max(500), draft: z.string().max(4000) });
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
  if (await db.amp_inbound_triage.findOne({ where: { messageId } })) return { duplicate: true };
  const c = await contact(incoming.contactId);
  if (!c) throw new Error('Contacto entrante no disponible');
  if (c.stage === 'BUYER' || c.stage === 'LEAD') await learnExplicitData(c.id, c, incoming.body);
  let decision = decideInbound(incoming.body, c);
  const history = plainMany<any>(await db.amp_messages.findAll({ where: { contactId: c.id }, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 8 }));
  let suggestedDraft = fallbackDraft(c, 'REPLY', [...history].reverse());
  try {
    const result = await generate('Eres el evaluador de respuesta entrante de LaPreDigital. Devuelve solo JSON válido con decision AUTO o MANUAL, reason y draft. Prioriza MANUAL ante cualquier duda, dato cambiante, pago, oferta, beca, queja, cancelación, datos personales o resultado de admisión. No inventes hechos ni promociones. Un AUTO solo sirve para saludo o un dato institucional confirmado.', JSON.stringify({ stage: c.stage, profile: { career: c.career, plan: c.plan }, incoming: incoming.body, recentMessages: history.map(m => ({ direction: m.direction, body: m.body })) }));
    const parsed = modelDecision.parse(JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g, '')));
    if (decision.decision === 'AUTO' && parsed.decision === 'MANUAL') decision = { decision: 'MANUAL', reason: `El modelo solicitó revisión humana: ${parsed.reason}`, reply: null };
    if (parsed.draft && !/\b(?:descuento|beca|semibeca|cup[oó]n|promoci[oó]n|\d{1,3}\s?%)\b/i.test(parsed.draft)) suggestedDraft = parsed.draft;
  } catch { /* Sin modelo o salida inválida: prevalece la regla conservadora. */ }
  if (decision.optOut) {
    await db.amp_overrides.create({ contactId: c.id, field: 'contactPaused', value: 'true', confidence: 1, source: 'AGENT', actorId: 'inbound-triage', reason: 'Solicitud explícita de no recibir comunicaciones.', createdAt: new Date() });
    await event(c.id, 'CONTACT_PAUSED', 'Contacto pausado por solicitud explícita en el chat.', 'AGENT', 'inbound-triage', { messageId });
  }
  const allowed = incoming.channel === 'WHATSAPP' ? c.consentWhatsapp && c.phone : c.consentEmail && c.email;
  if (decision.decision === 'AUTO' && !allowed) decision = { decision: 'MANUAL', reason: 'Falta autorización o dirección para responder en el canal de origen.', reply: null };
  if (decision.decision === 'AUTO' && decision.reply) {
    try {
      const existing = await db.amp_messages.findOne({ where: { replyToId: messageId, direction: 'OUT' } });
      if (!existing) await sendMessage(c.id, incoming.channel as Channel, decision.reply, 'AGENT', agents[c.stage], true, true, 'STUDENT', messageId);
      await db.amp_inbound_triage.create({ messageId, contactId: c.id, decision: 'AUTO_SENT', reason: decision.reason, createdAt: new Date() });
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
  await db.amp_inbound_triage.create({ messageId, contactId: c.id, decision: 'MANUAL', reason: decision.reason, createdAt: new Date() });
  await event(c.id, 'MANUAL_REPLY_REQUIRED', `Respuesta manual requerida: ${decision.reason}`, 'AGENT', 'inbound-triage', { messageId });
  return { decision: 'MANUAL' };
}
