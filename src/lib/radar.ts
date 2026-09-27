import { Op } from 'sequelize';
import { plain, plainMany, tables } from './db';
import { contact, event } from './contacts';
import { channelFor } from './agents';
import { generate } from './ai';
import { agents, type Channel, type Contact } from './types';
import { parseStructuredProposal, promptForStage } from './stage-agents';
import { isLifecycle, serviceSignal, lifecycleAssessment, recoveryWindow } from './lifecycle-policy';
import { lifecycleContext, lifecycleAutomaticBlock } from './lifecycle';

type ConversationMessage = { id: number; direction: string; body: string; channel: string; recipientKind?: string; createdAt: string | Date };
export type ConversationAssessment = { phase: string; silenceDays: number; deadlineAt: Date | null; sourceMessageId: number; alert: boolean };
const followupDays = [3, 7, 14, 21];

export function assessConversation(messages: ConversationMessage[], maxDays: number, now = new Date(), stageChangedAt?: string | Date | null): ConversationAssessment | null {
  const afterStage = stageChangedAt ? new Date(stageChangedAt).getTime() : 0;
  const ordered = messages.filter(m => m.recipientKind !== 'GUARDIAN' && new Date(m.createdAt).getTime() >= afterStage).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id);
  if (!ordered.length) return null;
  let firstUnanswered: Date | null = null;
  for (const message of ordered) {
    if (message.direction === 'IN') firstUnanswered = null;
    if (message.direction === 'OUT' && !firstUnanswered) firstUnanswered = new Date(message.createdAt);
  }
  const latest = ordered.at(-1)!;
  if (latest.direction === 'IN') return { phase: 'REPLY', silenceDays: 0, deadlineAt: null, sourceMessageId: latest.id, alert: false };
  if (!firstUnanswered) return null;
  const silenceDays = Math.max(0, Math.floor((now.getTime() - firstUnanswered.getTime()) / 86400000));
  const deadlineAt = new Date(firstUnanswered.getTime() + maxDays * 86400000);
  if (silenceDays >= maxDays) return { phase: 'STOP', silenceDays, deadlineAt, sourceMessageId: latest.id, alert: true };
  const step = followupDays.filter(day => day < maxDays && silenceDays >= day).length;
  return { phase: step ? `FOLLOWUP_${step}` : 'WAIT', silenceDays, deadlineAt, sourceMessageId: latest.id, alert: step > 0 };
}

export async function radarConfig() {
  const row = plain<any>(await tables().amp_settings.findOne({ where: { key: 'followup' } }));
  let maxDays = 30;
  try { maxDays = Number(JSON.parse(row?.value || '{}').maxDays || 30); } catch { /* valor predeterminado */ }
  return { maxDays: Number.isInteger(maxDays) && maxDays >= 1 && maxDays <= 90 ? maxDays : 30 };
}

