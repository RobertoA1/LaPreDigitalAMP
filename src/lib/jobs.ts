import { Op } from 'sequelize';
import Fuse from 'fuse.js';
import { plain, plainMany, tables } from './db';
import { contact, event } from './contacts';
import { runAgent, channelFor } from './agents';
import { sendToBoth, sendToPermittedRecipients, withinSendHours } from './messaging';
import { normalizeName } from './exams';
import { scanRadar, runRadar } from './radar';
import { processInbound } from './inbound';
import type { Contact, Channel } from './types';
import { assessPayerOnboarding, shouldSendRenewalNotice } from './stage-agents';

export async function enqueue(kind: string, contactId: number | null, payload: object = {}, runAt = new Date(), dedupeKey?: string) {
  const db = tables();
  if (dedupeKey) {
    const existing = await db.amp_jobs.findOne({ where: { dedupeKey } });
    if (existing) return existing;
  }
  return db.amp_jobs.create({ kind, contactId, payload: JSON.stringify(payload), status: 'PENDING', runAt, dedupeKey, attempts: 0, createdAt: new Date() });
}
export function nextSendWindow(now = new Date()) {
  const lima = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  lima.setUTCHours(7, 0, 0, 0);
  if (lima.getTime() + 5 * 60 * 60 * 1000 <= now.getTime()) lima.setUTCDate(lima.getUTCDate() + 1);
  return new Date(lima.getTime() + 5 * 60 * 60 * 1000);
}
function daysUntil(value: string | Date, now = new Date()) {
  const date = new Date(value);
  const utcDay = (d: Date) => Math.floor((d.getTime() - 5 * 60 * 60 * 1000) / 86400000);
  return utcDay(date) - utcDay(now);
}
export async function scanSchedules(now = new Date()) {
  const db = tables();
  const all = plainMany<Contact>(await db.dm_contacts.findAll());
  let scheduled = 0;
  for (const base of all) {
    const c = await contact(base.id);
    if (!c) continue;
    const stageVersion = await syncStage(c);
    if (c.contactPaused || c.admissionStatus === 'ADMITTED') continue;
    if (!(c.stage === 'TURNED' && c.stageChangedAt && Date.now() - new Date(c.stageChangedAt).getTime() > 30 * 86400000)) {
      await enqueue('AGENT', c.id, {}, now, `stage:${c.sourceKey}:${stageVersion}`); scheduled++;
    }
    if ((c.stage === 'PAYER' || c.stage === 'CUSTOMER') && c.renewalAt && !['RENEWED', 'CANCELLED'].includes(c.paymentStatus || '')) {
      const days = daysUntil(c.renewalAt, now);
      if ([7, 3, 1].includes(days)) {
        await enqueue('RENEWAL', c.id, { expectedRenewalAt: c.renewalAt, days }, now, `renewal:${c.id}:${c.renewalAt}:${days}`);
        scheduled++;
      }
    }
    if (c.stage === 'PAYER' && c.stageChangedAt && assessPayerOnboarding(c, [], now).activation === 'CONFIRMED') {
      const activatedAt = new Date(c.stageChangedAt).getTime();
      const elapsed = now.getTime() - activatedAt;
      const onboardingDay = elapsed >= 0 ? Math.floor(elapsed / 86400000) : -1;
      if (onboardingDay === 1 || onboardingDay === 2) {
        await enqueue('PAYER_ONBOARDING', c.id, { stageChangedAt: c.stageChangedAt, day: onboardingDay }, now, `payer-onboarding:${c.id}:${new Date(activatedAt).toISOString()}:day:${onboardingDay}`);
        scheduled++;
      } else if (onboardingDay === 3 && assessPayerOnboarding(c, [], now).earlyInactivity) {
        await enqueue('PAYER_ONBOARDING', c.id, { stageChangedAt: c.stageChangedAt, day: onboardingDay, mode: 'INACTIVITY_CHECK' }, now, `payer-onboarding:${c.id}:${new Date(activatedAt).toISOString()}:inactivity-check`);
        scheduled++;
      }
    }
    const limaDay = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', weekday: 'short' }).format(now);
    const limaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    if (c.stage === 'CUSTOMER' && limaDay === 'Mon') {
      await enqueue('ACADEMIC', c.id, {}, now, `academic:${c.id}:${limaDate}`); scheduled++;
    }
    if ((c.stage === 'CUSTOMER' || c.stage === 'PAYER') && limaDay === 'Fri') {
      await enqueue('SIMULACRO', c.id, {}, now, `simulacro:${c.id}:${limaDate}`); scheduled++;
    }
  }
  await matchNewBuyers();
  scheduled += await scanRadar(now);
  return scheduled;
}
async function matchNewBuyers() {
  const db = tables();
  const buyers = plainMany<Contact>(await db.dm_contacts.findAll({ where: { stage: 'BUYER' } }));
  const entries = plainMany<any>(await db.amp_exam_entries.findAll({ where: { matchedContactId: null } }));
  const searchable = entries.map(e => ({ ...e, tokenKey: String(e.normalizedName).split(' ').sort().join(' ') }));
  const fuse = new Fuse(searchable, { keys: ['normalizedName', 'tokenKey'], includeScore: true, threshold: 0.25 });
  for (const c of buyers) {
    const normalized = normalizeName(c.fullName);
    const key = normalized.split(' ').sort().join(' ');
    const byNumber = searchable.filter(e => c.candidateNumber && e.candidateNumber === c.candidateNumber);
    const byName = searchable.filter(e => e.tokenKey === key);
    const fuzzy = fuse.search(key, { limit: 2 });
    let found: any = null;
    let confidence = 0;
    if (byNumber.length === 1) { found = byNumber[0]; confidence = 1; }
    else if (byName.length === 1) { found = byName[0]; confidence = 1; }
    else if (fuzzy.length && (fuzzy[0].score || 0) <= 0.12 && (!fuzzy[1] || (fuzzy[1].score || 1) - (fuzzy[0].score || 0) >= 0.08)) {
      found = fuzzy[0].item;
      confidence = 1 - (fuzzy[0].score || 0);
    }
    if (!found) continue;
    const [matched] = await db.amp_exam_entries.update({ matchedContactId: c.id, matchConfidence: confidence }, { where: { id: found.id, matchedContactId: null } });
    if (!matched) continue;
    if (found.result === 'ADMITTED') {
      await db.amp_overrides.create({ contactId: c.id, field: 'admissionStatus', value: 'ADMITTED', confidence: 1, source: 'EXAM', actorId: 'worker', reason: `Examen ${found.examId}`, createdAt: new Date() });
      await event(c.id, 'ADMISSION', 'Ingreso universitario confirmado al registrar buyer.', 'SYSTEM', 'worker');
    } else if (found.nonAdmittedRank && found.nonAdmittedRank <= 10) {
      await db.amp_approvals.create({ contactId: c.id, kind: 'SCHOLARSHIP_REVIEW', status: 'PENDING', payload: JSON.stringify({ examId: found.examId, rank: found.nonAdmittedRank, career: found.career }), reason: 'Entre los 10 primeros no ingresantes', requestedBy: 'SYSTEM', createdAt: new Date() });
      await event(c.id, 'PRIORITY', `Buyer prioritario: puesto ${found.nonAdmittedRank} entre no ingresantes.`, 'SYSTEM', 'worker');
    }
  }
}
export async function processNextJob() {
  const db = tables();
  const now = new Date();
  const candidate = plain<any>(await db.amp_jobs.findOne({ where: { [Op.or]: [{ status: 'PENDING', runAt: { [Op.lte]: now } }, { status: 'RUNNING', leaseUntil: { [Op.lt]: now } }] }, order: [['runAt', 'ASC']] }));
  if (!candidate) return false;
  const [claimed] = await db.amp_jobs.update({ status: 'RUNNING', leaseUntil: new Date(now.getTime() + 5 * 60 * 1000), attempts: candidate.attempts + 1 }, { where: { id: candidate.id, status: candidate.status, leaseUntil: candidate.leaseUntil } });
  if (!claimed) return true;
  try {
    const payload = JSON.parse(candidate.payload || '{}');
    if (!['ANALYZE', 'INBOUND'].includes(candidate.kind) && !(candidate.kind === 'PAYER_ONBOARDING' && payload.mode === 'INACTIVITY_CHECK') && !payload.inbound && !withinSendHours(now)) {
      await db.amp_jobs.update({ status: 'PENDING', runAt: nextSendWindow(now), leaseUntil: null }, { where: { id: candidate.id } });
      return true;
    }
    if (candidate.kind === 'INBOUND') await processInbound(payload.messageId);
    else if (candidate.kind === 'ANALYZE') await runRadar(candidate.contactId, payload, now);
    else if (candidate.kind === 'AGENT' || candidate.kind === 'ACADEMIC') await runAgent(candidate.contactId, !!payload.inbound);
    else if (candidate.kind === 'PAYER_ONBOARDING') {
      const c = await contact(candidate.contactId);
      if (c?.stage === 'PAYER' && c.stageChangedAt && new Date(c.stageChangedAt).getTime() === new Date(payload.stageChangedAt).getTime()) {
        const messages = plainMany<any>(await db.amp_messages.findAll({ where: { contactId: c.id }, order: [['createdAt', 'DESC']], limit: 50 }));
        const assessment = assessPayerOnboarding(c, messages, now);
        if (payload.mode === 'INACTIVITY_CHECK') {
          if (assessment.earlyInactivity) await event(c.id, 'PAYER_ONBOARDING', 'Ayuda personalizada recomendada: no hay actividad registrada después de la activación.', 'AGENT', 'Agente de Cobranza', {
            dedupeKey: String(candidate.dedupeKey), ...assessment,
            recommendation: assessment.nextAction,
            sourceFields: ['stageChangedAt', 'lastActivityAt', 'academicStatus', 'progress']
          });
        } else if (assessment.withinFirstThreeDays) {
          await runAgent(c.id);
        }
      }
    }
    else if (candidate.kind === 'RENEWAL') {
      const c = await contact(candidate.contactId);
      if (c && shouldSendRenewalNotice(c, payload.expectedRenewalAt)) {
        const channel = channelFor(c.stage, c.interestChannel);
        if (!channel) throw new Error('MCE sin conector');
        const studentBody = `Hola, ${c.fullName.split(' ')[0]}. Tu servicio LaPreDigital vence en ${payload.days} día${payload.days === 1 ? '' : 's'}. Si deseas continuar tu preparación, revisa tu renovación en la plataforma. ¿Necesitas ayuda?`;
        const guardianBody = c.stage === 'PAYER' ? `Hola, ${c.guardianName?.split(' ')[0] || 'apoderado'}. Con tu autorización, acompañamos a ${c.fullName.split(' ')[0]} con el próximo vencimiento de su servicio. Si ya renovaron, el datamart debe confirmarlo antes de detener futuros avisos.` : studentBody;
        if (c.stage === 'PAYER') await sendToPermittedRecipients(c.id, channel, studentBody, guardianBody, 'Agente de Cobranza', true);
        else await sendToBoth(c.id, channel, studentBody, 'Agente de Cobranza', true);
      }
    } else if (candidate.kind === 'SIMULACRO') {
      const c = await contact(candidate.contactId);
      if (c && (c.stage === 'PAYER' || c.stage === 'CUSTOMER')) {
        const channel = channelFor(c.stage, c.interestChannel);
        if (!channel) throw new Error('MCE sin conector');
        const studentBody = `Hola, ${c.fullName.split(' ')[0]}. Este fin de semana revisa los simulacros disponibles en LaPreDigital y reserva un momento para practicar. ¿Necesitas ayuda para organizarte?`;
        const guardianBody = c.stage === 'PAYER' ? `Hola, ${c.guardianName?.split(' ')[0] || 'apoderado'}. Puedes acompañar a ${c.fullName.split(' ')[0]} a revisar los simulacros disponibles y reservar un momento para practicar.` : studentBody;
        if (c.stage === 'PAYER') await sendToPermittedRecipients(c.id, channel, studentBody, guardianBody, 'Agente Académico', true);
        else await sendToBoth(c.id, channel, studentBody, 'Agente Académico', true);
      }
    } else if (candidate.kind === 'OFFER') {
      const approval = plain<any>(await db.amp_approvals.findByPk(payload.approvalId));
      const c = await contact(candidate.contactId);
      if (approval?.status === 'APPROVED' && c && !(c.stage === 'TURNED' && c.admissionStatus === 'ADMITTED')) {
        const offer = JSON.parse(approval.payload);
        const channel = channelFor(c.stage, c.interestChannel) || (c.consentWhatsapp ? 'WHATSAPP' : c.consentEmail ? 'EMAIL' : null);
        if (!channel) throw new Error('No hay MCE disponible para la oferta');
        const label = offer.offerType === 'SCHOLARSHIP' ? 'una beca' : offer.offerType === 'HALF_SCHOLARSHIP' ? 'una semibeca' : `un descuento de ${offer.discountPercent} % para un solo pago`;
        await sendToBoth(c.id, channel, `Hola, ${c.fullName.split(' ')[0]}. LaPreDigital aprobó ${label} para tu preparación. ¿Quieres que te expliquemos cómo aplicarla?`, 'Agente Negociador', true);
      }
    } else if (candidate.kind === 'CAMPAIGN') {
      const campaign = plain<any>(await db.amp_campaigns.findByPk(payload.campaignId));
      const c = await contact(candidate.contactId);
      if (campaign?.status === 'APPROVED' && c && c.stage === campaign.stage && !(c.stage === 'TURNED' && c.admissionStatus === 'ADMITTED') && (!campaign.startsAt || new Date(campaign.startsAt) <= now) && (!campaign.endsAt || new Date(campaign.endsAt) >= now)) {
        let canSend = true;
        if (campaign.offerType === 'DISCOUNT') {
          if (await db.amp_coupons.findOne({ where: { contactId: c.id } })) canSend = false;
          else await db.amp_coupons.create({ code: `LPD-C${campaign.id}-${c.id}`, contactId: c.id, approvalId: null, discountPercent: campaign.discountPercent, scope: 'ONE_PAYMENT', expiresAt: new Date(Date.now() + 30 * 86400000), createdAt: new Date() });
        }
        const channel = campaign.channel as Channel;
        const body = String(campaign.template).replace(/\{nombre\}/g, c.fullName.split(' ')[0]).replace(/\{carrera\}/g, c.career || 'tu carrera');
        if (canSend) await sendToBoth(c.id, channel, body, `Campaña ${campaign.name}`, true);
      }
    }
    await db.amp_jobs.update({ status: 'DONE', leaseUntil: null, lastError: null }, { where: { id: candidate.id } });
  } catch (error) {
    const attempts = candidate.attempts + 1;
    await db.amp_jobs.update({ status: attempts >= 3 ? 'FAILED' : 'PENDING', runAt: new Date(Date.now() + attempts * 60_000), leaseUntil: null, lastError: String(error) }, { where: { id: candidate.id } });
    await event(candidate.contactId, 'JOB_ERROR', `Trabajo ${candidate.kind}: ${String(error)}`, 'SYSTEM', 'worker');
  }
  return true;
}

async function syncStage(c: Contact) {
  const db = tables();
  const previous = plain<any>(await db.amp_contact_state.findOne({ where: { contactId: c.id } }));
  if (!previous) {
    await db.amp_contact_state.create({ contactId: c.id, stage: c.stage, version: 1, sourceUpdatedAt: c.sourceUpdatedAt || null, createdAt: new Date() });
    await event(c.id, 'STAGE_SYNC', `Etapa ${c.stage} detectada en el datamart.`, 'SYSTEM', 'worker');
    return 1;
  }
  if (previous.stage !== c.stage) {
    const version = previous.version + 1;
    await db.amp_contact_state.update({ stage: c.stage, version, sourceUpdatedAt: c.sourceUpdatedAt || null }, { where: { contactId: c.id } });
    await event(c.id, 'STAGE_CHANGE', `${previous.stage} → ${c.stage} confirmado por datamart.`, 'SYSTEM', 'worker');
    return version;
  }
  return previous.version;
}
