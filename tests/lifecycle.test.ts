import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { lifecycleAssessment, declaredExitReason, recoveryWindow, pendingServiceReview, reactivated, serviceSignal } from '../src/lib/lifecycle-policy';
import { tables } from '../src/lib/db';
import { prepareLifecycle, lifecycleContext, lifecycleAutomaticBlock } from '../src/lib/lifecycle';
import { sendInsight, scanRadar } from '../src/lib/radar';
import { processInbound, decideInbound } from '../src/lib/inbound';
import { sendMessage } from '../src/lib/messaging';
import { prioritize } from '../src/lib/priorities';
import type { Contact } from '../src/lib/types';

const now = new Date('2026-09-25T17:00:00Z');
const customer = { id: 1, fullName: 'Ana Torres', stage: 'CUSTOMER', contactPaused: false, admissionStatus: null, lastActivityAt: null, stageChangedAt: '2026-09-01T17:00:00Z', examDate: null, progress: null } as Contact;

test('CUSTOMER: cinco días, datos desconocidos y evidencia semanal sin inventar evaluaciones', () => {
  const missing = lifecycleAssessment(customer, [], [], [], now);
  assert.equal(missing.inactivity, null);
  assert.equal(missing.alert, false);
  assert.match(missing.summary, /No hay reporte/);
  const c = { ...customer, lastActivityAt: '2026-09-20T17:00:00Z' };
  const a = lifecycleAssessment(c, [{ weekStart: '2026-09-21', activitiesCompleted: 0, activitiesPlanned: null, simulations: null, score: 66, missingCourses: 'Matemática' }, { weekStart: '2026-09-14', activitiesCompleted: 3, activitiesPlanned: 5, simulations: 1, score: 60, missingCourses: null }], [], [], now);
  assert.equal(a.alert, true);
  assert.equal(prioritize(c, null, false, false, now).requiresAttention, true);
  assert.match(a.summary, /0 actividades completadas/);
  assert.doesNotMatch(a.summary, /0 actividades programadas|0 simulacros/);
  assert.doesNotMatch(a.draft!, /mejoraste|10 %|estancamiento/);
  assert.match(a.guardianDraft, /Ana Torres/);
  assert.notEqual(a.guardianDraft, a.draft);
  assert.match(a.evidence.join(' '), /Comparabilidad.*no disponible/);
});

test('TURNED: fecha confiable, límite exacto, motivos declarados y reactivación', () => {
  const c = { ...customer, stage: 'TURNED' as const };
  assert.equal(recoveryWindow({ ...c, stageChangedAt: null }, now).allowed, false);
  assert.equal(recoveryWindow({ ...c, stageChangedAt: 'fecha inválida' }, now).allowed, false);
  assert.equal(recoveryWindow({ ...c, stageChangedAt: '2027-01-01' }, now).allowed, false);
  assert.equal(recoveryWindow(c, now).allowed, true);
  assert.equal(recoveryWindow(c, new Date('2026-10-01T17:00:00Z')).allowed, false);
  assert.equal(recoveryWindow({ ...c, admissionStatus: 'ADMITTED' }, now).allowed, false);
  assert.equal(recoveryWindow({ ...c, contactPaused: true }, now).allowed, false);
  assert.equal(declaredExitReason('¿Cuánto cuesta?'), null);
  assert.equal(declaredExitReason('Dejé de usar la plataforma por falta de tiempo.'), 'Dejé de usar la plataforma por falta de tiempo.');
  const a = lifecycleAssessment(c, [], [{ id: 1, direction: 'IN', body: 'Dejé de usar la plataforma por falta de tiempo.', createdAt: now }], [{ type: 'STAGE_CHANGE', summary: 'CUSTOMER → TURNED confirmado por datamart.', createdAt: '2026-09-01T17:00:00Z' }], now);
  assert.equal(a.origin, 'CUSTOMER');
  assert.match(a.draft!, /tiempo disponible/);
  assert.equal(a.proposal, true);
  assert.equal(reactivated('TURNED', 'PAYER'), true);
  assert.equal(reactivated('TURNED', 'TURNED'), false);
});

test('cancelación, insatisfacción y acceso siempre requieren revisión, incluso en consultas mixtas', () => {
  for (const body of ['No quiero renovar', 'No estoy satisfecho', '¿Es virtual? No puedo entrar']) {
    assert.ok(serviceSignal(body));
    assert.equal(decideInbound(body, customer).decision, 'MANUAL');
  }
  assert.equal(serviceSignal('No quiero cancelar'), null);
  const messages = [{ id: 1, direction: 'IN', body: 'Quiero cancelar', createdAt: '2026-09-24T17:00:00Z' }];
  assert.equal(pendingServiceReview([], messages), true);
  assert.equal(pendingServiceReview([{ type: 'SERVICE_REVIEW_RESOLVED', summary: 'Atendido', createdAt: now }], messages), false);
  assert.equal(pendingServiceReview([{ type: 'SERVICE_REVIEW_RESOLVED', summary: 'Atendido', createdAt: now }], [...messages, { ...messages[0], id: 2, createdAt: '2026-09-26T17:00:00Z' }]), true);
});