function insightKey(c: Contact, assessment: ConversationAssessment, maxDays: number) {
  return `radar:v2:${c.id}:${c.stage}:${assessment.sourceMessageId}:${assessment.phase}:${maxDays}`;
}
export async function scanRadar(now = new Date()) {
  const db = tables();
  const { maxDays } = await radarConfig();
  const all = plainMany<Contact>(await db.dm_contacts.findAll());
  let queued = 0;
  for (const base of all) {
    const c = await contact(base.id);
    if (!c) continue;
    if (isLifecycle(c.stage) && await lifecycleAutomaticBlock(c.id)) {
      await db.amp_insights.update({ status: 'SUPERSEDED', updatedAt: now }, { where: { contactId: c.id, status: 'OPEN', phase: { [Op.notIn]: ['MANUAL_REPLY', 'LIFECYCLE'] } } });
      continue;
    }
    if (c.contactPaused || (c.stage === 'TURNED' && c.admissionStatus === 'ADMITTED')) {
      await db.amp_insights.update({ status: 'SUPERSEDED', updatedAt: now }, { where: { contactId: c.id, status: 'OPEN', phase: { [Op.ne]: 'MANUAL_REPLY' } } });
      continue;
    }
    const messages = plainMany<ConversationMessage>(await db.amp_messages.findAll({ where: { contactId: c.id }, order: [['createdAt', 'ASC'], ['id', 'ASC']] }));
    const assessment = assessConversation(messages, maxDays, now, c.stageChangedAt);
    if (!assessment) continue;
    if (isLifecycle(c.stage) && assessment.phase !== 'REPLY' && await db.amp_insights.findOne({ where: { contactId: c.id, phase: 'LIFECYCLE', status: 'OPEN' } })) continue;
    if (assessment.phase === 'REPLY' && await db.amp_inbound_triage.findOne({ where: { messageId: assessment.sourceMessageId, decision: 'MANUAL' } })) continue;
    const key = insightKey(c, assessment, maxDays);
    if (await db.amp_insights.findOne({ where: { dedupeKey: key } })) continue;
    const existingJob = await db.amp_jobs.findOne({ where: { dedupeKey: key } });
    if (existingJob) continue;
    await db.amp_jobs.create({ kind: 'ANALYZE', contactId: c.id, payload: JSON.stringify({ key, sourceMessageId: assessment.sourceMessageId, phase: assessment.phase, maxDays }), status: 'PENDING', runAt: now, dedupeKey: key, attempts: 0, createdAt: now });
    queued++;
  }
  return queued;
}

