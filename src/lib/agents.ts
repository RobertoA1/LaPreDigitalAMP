import { plain, plainMany, tables } from './db';
import { contact, event, recommend } from './contacts';
import { agents, type Channel } from './types';
import { generate } from './ai';
import { sendToBoth, sendToPermittedRecipients } from './messaging';
import {
  assessPayerOnboarding, buildLeadFallback, buildLeadProfile, buyerDraftRepeatsOffer, buyerOffersAlreadyPresented, eventDetails,
  isInformationalPriceQuery, leadApprovalKind, parseStructuredProposal, payerDraftClaimsUnconfirmedFacts, promptForStage, proposalFallback,
  type LeadProfile, type StageProposal
} from './stage-agents';

export function channelFor(stage: string, interest: string | null): Channel | null {
  if (stage === 'BUYER') return null;
  const normalized = (interest || '').toUpperCase();
  if (normalized.includes('WHATSAPP')) return 'WHATSAPP';
  if (normalized.includes('MAIL') || normalized.includes('CORREO')) return 'EMAIL';
  return null;
}
function template(stage: string, name: string, career: string | null, plan: string | null, renewalAt: string | null, academicSummary: string) {
  const first = name.split(' ')[0];
  if (stage === 'BUYER') return `Hola, ${first}. En LaPreDigital puedes preparar ${career || 'tu examen de admisión'} desde donde estés. ¿Te gustaría conocer la prueba Explora UNT de 14 días?`;
  if (stage === 'LEAD') return `Hola, ${first}. Según tu interés en ${career || 'tu carrera objetivo'}, podemos ayudarte con una ruta de estudio digital. ¿Qué duda te gustaría resolver sobre ${plan || 'nuestros planes'}?`;
  if (stage === 'PAYER') return `Hola, ${first}. Queremos ayudarte a continuar tu preparación. Tu periodo vence ${renewalAt ? new Date(renewalAt).toLocaleDateString('es-PE') : 'próximamente'}. ¿Necesitas ayuda con la renovación?`;
  if (stage === 'CUSTOMER') return `Hola, ${first}. ¿Cómo va tu preparación esta semana? Podemos ayudarte a revisar tu avance, cursos pendientes y próximos simulacros.`;
  return `Hola, ${first}. Nos gustaría conocer cómo fue tu experiencia con LaPreDigital y si podemos ayudarte a retomar tu preparación. ¿Qué podríamos mejorar?`;
}

type AgentMessage = { id: number; direction: string; body: string; channel: Channel; createdAt: Date | string; recipientKind?: string };

function buyerFallback(c: NonNullable<Awaited<ReturnType<typeof contact>>>, messages: AgentMessage[]) {
  const first = c.fullName.split(' ')[0];
  const goal = [c.career, c.university].filter(Boolean).join(' en ');
  const offeredTrial = messages.some(message => message.direction === 'OUT' && /\b(explora|prueba gratuita|prueba de 14|14 d[ií]as)\b/i.test(message.body));
  const base = `Hola, ${first}. ${goal ? `Puedes prepararte para ${goal} con LaPreDigital.` : 'LaPreDigital te acompaña en tu preparación universitaria digital.'}`;
  return offeredTrial ? `${base} ¿Qué información te ayudaría a decidir si continuar?` : `${base} ¿Te gustaría conocer la prueba Explora UNT de 14 días?`;
}

function buyerFacts(c: NonNullable<Awaited<ReturnType<typeof contact>>>) {
  return [c.career ? `career=${c.career}` : null, c.university ? `university=${c.university}` : null].filter((value): value is string => !!value);
}

function leadQuestionConflictsWithKnownData(draft: string, profile: LeadProfile) {
  const value = draft.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (profile.career && /que carrera|a que carrera/.test(value)) return true;
  if (profile.difficulties && /que curso|que tema|que te resulta mas dificil/.test(value)) return true;
  if (profile.availability && /cuanto tiempo|cuantas horas|disponibilidad/.test(value)) return true;
  if (profile.plan && /que plan|que tipo de plan/.test(value)) return true;
  if (profile.trialStatus && /pudiste activar|estado de la prueba/.test(value)) return true;
  if (profile.economicDecisionMaker && /quien decide|tu decides el plan/.test(value)) return true;
  return false;
}

