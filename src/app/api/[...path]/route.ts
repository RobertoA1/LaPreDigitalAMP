import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'node:crypto';
import { Op } from 'sequelize';
import { z } from 'zod';
import { currentUser, canApprove, canConfigure, sessionCookie, sessionToken } from '@/lib/auth';
import { contacts, contact, contactHistory, event, recommend } from '@/lib/contacts';
import { plain, plainMany, tables } from '@/lib/db';
import { enqueue } from '@/lib/jobs';
import { importExam, confirmExamMatch } from '@/lib/exams';
import { receiveMessage, sendMessage } from '@/lib/messaging';
import { aiConfig } from '@/lib/ai';
import { stages, type Stage, type Channel } from '@/lib/types';

export const runtime = 'nodejs';
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });
function requireSameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== req.headers.get('host')) throw new Error('Origen no permitido');
}
async function body(req: NextRequest) { return req.json() as Promise<Record<string, any>>; }

export async function GET(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    const user = await currentUser();
    if (!user) return fail('Sesión requerida', 401);
    const path = (await context.params).path.join('/');
    const db = tables();
    if (path === 'me') return ok({ user, demo: process.env.DEMO_MODE === 'true' });
    if (path === 'dashboard') {
      const snapshot = plain<any>(await db.dm_funnel_daily.findOne({ order: [['snapshotDate', 'DESC']] }));
      const all = plainMany<any>(await db.dm_contacts.findAll());
      const current = Object.fromEntries(stages.map(stage => [stage, all.filter(c => c.stage === stage).length]));
      const pending = await db.amp_approvals.count({ where: { status: 'PENDING' } });
      const failedJobs = await db.amp_jobs.count({ where: { status: 'FAILED' } });
      const latest = plainMany(await db.amp_events.findAll({ order: [['createdAt', 'DESC']], limit: 8 }));
      return ok({ snapshot, current, pending, failedJobs, latest, demo: process.env.DEMO_MODE === 'true' });
    }
    if (path === 'contacts') {
      const stage = req.nextUrl.searchParams.get('stage') as Stage | null;
      if (stage && !stages.includes(stage)) return fail('Etapa inválida');
      return ok({ contacts: await contacts(stage || undefined, req.nextUrl.searchParams.get('search') || undefined) });
    }
    if (path === 'contact') {
      const id = Number(req.nextUrl.searchParams.get('id'));
      const c = await contact(id);
      if (!c) return fail('Contacto no encontrado', 404);
      return ok({ contact: c, history: await contactHistory(id), weekly: plainMany(await db.dm_academic_weekly.findAll({ where: { contactId: id }, order: [['weekStart', 'DESC']], limit: 12 })), recommendations: await recommend(c) });
    }
    if (path === 'approvals') return ok({ approvals: plainMany(await db.amp_approvals.findAll({ order: [['createdAt', 'DESC']], limit: 200 })) });
    if (path === 'campaigns') return ok({ campaigns: plainMany(await db.amp_campaigns.findAll({ order: [['createdAt', 'DESC']], limit: 100 })) });
    if (path === 'exams') return ok({ exams: plainMany(await db.amp_exams.findAll({ order: [['createdAt', 'DESC']], limit: 100 })), review: plainMany(await db.amp_exam_entries.findAll({ where: { matchedContactId: null, matchConfidence: { [Op.gt]: 0 } }, limit: 100 })) });
    if (path === 'settings') return ok({ ai: await aiConfig(), hasKeys: { OPENAI: !!process.env.OPENAI_API_KEY, GEMINI: !!process.env.GEMINI_API_KEY, GROK: !!process.env.XAI_API_KEY, ANTHROPIC: !!process.env.ANTHROPIC_API_KEY }, demo: process.env.DEMO_MODE === 'true' });
    if (path === 'jobs') return ok({ jobs: plainMany(await db.amp_jobs.findAll({ order: [['createdAt', 'DESC']], limit: 100 })) });
    return fail('Ruta no encontrada', 404);
  } catch (error) { console.error(error); return fail(String(error), 500); }
}

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    const path = (await context.params).path.join('/');
    if (path !== 'webhooks/evolution') requireSameOrigin(req);
    const db = tables();
    if (path === 'webhooks/evolution') {
      const configured = process.env.EVOLUTION_WEBHOOK_SECRET;
      const supplied = req.headers.get('x-amp-webhook-secret') || '';
      if (!configured || supplied.length !== configured.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(configured))) return fail('Webhook no autorizado', 401);
      const incoming = await body(req);
      if (String(incoming.event || '').toLowerCase() !== 'messages.upsert' || incoming.data?.key?.fromMe) return ok({ ignored: true });
      const messageId = String(incoming.data?.key?.id || '');
      const text = String(incoming.data?.message?.conversation || incoming.data?.message?.extendedTextMessage?.text || '').trim();
      const number = String(incoming.data?.key?.remoteJid || '').split('@')[0].replace(/\D/g, '');
      if (!messageId || !text || !number) return ok({ ignored: true });
      if (await db.amp_messages.findOne({ where: { externalId: messageId, channel: 'WHATSAPP' } })) return ok({ duplicate: true });
      const all = plainMany<any>(await db.dm_contacts.findAll());
      const matched = all.filter(c => { const p = String(c.phone || '').replace(/\D/g, ''); return p === number || (p.length >= 9 && number.length >= 9 && p.slice(-9) === number.slice(-9)); });
      if (matched.length !== 1) { await event(null, 'UNMATCHED_INBOUND', 'Mensaje de WhatsApp sin contacto único en datamart.', 'SYSTEM', 'evolution'); return ok({ unmatched: true }); }
      const row = await receiveMessage(matched[0].id, 'WHATSAPP', text, messageId);
      await enqueue('AGENT', matched[0].id, { inbound: true, replyTo: row.get('id') });
      return ok({ accepted: true });
    }
    if (path === 'login') {
      const data = z.object({ email: z.email(), password: z.string().min(1) }).parse(await body(req));
      const row = plain<any>(await db.amp_users.findOne({ where: { email: data.email.toLowerCase(), active: true } }));
      if (!row || !(await bcrypt.compare(data.password, row.passwordHash))) return fail('Credenciales incorrectas', 401);
      const response = ok({ user: { id: row.id, email: row.email, name: row.name, role: row.role } });
      response.cookies.set('amp_session', sessionToken(row.id), sessionCookie());
      return response;
    }
    const user = await currentUser();
    if (!user) return fail('Sesión requerida', 401);
    if (path === 'logout') { const response = ok({ ok: true }); response.cookies.delete('amp_session'); return response; }
    if (path === 'agent/run') {
      const data = z.object({ contactId: z.number().int().positive() }).parse(await body(req));
      if (!(await contact(data.contactId))) return fail('Contacto no encontrado', 404);
      const job = await enqueue('AGENT', data.contactId, { requestedBy: user.id });
      await event(data.contactId, 'AGENT_QUEUED', 'Ejecución de agente solicitada.', 'OPERATOR', String(user.id));
      return ok({ jobId: job.get('id'), status: 'PENDING' }, 202);
    }
    if (path === 'message/send') {
      const data = z.object({ contactId: z.number().int().positive(), channel: z.enum(['WHATSAPP', 'EMAIL']), recipientKind: z.enum(['STUDENT', 'GUARDIAN']).optional(), text: z.string().trim().min(1).max(4000) }).parse(await body(req));
      const row = await sendMessage(data.contactId, data.channel, data.text, 'OPERATOR', String(user.id), false, false, data.recipientKind || 'STUDENT');
      return ok({ message: plain(row) });
    }
    if (path === 'message/inbound') {
      if (process.env.DEMO_MODE !== 'true') return fail('La simulación de entrada solo está disponible en Demo', 403);
      const data = z.object({ contactId: z.number().int().positive(), channel: z.enum(['WHATSAPP', 'EMAIL']), text: z.string().trim().min(1).max(4000) }).parse(await body(req));
      const row = await receiveMessage(data.contactId, data.channel, data.text);
      await enqueue('AGENT', data.contactId, { inbound: true, replyTo: row.get('id') });
      return ok({ message: plain(row) });
    }
    if (path === 'contact/override') {
      const data = z.object({ contactId: z.number().int().positive(), field: z.enum(['email', 'phone', 'career', 'interestChannel', 'notes', 'guardianEmail', 'guardianPhone', 'contactPaused']), value: z.string().max(1000), reason: z.string().trim().min(3) }).parse(await body(req));
      if (!(await contact(data.contactId))) return fail('Contacto no encontrado', 404);
      await db.amp_overrides.create({ contactId: data.contactId, field: data.field, value: data.value, confidence: 1, source: 'OPERATOR', actorId: String(user.id), reason: data.reason, createdAt: new Date() });
      await event(data.contactId, 'DATA_CHANGE', `${data.field} actualizado por operador.`, 'OPERATOR', String(user.id), { reason: data.reason });
      return ok({ ok: true });
    }
    if (path === 'priority/manual') {
      const data = z.object({ contactId: z.number().int().positive(), examName: z.string().trim().min(3), rank: z.number().int().min(1).optional(), reason: z.string().trim().min(3) }).parse(await body(req));
      const c = await contact(data.contactId);
      if (!c) return fail('Contacto no encontrado', 404);
      const eligible = !!data.rank && data.rank <= 10;
      const approval = await db.amp_approvals.create({ contactId: c.id, kind: 'SCHOLARSHIP_REVIEW', status: 'PENDING', payload: JSON.stringify({ examName: data.examName, rank: data.rank, eligible, manual: true }), reason: data.reason, requestedBy: String(user.id), createdAt: new Date() });
      await event(c.id, 'PRIORITY_REVIEW', 'Evaluación manual de beca/semibeca solicitada.', 'OPERATOR', String(user.id), data);
      return ok({ approval: plain(approval) });
    }
    if (path === 'approval/decide') {
      const data = z.object({ id: z.number().int().positive(), decision: z.enum(['APPROVED', 'REJECTED']), reason: z.string().trim().min(3), offerType: z.enum(['DISCOUNT', 'SCHOLARSHIP', 'HALF_SCHOLARSHIP']).optional(), discountPercent: z.number().min(0).max(30).optional() }).parse(await body(req));
      const row = plain<any>(await db.amp_approvals.findByPk(data.id));
      if (!row || row.status !== 'PENDING') return fail('Solicitud ya resuelta o inexistente');
      const payload = JSON.parse(row.payload);
      if (data.decision === 'APPROVED' && row.kind === 'DISCOUNT' && (data.discountPercent == null || data.discountPercent <= 0)) return fail('El descuento debe ser mayor a 0 y máximo 30 %.');
      if (data.decision === 'APPROVED' && (row.kind === 'SCHOLARSHIP_REVIEW' || row.kind === 'OFFER_REVIEW') && !data.offerType) return fail('Selecciona beca, semibeca o descuento.');
      if (data.decision === 'APPROVED' && data.offerType === 'DISCOUNT' && (data.discountPercent == null || data.discountPercent <= 0)) return fail('Indica el porcentaje de descuento.');
      if (data.decision === 'APPROVED' && (row.kind === 'DISCOUNT' || data.offerType === 'DISCOUNT') && await db.amp_coupons.findOne({ where: { contactId: row.contactId } })) return fail('Este usuario ya recibió un cupón; máximo uno por usuario.');
      const [updated] = await db.amp_approvals.update({ status: data.decision, reason: data.reason, decidedBy: String(user.id), decidedAt: new Date(), payload: JSON.stringify({ ...payload, offerType: data.offerType || row.kind, discountPercent: data.discountPercent }) }, { where: { id: data.id, status: 'PENDING' } });
      if (!updated) return fail('La solicitud ya fue resuelta');
      if (data.decision === 'APPROVED' && ['DISCOUNT', 'SCHOLARSHIP_REVIEW', 'OFFER_REVIEW'].includes(row.kind)) {
        if (row.kind === 'DISCOUNT' || data.offerType === 'DISCOUNT') await db.amp_coupons.create({ code: `LPD-${row.contactId}-${data.id}`, contactId: row.contactId, approvalId: data.id, discountPercent: data.discountPercent, scope: 'ONE_PAYMENT', expiresAt: new Date(Date.now() + 30 * 86400000), createdAt: new Date() });
        await enqueue('OFFER', row.contactId, { approvalId: data.id }, new Date(), `offer:${data.id}`);
      }
      await event(row.contactId, 'APPROVAL', `${row.kind}: ${data.decision}.`, 'OPERATOR', String(user.id), { reason: data.reason });
      return ok({ ok: true });
    }
    if (path === 'campaign/create') {
      const data = z.object({ name: z.string().trim().min(3), stage: z.enum(stages), channel: z.enum(['WHATSAPP', 'EMAIL']), template: z.string().trim().min(10).max(4000), offerType: z.enum(['NONE', 'DISCOUNT', 'SCHOLARSHIP', 'HALF_SCHOLARSHIP']).optional(), discountPercent: z.number().min(0).max(30).optional() }).parse(await body(req));
      const statedPercent = [...data.template.matchAll(/(\d{1,3})\s*%/g)].map(match => Number(match[1]));
      if (statedPercent.some(value => value > 30)) return fail('El mensaje supera el límite de 30 % de descuento.');
      if (/descuento|beca|semibeca|cup[oó]n/i.test(data.template) && (!data.offerType || data.offerType === 'NONE')) return fail('Declara el tipo de oferta antes de guardar la campaña.');
      if (data.offerType === 'DISCOUNT' && (!data.discountPercent || data.discountPercent > 30)) return fail('Indica un descuento de 1 a 30 %.');
      const row = await db.amp_campaigns.create({ ...data, status: 'DRAFT', createdBy: String(user.id), createdAt: new Date() });
      return ok({ campaign: plain(row) });
    }
    if (path === 'campaign/approve') {
      if (!canApprove(user.role)) return fail('Solo alta dirección o administración puede aprobar campañas', 403);
      const data = z.object({ id: z.number().int().positive() }).parse(await body(req));
      const campaign = plain<any>(await db.amp_campaigns.findByPk(data.id));
      if (!campaign || campaign.status !== 'DRAFT') return fail('Campaña no encontrada o ya aprobada');
      await db.amp_campaigns.update({ status: 'APPROVED', approvedBy: String(user.id), approvedAt: new Date() }, { where: { id: data.id, status: 'DRAFT' } });
      await event(null, 'CAMPAIGN', `Campaña ${campaign.name} aprobada.`, 'OPERATOR', String(user.id));
      return ok({ ok: true });
    }
    if (path === 'campaign/run') {
      if (!canApprove(user.role)) return fail('Solo alta dirección o administración puede lanzar campañas', 403);
      const data = z.object({ id: z.number().int().positive() }).parse(await body(req));
      const campaign = plain<any>(await db.amp_campaigns.findByPk(data.id));
      if (!campaign || campaign.status !== 'APPROVED') return fail('Campaña no aprobada');
      const recipients = plainMany<any>(await db.dm_contacts.findAll({ where: { stage: campaign.stage } }));
      for (const c of recipients) await enqueue('CAMPAIGN', c.id, { campaignId: campaign.id }, new Date(), `campaign:${campaign.id}:${c.id}`);
      return ok({ queued: recipients.length });
    }
    if (path === 'exam/match') {
      if (!canApprove(user.role)) return fail('Solo alta dirección o administración puede confirmar coincidencias', 403);
      const data = z.object({ entryId: z.number().int().positive(), contactId: z.number().int().positive(), reason: z.string().trim().min(5) }).parse(await body(req));
      return ok(await confirmExamMatch(data.entryId, data.contactId, user.id, data.reason));
    }
    if (path === 'exam/upload') {
      if (!canApprove(user.role)) return fail('Solo alta dirección o administración puede cargar resultados', 403);
      const form = await req.formData();
      const file = form.get('file');
      const name = String(form.get('name') || '').trim();
      const examDate = new Date(String(form.get('examDate') || ''));
      if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.txt') || file.size > 5_000_000 || name.length < 3 || Number.isNaN(examDate.getTime())) return fail('Nombre, fecha y TXT de hasta 5 MB requeridos');
      return ok(await importExam(name, examDate, file.name, Buffer.from(await file.arrayBuffer()), user.id));
    }
    if (path === 'settings') {
      if (!canConfigure(user.role)) return fail('Solo administración puede elegir proveedor de IA', 403);
      const data = z.object({ provider: z.enum(['OPENAI', 'GEMINI', 'GROK', 'ANTHROPIC']), model: z.string().trim().min(1).max(100) }).parse(await body(req));
      const value = JSON.stringify({ provider: data.provider, model: data.provider === 'OPENAI' ? 'gpt-5-nano' : data.model });
      const existing = await db.amp_settings.findOne({ where: { key: 'ai' } });
      if (existing) await existing.update({ value, updatedAt: new Date() }); else await db.amp_settings.create({ key: 'ai', value, updatedAt: new Date() });
      await event(null, 'SETTINGS', `Proveedor de IA: ${data.provider}.`, 'OPERATOR', String(user.id));
      return ok({ ok: true });
    }
    return fail('Ruta no encontrada', 404);
  } catch (error) {
    if (error instanceof z.ZodError) return fail(error.issues.map(issue => issue.message).join('; '));
    console.error(error);
    return fail(String(error), 500);
  }
}