function strategy(c: Contact, assessment: ConversationAssessment, messages: ConversationMessage[]) {
  const lastInbound = [...messages].reverse().find(message => message.direction === 'IN')?.body?.toLowerCase() || '';
  const obstacle = /precio|caro|pago|cuota|descuento|beca/.test(lastInbound) ? 'Resolver la duda económica con información vigente; cualquier descuento requiere aprobación.' : /tiempo|horario|trabajo/.test(lastInbound) ? 'Proponer una ruta de estudio flexible y concreta.' : /acceso|no funciona|error|plataforma|no puedo entrar/.test(lastInbound) ? 'Revisar la incidencia de acceso con un operador y pedir el dato mínimo necesario para ubicarla.' : /curso|simulacro|puntaje/.test(lastInbound) ? 'Conectar la respuesta con su progreso y los recursos disponibles.' : 'Hacer una pregunta breve que facilite responder sin presión.';
  if (assessment.phase === 'REPLY') return `Responder la consulta reciente por el MCE. ${obstacle}`;
  if (assessment.phase === 'WAIT') return 'Esperar respuesta. El agente revisará el chat de nuevo cuando corresponda el primer seguimiento.';
  if (assessment.phase === 'STOP') return `Plazo máximo alcanzado (${assessment.silenceDays} días). Detener el seguimiento saliente; atender solo si el contacto vuelve a escribir.`;
  if (assessment.phase === 'FOLLOWUP_1') return `Primer seguimiento: preguntar si necesita aclarar algo. ${obstacle}`;
  if (assessment.phase === 'FOLLOWUP_2') return `Segundo seguimiento: aportar valor relacionado con ${c.career || 'su preparación'} y preguntar cuál es el principal obstáculo. ${obstacle}`;
  if (assessment.phase === 'FOLLOWUP_3') return 'Revisar si el MCE sigue siendo adecuado. Cambiarlo únicamente si el contacto lo pidió o un operador lo valida.';
  return 'Último intento respetuoso antes del plazo máximo; ofrecer dejar abierta la conversación sin presionar.';
}
export function fallbackDraft(c: Contact, phase: string, messages: ConversationMessage[]) {
  if (isLifecycle(c.stage) && (phase === 'REPLY' || phase.startsWith('FOLLOWUP_'))) {
    const a = lifecycleAssessment(c, [], messages, []);
    if (phase === 'REPLY' && serviceSignal(messages.filter(m => m.direction === 'IN').at(-1)?.body || '')) return a.draft || '';
    if (c.stage === 'TURNED') return a.draft || `Hola, ${c.fullName.split(' ')[0]}. Un operador puede revisar tu consulta. ¿Qué necesitas aclarar?`;
    if (phase === 'REPLY') return `Hola, ${c.fullName.split(' ')[0]}. Revisaremos tu consulta con el equipo de fidelización. ¿Qué dificultad necesitas que atendamos?`;
  }
  const first = c.fullName.split(' ')[0];
  const lastInbound = [...messages].reverse().find(message => message.direction === 'IN')?.body?.toLowerCase() || '';
  if (phase === 'REPLY' && /precio|caro|pago|cuota|descuento|beca/.test(lastInbound)) return `Hola, ${first}. Gracias por consultar. Puedo ayudarte a comparar los planes vigentes de LaPreDigital. Si necesitas apoyo económico, un operador puede revisar tu caso antes de ofrecerte algo. ¿Prefieres conocer la opción mensual o anual?`;
  if (phase === 'REPLY' && /tiempo|horario|trabajo/.test(lastInbound)) return `Hola, ${first}. Entiendo que el tiempo es importante. La preparación es digital y podemos ayudarte a organizar una ruta flexible. ¿Cuántas horas a la semana podrías dedicarle?`;
  if (phase === 'REPLY' && /acceso|no funciona|error|plataforma|no puedo entrar/.test(lastInbound)) return `Hola, ${first}. Lamento el problema con la plataforma. Un operador revisará lo que ocurre. ¿Puedes indicarnos qué pantalla o curso presenta el error?`;
  if (phase === 'REPLY' && /curso|simulacro|puntaje/.test(lastInbound)) return `Hola, ${first}. Podemos revisar juntos tus cursos y simulacros disponibles para decidir qué reforzar. ¿Cuál te está costando más ahora?`;
  if (phase === 'REPLY') return `Hola, ${first}. Gracias por escribirnos. ¿Podrías contarnos qué necesitas aclarar sobre tu preparación en LaPreDigital?`;
  if (phase === 'FOLLOWUP_1') return `Hola, ${first}. ¿Pudiste revisar nuestro último mensaje? Si tienes alguna duda sobre tu preparación, puedo ayudarte.`;
  if (phase === 'FOLLOWUP_2') return `Hola, ${first}. Para ayudarte mejor con ${c.career || 'tu objetivo académico'}, ¿qué es lo que más te dificulta continuar ahora?`;
  if (phase === 'FOLLOWUP_3') return `Hola, ${first}. Queremos respetar tu tiempo. ¿Este sigue siendo el mejor medio para conversar sobre tu preparación?`;
  if (phase === 'FOLLOWUP_4') return `Hola, ${first}. Si más adelante quieres retomar tu preparación, estaremos disponibles. ¿Deseas que dejemos aquí el seguimiento por ahora?`;
  return '';
}
function suggestedChannel(c: Contact, messages: ConversationMessage[]): Channel | null {
  const recent = messages.at(-1)?.channel;
  if (recent === 'WHATSAPP' && c.consentWhatsapp && c.phone) return 'WHATSAPP';
  if (recent === 'EMAIL' && c.consentEmail && c.email) return 'EMAIL';
  const mce = channelFor(c.stage, c.interestChannel);
  if (mce === 'WHATSAPP' && c.consentWhatsapp && c.phone) return mce;
  if (mce === 'EMAIL' && c.consentEmail && c.email) return mce;
  if (c.consentWhatsapp && c.phone) return 'WHATSAPP';
  if (c.consentEmail && c.email) return 'EMAIL';
  return null;
}
export async function runRadar(contactId: number, expected: { key: string; sourceMessageId: number; phase: string; maxDays: number }, now = new Date()) {
  const db = tables();
  const c = await contact(contactId);
  if (!c || c.contactPaused || (c.stage === 'TURNED' && c.admissionStatus === 'ADMITTED')) return { skipped: true };
  if (isLifecycle(c.stage) && await lifecycleAutomaticBlock(contactId)) return { skipped: true };
  const messages = plainMany<ConversationMessage>(await db.amp_messages.findAll({ where: { contactId }, order: [['createdAt', 'ASC'], ['id', 'ASC']] }));
  const currentMax = (await radarConfig()).maxDays;
  const assessment = assessConversation(messages, currentMax, now, c.stageChangedAt);
  if (isLifecycle(c.stage) && assessment?.phase !== 'REPLY' && await db.amp_insights.findOne({ where: { contactId, phase: 'LIFECYCLE', status: 'OPEN' } })) return { skipped: true };
  if (assessment?.phase === 'REPLY' && await db.amp_inbound_triage.findOne({ where: { messageId: assessment.sourceMessageId, decision: 'MANUAL' } })) return { manual: true };
  if (!assessment || assessment.sourceMessageId !== expected.sourceMessageId || assessment.phase !== expected.phase || currentMax !== expected.maxDays || insightKey(c, assessment, currentMax) !== expected.key) return { stale: true };
  if (await db.amp_insights.findOne({ where: { dedupeKey: expected.key } })) return { duplicate: true };
  const advice = strategy(c, assessment, messages);
  let draft = fallbackDraft(c, assessment.phase, messages), provider = 'RULES', model = 'RULES';
  if (draft && !isLifecycle(c.stage)) {
    try {
      if (['BUYER', 'LEAD', 'PAYER'].includes(c.stage)) {
        const result = await generate(`${promptForStage(c.stage)}\n\nEres también el Radar transversal. Redacta solo un borrador breve para revisión humana; NO lo envíes. Devuelve el objeto JSON estructurado de la etapa.`, JSON.stringify({ phase: assessment.phase, silenceDays: assessment.silenceDays, stage: c.stage, name: c.fullName, career: c.career, university: c.university, plan: c.plan, strategy: advice, recentMessages: messages.slice(-8).map(m => ({ direction: m.direction, body: m.body })) }));
        const proposal = parseStructuredProposal(result.text);
        if (proposal.draft && proposal.proposalType === 'NONE' && !proposal.needsApproval && !/descuento|beca|semibeca|cup[oó]n|promoci[oó]n|\d{1,3}\s?%/i.test(proposal.draft)) { draft = proposal.draft.slice(0, 4000); provider = result.provider; model = result.model; }
      } else {
        const result = await generate(`Eres el analista de conversaciones del ${agents[c.stage]} de LaPreDigital. Redacta únicamente UN borrador de mensaje breve en español peruano. Es sugerencia para revisión humana; NO lo envíes. Respeta la conversación y el canal. No inventes datos, precios, resultados, becas, promociones ni descuentos. No prometas ingreso. No presiones ni repitas el último mensaje.`, JSON.stringify({ phase: assessment.phase, silenceDays: assessment.silenceDays, stage: c.stage, name: c.fullName, career: c.career, strategy: advice, recentMessages: messages.slice(-8).map(m => ({ direction: m.direction, body: m.body })) }));
        if (result.text && !/descuento|beca|semibeca|cup[oó]n|promoci[oó]n|\d{1,3}\s?%/i.test(result.text)) { draft = result.text.slice(0, 4000); provider = result.provider; model = result.model; }
      }
    } catch { /* plantilla explícita cuando no hay llave o falla el proveedor */ }
  }
  const latestNow = plain<any>(await db.amp_messages.findOne({ where: { contactId, recipientKind: 'STUDENT' }, order: [['createdAt', 'DESC'], ['id', 'DESC']] }));
  const freshContact = await contact(contactId);
  if (!latestNow || latestNow.id !== assessment.sourceMessageId || !freshContact || freshContact.stage !== c.stage || freshContact.contactPaused || (freshContact.stage === 'TURNED' && freshContact.admissionStatus === 'ADMITTED')) return { stale: true };
  await db.amp_insights.update({ status: 'SUPERSEDED', updatedAt: now }, { where: { contactId, status: 'OPEN', ...(isLifecycle(c.stage) ? { phase: { [Op.ne]: 'LIFECYCLE' } } : {}) } });
  const insight = await db.amp_insights.create({ dedupeKey: expected.key, contactId, stage: c.stage, channel: suggestedChannel(c, messages), phase: assessment.phase, status: 'OPEN', alert: assessment.alert, silenceDays: assessment.silenceDays, deadlineAt: assessment.deadlineAt, sourceMessageId: assessment.sourceMessageId, draft, strategy: advice, provider, model, createdAt: now, updatedAt: now });
  await event(contactId, assessment.phase === 'STOP' ? 'FOLLOWUP_STOP' : assessment.alert ? 'SILENCE_ALERT' : 'RADAR_INSIGHT', assessment.phase === 'STOP' ? advice : `Radar: ${advice}`, 'AGENT', 'Radar', { insightId: insight.get('id'), silenceDays: assessment.silenceDays });
  return { insightId: insight.get('id'), phase: assessment.phase };
}