async function saveAssessment(contactId: number, stage: string, detail: Record<string, unknown>) {
  await event(contactId, 'STAGE_AGENT_ASSESSMENT', `Evaluación estructurada del agente ${agents[stage as keyof typeof agents]}.`, 'AGENT', agents[stage as keyof typeof agents], detail);
}

async function generateProposal(stage: 'BUYER' | 'LEAD' | 'PAYER', context: unknown) {
  const result = await generate(promptForStage(stage), JSON.stringify({
    stage, context,
    requiredOutput: 'JSON object with draft:string, nextAction:string, priority:ALTA|MEDIA|BAJA, priorityReason:string, missingFields:string[], proposalType:NONE|DISCOUNT|SCHOLARSHIP|HALF_SCHOLARSHIP, needsApproval:boolean, factsUsed:string[]'
  }));
  return { proposal: parseStructuredProposal(result.text), provider: result.provider, model: result.model };
}

async function hasPendingApproval(contactId: number, kind: string) {
  return !!(await tables().amp_approvals.findOne({ where: { contactId, kind, status: 'PENDING' } }));
}

async function runImpulseAgent(c: NonNullable<Awaited<ReturnType<typeof contact>>>, messages: AgentMessage[], inbound: boolean) {
  const db = tables();
  const extendedMessages = plainMany<any>(await db.amp_messages.findAll({ where: { contactId: c.id }, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 60 })) as AgentMessage[];
  let fallback: StageProposal;
  let context: Record<string, unknown>;
  let leadProfile: LeadProfile | null = null;
  let payerAssessment: ReturnType<typeof assessPayerOnboarding> | null = null;

  if (c.stage === 'BUYER') {
    const allOutbound = plainMany<any>(await db.amp_messages.findAll({ where: { contactId: c.id, direction: 'OUT' }, order: [['createdAt', 'DESC']] })) as AgentMessage[];
    const priorOffers = buyerOffersAlreadyPresented(allOutbound);
    const signalRows = await db.amp_events.findAll({ where: { contactId: c.id, type: 'BUYER_INTENT_SIGNAL' }, order: [['createdAt', 'DESC']], limit: 20 });
    const signals = signalRows.map(row => eventDetails(row.get('detail'))).filter(detail => detail.intentType);
    const draft = buyerFallback(c, allOutbound);
    const nextAction = signals.length
      ? 'Revisar las señales de intención y valorar Buyer → Lead; el datamart confirma cualquier cambio de etapa.'
      : 'Resolver la duda con información verificada y registrar señales de intención del buyer.';
    fallback = proposalFallback(draft, nextAction, buyerFacts(c));
    context = {
      confirmedFacts: { firstName: c.fullName.split(' ')[0], career: c.career, university: c.university },
      intentSignals: signals.slice(0, 8),
      priorOffers,
      recommendations: await recommend(c),
      recentMessages: messages.map(message => ({ direction: message.direction, body: message.body, channel: message.channel }))
    };
  } else if (c.stage === 'LEAD') {
    const assessmentRows = await db.amp_events.findAll({ where: { contactId: c.id, type: 'LEAD_NEGOTIATION_PROFILE' }, order: [['createdAt', 'DESC']], limit: 10 });
    const prior = assessmentRows.map(row => eventDetails(row.get('detail'))).find(detail => detail.progressiveProfile)?.progressiveProfile || {};
    leadProfile = buildLeadProfile(c, extendedMessages.map(row => ({ id: Number(row.id), direction: String(row.direction), body: String(row.body) })), prior);
    const latestInbound = messages.find(message => message.direction === 'IN')?.body || '';
    const draft = buildLeadFallback(c, leadProfile, latestInbound);
    fallback = {
      ...proposalFallback(draft, leadProfile.nextAction, [leadProfile.evidence, ...Object.entries({ career: leadProfile.career, difficulties: leadProfile.difficulties, availability: leadProfile.availability, plan: leadProfile.plan, trialStatus: leadProfile.trialStatus, economicDecisionMaker: leadProfile.economicDecisionMaker }).filter(([, value]) => value).map(([field]) => field)].filter(Boolean)),
      priority: leadProfile.priority,
      priorityReason: leadProfile.priorityReason,
      missingFields: leadProfile.missingFields
    };
    context = {
      confirmedProgressiveProfile: leadProfile,
      latestInbound,
      currentPlan: c.plan,
      approvedCampaigns: [],
      recommendations: await recommend(c),
      recentMessages: messages.map(message => ({ direction: message.direction, body: message.body, channel: message.channel }))
    };
  } else {
    payerAssessment = assessPayerOnboarding(c, extendedMessages);
    const draft = payerAssessment.earlyInactivity || payerAssessment.withinFirstThreeDays
      ? `Hola, ${c.fullName.split(' ')[0]}. Te acompaño para comenzar. ${payerAssessment.nextAction} ${payerAssessment.question || ''}`.trim()
      : template(c.stage, c.fullName, c.career, c.plan, c.renewalAt, '');
    fallback = proposalFallback(draft, payerAssessment.nextAction, [
      `activation=${payerAssessment.activation}`, `access=${payerAssessment.access}`, `diagnostic=${payerAssessment.diagnostic}`,
      `studyPath=${payerAssessment.studyPath}`, `firstActivity=${payerAssessment.firstActivity}`
    ]);
    context = {
      confirmedFacts: { firstName: c.fullName.split(' ')[0], career: c.career, university: c.university, plan: c.plan, paymentStatus: c.paymentStatus, renewalAt: c.renewalAt },
      onboarding: payerAssessment,
      recentMessages: messages.map(message => ({ direction: message.direction, body: message.body, channel: message.channel }))
    };
  }

  let proposal = fallback, provider = 'RULES', model = 'RULES';
  try {
    const generated = await generateProposal(c.stage as 'BUYER' | 'LEAD' | 'PAYER', context);
    proposal = generated.proposal;
    provider = generated.provider;
    model = generated.model;
  } catch (error) {
    await event(c.id, 'AI_STRUCTURED_FALLBACK', 'No se pudo validar la salida estructurada; se utilizó una propuesta determinista.', 'SYSTEM', agents[c.stage], { error: String(error), stage: c.stage });
  }

  if (c.stage === 'BUYER') {
    const priorOffers = buyerOffersAlreadyPresented(extendedMessages);
    if (buyerDraftRepeatsOffer(proposal.draft, priorOffers)) proposal.draft = fallback.draft;
    proposal.priority = 'BAJA';
    proposal.priorityReason = 'La priorización de Buyer se basa en señales entrantes persistidas, no en una probabilidad inferida.';
    proposal.nextAction = String(fallback.nextAction);
    proposal.factsUsed = buyerFacts(c);
  }
  if (c.stage === 'LEAD' && leadProfile) {
    if ((proposal.draft.match(/\?/g) || []).length > 1 || leadQuestionConflictsWithKnownData(proposal.draft, leadProfile)) proposal.draft = fallback.draft;
    proposal.priority = leadProfile.priority;
    proposal.priorityReason = leadProfile.priorityReason;
    proposal.missingFields = leadProfile.missingFields;
    proposal.nextAction = leadProfile.nextAction;
    proposal.factsUsed = [...new Set([leadProfile.career, leadProfile.difficulties, leadProfile.availability, leadProfile.plan, leadProfile.trialStatus, leadProfile.economicDecisionMaker].filter((value): value is string => !!value))];
  }
  if (c.stage === 'PAYER' && payerAssessment) {
    if (payerDraftClaimsUnconfirmedFacts(proposal.draft, payerAssessment, c.renewalAt)) proposal.draft = fallback.draft;
    proposal.priority = payerAssessment.earlyInactivity ? 'ALTA' : payerAssessment.withinFirstThreeDays ? 'MEDIA' : 'BAJA';
    proposal.priorityReason = payerAssessment.earlyInactivity
      ? 'El último registro de actividad disponible es anterior a la activación; no prueba por sí solo un problema de acceso.'
      : payerAssessment.withinFirstThreeDays ? 'Acompañamiento de onboarding dentro de los tres primeros días.' : 'Seguimiento habitual con los datos académicos disponibles.';
    proposal.missingFields = [
      payerAssessment.activation === 'NO_DATA' ? 'Fecha de activación del payer' : null,
      payerAssessment.access === 'NO_DATA' ? 'Estado de acceso' : null,
      payerAssessment.diagnostic === 'NO_DATA' ? 'Diagnóstico inicial' : null,
      payerAssessment.studyPath === 'NO_DATA' ? 'Configuración de ruta' : null,
      payerAssessment.firstActivity === 'NO_DATA' ? 'Registro de actividad posterior a activación' : null
    ].filter((value): value is string => !!value);
    proposal.nextAction = payerAssessment.nextAction;
    proposal.factsUsed = [`activation=${payerAssessment.activation}`, `access=${payerAssessment.access}`, `diagnostic=${payerAssessment.diagnostic}`, `studyPath=${payerAssessment.studyPath}`, `firstActivity=${payerAssessment.firstActivity}`];
  }

  const latestInboundBody = messages.find(message => message.direction === 'IN')?.body || '';
  if (c.stage === 'LEAD' && isInformationalPriceQuery(latestInboundBody)) {
    proposal.draft = fallback.draft;
    proposal.proposalType = 'NONE';
    proposal.needsApproval = false;
  }
  const approvalKind = c.stage === 'LEAD' ? leadApprovalKind(latestInboundBody, proposal.proposalType, proposal.draft) : null;
  await saveAssessment(c.id, c.stage, { proposal, provider, model, inbound, assessedAt: new Date().toISOString() });

  if (c.stage === 'PAYER' && payerAssessment && (payerAssessment.withinFirstThreeDays || payerAssessment.earlyInactivity || payerAssessment.activation === 'NO_DATA')) {
    const day = payerAssessment.elapsedDays == null ? 'NO_DATA' : payerAssessment.elapsedDays;
    const existing = await db.amp_events.findAll({ where: { contactId: c.id, type: 'PAYER_ONBOARDING' }, order: [['createdAt', 'DESC']], limit: 20 });
    const key = `${c.id}:${c.stageChangedAt || 'NO_DATA'}:${day}`;
    if (!existing.some(row => eventDetails(row.get('detail')).dedupeKey === key)) {
      await event(c.id, 'PAYER_ONBOARDING', payerAssessment.earlyInactivity ? 'Recomendación de ayuda por inactividad temprana registrada.' : 'Estado de onboarding del payer evaluado.', 'AGENT', agents.PAYER, { dedupeKey: key, ...payerAssessment, recommendation: payerAssessment.nextAction, sourceFields: ['stageChangedAt', 'lastActivityAt', 'academicStatus', 'progress'] });
    }
  }

  if (approvalKind && c.stage === 'LEAD') {
    if (!(await hasPendingApproval(c.id, approvalKind))) {
      const payload = approvalKind === 'DISCOUNT'
        ? { requestType: 'EXPLICIT_BENEFIT_REQUEST', proposedPercent: null, scope: 'ONE_PAYMENT', evidence: latestInboundBody }
        : { proposedMessage: proposal.draft, proposalType: proposal.proposalType, needsApproval: true };
      await db.amp_approvals.create({ contactId: c.id, kind: approvalKind, status: 'PENDING', payload: JSON.stringify(payload), reason: approvalKind === 'DISCOUNT' ? 'Solicitud explícita de descuento o beca; requiere decisión humana.' : 'La propuesta contiene una condición comercial que requiere aprobación humana.', requestedBy: agents.LEAD, createdAt: new Date() });
      await event(c.id, 'APPROVAL_REQUEST', approvalKind === 'DISCOUNT' ? 'Solicitud explícita de beneficio pendiente de revisión humana.' : 'Propuesta comercial pendiente de revisión humana.', 'AGENT', agents.LEAD, { proposalType: proposal.proposalType });
    }
    return { approval: true, provider, model, text: proposal.draft, assessment: proposal };
  }

  const channel = channelFor(c.stage, c.interestChannel);
  if (c.stage === 'BUYER') {
    const sent: string[] = [];
    for (const candidate of ['WHATSAPP', 'EMAIL'] as Channel[]) {
      if ((candidate === 'WHATSAPP' && c.consentWhatsapp && c.phone) || (candidate === 'EMAIL' && c.consentEmail && c.email)) {
        await sendToBoth(c.id, candidate, proposal.draft, agents.BUYER, true, inbound);
        sent.push(candidate);
      }
    }
    if (!sent.length) await event(c.id, 'AGENT_NO_CONSENT', 'Buyer sin canal y consentimiento disponibles; no se envió el borrador.', 'SYSTEM', agents.BUYER);
    return { sent, provider, model, text: proposal.draft, assessment: proposal };
  }
  if (!channel) {
    await db.amp_approvals.create({ contactId: c.id, kind: 'CHANNEL_REVIEW', status: 'PENDING', payload: JSON.stringify({ message: proposal.draft, mce: c.interestChannel }), reason: 'El MCE no tiene conector habilitado.', requestedBy: agents[c.stage], createdAt: new Date() });
    return { approval: true, provider, model, text: proposal.draft, assessment: proposal };
  }
  if (c.stage === 'PAYER') {
    const guardianName = c.guardianName?.split(' ')[0] || 'apoderado';
    const guardianDraft = `Hola, ${guardianName}. Acompañamos a ${c.fullName.split(' ')[0]} en el inicio de su preparación. ${payerAssessment?.nextAction || 'Si lo considera conveniente, puede ayudarle a confirmar el acceso.'}`;
    await sendToPermittedRecipients(c.id, channel, proposal.draft, guardianDraft, agents.PAYER, true, inbound);
  } else {
    await sendToBoth(c.id, channel, proposal.draft, agents[c.stage], true, inbound);
  }
  return { sent: [channel], provider, model, text: proposal.draft, assessment: proposal };
}

