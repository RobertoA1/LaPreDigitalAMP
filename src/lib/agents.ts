import { plain, plainMany, tables } from './db';
import { contact, event, recommend } from './contacts';
import { agents, type Channel } from './types';
import { generate } from './ai';
import { sendToBoth } from './messaging';

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
export async function runAgent(contactId: number, inbound = false) {
  const c = await contact(contactId);
  if (!c) throw new Error('Contacto no encontrado');
  if (c.stage === 'TURNED' && c.admissionStatus === 'ADMITTED') return { skipped: 'Ingresó a la universidad' };
  const db = tables();
  const messages = plainMany<any>(await db.amp_messages.findAll({ where: { contactId }, order: [['createdAt', 'DESC']], limit: 8 }));
  if (messages[0]?.direction === 'IN') return { skipped: 'La respuesta entrante está en evaluación o requiere atención manual.' };
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