test('integración aislada: borradores, Radar, envíos simulados, revisión y pausa sin tocar la BD local', async () => {
  process.env.DEMO_MODE = 'true';
  process.env.DB_DIALECT = 'sqlite';
  for (const key of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'XAI_API_KEY', 'ANTHROPIC_API_KEY']) delete process.env[key];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Red prohibida en pruebas'); };
  const memory = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  const globals = globalThis as any;
  globals.ampDb = memory;
  globals.ampModels = {};
  try {
    const db = tables();
    await memory.sync(); // Only ephemeral SQLite in RAM; no migrations or filesystem DB.
    const c = await db.dm_contacts.create({ sourceKey: 'TEST-C', fullName: 'Ana Torres', stage: 'CUSTOMER', interestChannel: 'EMAIL', email: 'ana@example.test', consentEmail: true, lastActivityAt: new Date(Date.now() - 6 * 86400000), stageChangedAt: new Date(Date.now() - 20 * 86400000) });
    const id = Number(c.get('id'));
    await prepareLifecycle(id);
    await prepareLifecycle(id);
    assert.equal(await db.amp_insights.count(), 1);
    assert.equal(await db.amp_messages.count(), 0);
    const suggestion = (await db.amp_insights.findOne())!;
    assert.equal(suggestion.get('sourceMessageId'), 0);
    await scanRadar();
    assert.equal(await db.amp_jobs.count(), 0);
    const sent = await sendInsight(Number(suggestion.get('id')), 1);
    assert.equal(sent.get('status'), 'SIMULATED');
    await prepareLifecycle(id);
    assert.equal(await db.amp_insights.count(), 1, 'no nueva sugerencia por el propio envío');
    const input = await db.amp_messages.create({ contactId: id, direction: 'IN', body: 'Quiero cancelar', channel: 'EMAIL', status: 'RECEIVED', senderType: 'CONTACT', recipientKind: 'STUDENT', createdAt: new Date() });
    assert.ok(await lifecycleAutomaticBlock(id), 'bloquea incluso antes de procesar triaje');
    await processInbound(Number(input.get('id')));
    assert.equal(await db.amp_events.count({ where: { type: 'SERVICE_REVIEW_REQUIRED' } }), 1);
    assert.equal((await lifecycleContext(id))?.assessment.review, true);
    await assert.rejects(sendMessage(id, 'EMAIL', 'Promoción', 'AGENT', 'test', true), /Revisión humana/);
    await db.amp_events.create({ contactId: id, type: 'SERVICE_REVIEW_RESOLVED', summary: 'Atendido', actorType: 'OPERATOR', createdAt: new Date(Date.now() + 1000) });
    assert.equal(await lifecycleAutomaticBlock(id), null);
    await db.amp_overrides.create({ contactId: id, field: 'contactPaused', value: 'true', source: 'OPERATOR', reason: 'Solicitud', createdAt: new Date() });
    await assert.rejects(sendMessage(id, 'EMAIL', 'Hola', 'OPERATOR', 'test'), /pausado/);
    const turned = await db.dm_contacts.create({ sourceKey: 'TEST-T', fullName: 'Luis Torres', stage: 'TURNED', stageChangedAt: new Date(Date.now() - 31 * 86400000) });
    assert.match((await lifecycleAutomaticBlock(Number(turned.get('id'))))!, /30 días/);
    await prepareLifecycle(Number(turned.get('id')));
    const stopped = await db.amp_insights.findOne({ where: { contactId: turned.get('id') } });
    assert.equal(stopped?.get('draft'), null);
    await assert.rejects(sendMessage(Number(turned.get('id')), 'EMAIL', 'Retoma', 'OPERATOR', 'test'), /30 días/);
    await db.amp_settings.create({ key: 'followup', value: JSON.stringify({ maxDays: 7 }) });
    const short = await db.dm_contacts.create({ sourceKey: 'TEST-S', fullName: 'Luis Vera', stage: 'TURNED', stageChangedAt: new Date(Date.now() - 10 * 86400000), interestChannel: 'EMAIL', email: 'luis@example.test', consentEmail: true });
    await db.amp_messages.create({ contactId: short.get('id'), direction: 'OUT', body: 'Hola', channel: 'EMAIL', status: 'SIMULATED', senderType: 'OPERATOR', recipientKind: 'STUDENT', createdAt: new Date(Date.now() - 8 * 86400000) });
    assert.match((await lifecycleAutomaticBlock(Number(short.get('id'))))!, /Radar/);
    const returning = await db.amp_messages.create({ contactId: short.get('id'), direction: 'IN', body: 'Dejé de usar la plataforma por falta de tiempo.', channel: 'EMAIL', status: 'RECEIVED', senderType: 'CONTACT', recipientKind: 'STUDENT', createdAt: new Date() });
    await processInbound(Number(returning.get('id')));
    await processInbound(Number(returning.get('id')));
    assert.equal(await db.amp_events.count({ where: { contactId: short.get('id'), type: 'TURNED_REASON' } }), 1);
    assert.equal(await lifecycleAutomaticBlock(Number(short.get('id'))), null, 'nueva consulta reinicia silencio, no el límite desde la baja');
  } finally {
    await memory.close();
    globals.ampDb = undefined;
    globals.ampModels = undefined;
    globalThis.fetch = originalFetch;
  }
});