export async function runAgent(contactId: number, inbound = false) {
  const c = await contact(contactId);
  if (!c) throw new Error('Contacto no encontrado');
  if (c.stage === 'TURNED' && c.admissionStatus === 'ADMITTED') return { skipped: 'Ingresó a la universidad' };
  const db = tables();
  const messages = plainMany<any>(await db.amp_messages.findAll({ where: { contactId }, order: [['createdAt', 'DESC']], limit: 8 }));
  if (messages[0]?.direction === 'IN') return { skipped: 'La respuesta entrante está en evaluación o requiere atención manual.' };
  if (['BUYER', 'LEAD', 'PAYER'].includes(c.stage)) return runImpulseAgent(c, messages as AgentMessage[], inbound);
  const recs = await recommend(c);
  const weekly = c.stage === 'CUSTOMER' ? plainMany<any>(await db.dm_academic_weekly.findAll({ where: { contactId }, order: [['weekStart', 'DESC']], limit: 2 })) : [];
  const current = weekly[0], previous = weekly[1];
  const academicSummary = current ? `Esta semana completaste ${current.activitiesCompleted || 0} de ${current.activitiesPlanned || 0} actividades y realizaste ${current.simulations || 0} simulacros.${previous && current.score != null && previous.score != null ? ` Tu puntaje cambió de ${previous.score} a ${current.score}.` : ''}` : 'Aún no tenemos un reporte semanal registrado.';
  const system = `Eres el ${agents[c.stage]} de LaPreDigital, academia 100% digital. Redacta un solo mensaje breve, honesto y personalizado en español peruano. No inventes precios, resultados, becas ni descuentos. No prometas ingreso universitario. Usa los datos del perfil y evita repetir mensajes. No reveles datos sensibles. No modifiques pagos. Responde solo con el texto del mensaje.`;
  const prompt = JSON.stringify({ stage: c.stage, name: c.fullName, career: c.career, plan: c.plan, progress: c.progress, streakDays: c.streakDays, missingCourses: c.missingCourses, renewalAt: c.renewalAt, notes: c.notes, recommendations: recs, weeklyProgress: weekly, recentMessages: messages.map(m => ({ direction: m.direction, body: m.body })) });
  let text = template(c.stage, c.fullName, c.career, c.plan, c.renewalAt, academicSummary), provider = 'TEMPLATE', model = 'RULES';
  try { const result = await generate(system, prompt); if (result.text) { text = result.text; provider = result.provider; model = result.model; } }
  catch (error) { await event(contactId, 'AI_FALLBACK', 'Modelo no disponible; se usó plantilla revisable.', 'SYSTEM', 'agent', { error: String(error) }); }
  const lastInbound = messages.find(m => m.direction === 'IN');
  if (lastInbound && (c.stage === 'BUYER' || c.stage === 'LEAD')) await learnExplicitData(c.id, c, lastInbound.body);
  const offerInOutput = /\b(?:descuento|beca|semibeca|cup[oó]n|\d{1,2}\s?%\s?(?:de\s?)?descuento)\b/i.test(text);
  const discountRequest = lastInbound && /descuento|beca|semibeca|precio|caro|promoci[oó]n/i.test(lastInbound.body);
  if ((discountRequest || offerInOutput) && c.stage === 'LEAD') {
    await db.amp_approvals.create({ contactId, kind: 'DISCOUNT', status: 'PENDING', payload: JSON.stringify({ proposedPercent: 10, proposedMessage: text, scope: 'ONE_PAYMENT' }), reason: 'El lead consultó por apoyo económico o precio; requiere decisión humana.', requestedBy: agents[c.stage], createdAt: new Date() });
    await event(contactId, 'APPROVAL_REQUEST', 'Propuesta de descuento pendiente de revisión.', 'AGENT', agents[c.stage]);
    return { approval: true, provider, model, text };
  }
  if (offerInOutput) {
    await db.amp_approvals.create({ contactId, kind: 'OFFER_REVIEW', status: 'PENDING', payload: JSON.stringify({ proposedMessage: text }), reason: 'El agente propuso una oferta que necesita aprobación.', requestedBy: agents[c.stage], createdAt: new Date() });
    await event(contactId, 'APPROVAL_REQUEST', 'Oferta propuesta por el agente pendiente de revisión.', 'AGENT', agents[c.stage]);
    return { approval: true, provider, model, text };
  }
  const channel = channelFor(c.stage, c.interestChannel);
  if (c.stage === 'BUYER') {
    const sent: string[] = [];
    for (const candidate of ['WHATSAPP', 'EMAIL'] as Channel[]) {
      if ((candidate === 'WHATSAPP' && c.consentWhatsapp && c.phone) || (candidate === 'EMAIL' && c.consentEmail && c.email)) {
        await sendToBoth(contactId, candidate, text, agents[c.stage], true, inbound);
        sent.push(candidate);
      }
    }
    return { sent, provider, model, text };
  }
  if (!channel) {
    await db.amp_approvals.create({ contactId, kind: 'CHANNEL_REVIEW', status: 'PENDING', payload: JSON.stringify({ message: text, mce: c.interestChannel }), reason: 'El MCE no tiene conector habilitado.', requestedBy: agents[c.stage], createdAt: new Date() });
    return { approval: true, provider, model, text };
  }
  await sendToBoth(contactId, channel, text, agents[c.stage], true, inbound);
  return { sent: [channel], provider, model, text };
}