export async function openInsights(contactId?: number) {
  const where: Record<string, unknown> = { status: 'OPEN' };
  if (contactId) where.contactId = contactId;
  return plainMany<any>(await tables().amp_insights.findAll({ where, order: [['alert', 'DESC'], ['createdAt', 'DESC']], limit: 200 }));
}
export async function dismissInsight(id: number, actorId: number) {
  const db = tables();
  const row = plain<any>(await db.amp_insights.findByPk(id));
  if (!row || row.status !== 'OPEN') throw new Error('Sugerencia no disponible');
  const [updated] = await db.amp_insights.update({ status: 'DISMISSED', updatedAt: new Date() }, { where: { id, status: 'OPEN' } });
  if (!updated) throw new Error('La sugerencia ya fue atendida');
  await event(row.contactId, 'RADAR_DISMISSED', 'Sugerencia del Radar revisada y descartada.', 'OPERATOR', String(actorId), { insightId: id });
}
export async function sendInsight(id: number, actorId: number) {
  const db = tables();
  const row = plain<any>(await db.amp_insights.findByPk(id));
  if (!row || row.status !== 'OPEN' || !row.draft || !row.channel || row.phase === 'WAIT' || row.phase === 'STOP') throw new Error('Borrador no disponible para envío');
  const c = await contact(row.contactId);
  if (!c || c.stage !== row.stage || c.contactPaused || (c.stage === 'TURNED' && c.admissionStatus === 'ADMITTED')) throw new Error('El perfil cambió; revisa la sugerencia');
  if (row.phase === 'LIFECYCLE') {
    const fresh = await lifecycleContext(c.id);
    if (!fresh || fresh.key !== row.dedupeKey) throw new Error('La evidencia cambió; solicita un nuevo análisis del agente');
  }
  if (c.stage === 'TURNED' && row.phase !== 'MANUAL_REPLY' && !recoveryWindow(c).allowed) throw new Error('El plazo de recuperación terminó o la fecha de baja no está validada');
  if (isLifecycle(c.stage) && row.phase !== 'MANUAL_REPLY' && await lifecycleAutomaticBlock(c.id)) throw new Error('Resuelve la revisión de servicio antes del seguimiento');
  const latest = plain<any>(await db.amp_messages.findOne({ where: { contactId: row.contactId, recipientKind: 'STUDENT' }, order: [['createdAt', 'DESC'], ['id', 'DESC']] }));
  if ((latest?.id || 0) !== row.sourceMessageId) throw new Error('Hay mensajes nuevos; espera la nueva recomendación');
  const [claimed] = await db.amp_insights.update({ status: 'SENDING', updatedAt: new Date() }, { where: { id, status: 'OPEN' } });
  if (!claimed) throw new Error('Otro operador ya está atendiendo la sugerencia');
  try {
    const message = await (await import('./messaging')).sendMessage(c.id, row.channel as Channel, row.draft, 'OPERATOR', String(actorId), false);
    await db.amp_insights.update({ status: 'USED', updatedAt: new Date() }, { where: { id, status: 'SENDING' } });
    await event(c.id, 'RADAR_SENT', 'Operador envió el borrador sugerido por el Radar.', 'OPERATOR', String(actorId), { insightId: id, messageId: message.get('id') });
    return message;
  } catch (error) {
    await db.amp_insights.update({ status: 'OPEN', updatedAt: new Date() }, { where: { id, status: 'SENDING' } });
    throw error;
  }
}