export async function learnExplicitData(contactId: number, c: Awaited<ReturnType<typeof contact>>, body: string) {
  if (!c) return;
  const changes: [string, string][] = [];
  const email = body.match(/(?:mi correo (?:es|:)|escr[ií]beme a)\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i)?.[1];
  const phone = body.match(/(?:mi (?:n[uú]mero|tel[eé]fono|celular) (?:es|:))\s*(\+?\d[\d\s-]{7,14}\d)/i)?.[1]?.replace(/[^+\d]/g, '');
  const preferred = body.match(/(?:prefiero|cont[aá]ctame por)\s+(whatsapp|correo|email)/i)?.[1];
  if (email && email !== c.email) changes.push(['email', email]);
  if (phone && phone !== c.phone) changes.push(['phone', phone]);
  if (preferred) {
    const channel = /whatsapp/i.test(preferred) ? 'WHATSAPP' : 'EMAIL';
    if (channel !== c.interestChannel) changes.push(['interestChannel', channel]);
  }
  for (const [field, value] of changes) {
    await tables().amp_overrides.create({ contactId, field, value, confidence: 0.98, source: 'AGENT', actorId: agents[c.stage], reason: 'Dato declarado explícitamente por el contacto en una conversación.', createdAt: new Date() });
    await event(contactId, 'DATA_CHANGE', `${field} actualizado con confianza 0.98.`, 'AGENT', agents[c.stage]);
  }
}
