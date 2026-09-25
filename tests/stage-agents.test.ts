import assert from 'node:assert/strict';
import test from 'node:test';
import type { Contact } from '../src/lib/types';
import { messagePermission } from '../src/lib/messaging';
import {
  alreadyRecordedForMessage, assessPayerOnboarding, buildLeadProfile, detectBuyerIntent,
  buyerDraftRepeatsOffer, buyerOffersAlreadyPresented,
  explicitBenefitApproval, isExplicitBenefitRequest, isExplicitDiscountRequest, leadApprovalKind, parseStructuredProposal,
  payerDraftClaimsUnconfirmedFacts, shouldSendRenewalNotice
} from '../src/lib/stage-agents';

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 1, sourceKey: 'TEST-001', stage: 'LEAD', fullName: 'Ana Torres', email: 'ana@example.test', phone: '51999999999',
    university: 'Universidad Nacional de Trujillo', career: 'Medicina', accountType: 'ESTUDIANTE', guardianName: null,
    guardianEmail: null, guardianPhone: null, sourceChannel: 'WEB', interestChannel: 'WHATSAPP', plan: 'Plan mensual',
    paymentStatus: 'ACTIVE', admissionStatus: null, candidateNumber: null, academicStatus: null, examDate: null,
    renewalAt: null, lastActivityAt: null, stageChangedAt: null, sourceUpdatedAt: null, activityDays: null,
    progress: null, streakDays: null, score: null, missingCourses: null, notes: null, consentWhatsapp: true,
    consentEmail: true, guardianConsent: false, contactPaused: false, createdAt: new Date().toISOString(), ...overrides
  };
}

test('consulta informativa de precio no es solicitud de descuento', () => {
  assert.equal(isExplicitDiscountRequest('¿Cuánto cuesta el plan mensual?'), false);
  assert.equal(isExplicitDiscountRequest('¿Hay información sobre los precios?'), false);
  assert.equal(isExplicitDiscountRequest('Quiero solicitar un descuento'), true);
});

test('solicitud explícita de beneficio se identifica para aprobación humana', () => {
  assert.equal(isExplicitDiscountRequest('Quiero un descuento'), true);
  assert.equal(isExplicitBenefitRequest('¿Puedo obtener una beca?'), true);
  assert.equal(isExplicitDiscountRequest('Me interesa conocer cómo funcionan las promociones'), false);
  assert.equal(isExplicitDiscountRequest('Quiero conocer los descuentos vigentes'), false);
  assert.equal(leadApprovalKind('Quiero solicitar un descuento'), 'DISCOUNT');
  const approval = explicitBenefitApproval('Quiero solicitar un descuento', 23);
  assert.equal(approval?.kind, 'DISCOUNT');
  assert.equal(approval?.status, 'PENDING');
  assert.equal(JSON.parse(approval!.payload).proposedPercent, null);
  assert.equal(explicitBenefitApproval('Quiero una beca', 24)?.kind, 'SCHOLARSHIP_REVIEW');
  assert.equal(leadApprovalKind('¿Cuánto cuesta el plan mensual?'), null);
  assert.equal(leadApprovalKind('¿Hay descuento disponible?'), null);
  assert.equal(leadApprovalKind('', 'DISCOUNT', 'Te podemos dar un descuento'), 'OFFER_REVIEW');
});

test('buyer que manifiesta intención deja señales tipadas con evidencia', () => {
  const signals = detectBuyerIntent('¿Cuánto cuesta y cómo activo la prueba gratuita?');
  assert.deepEqual(signals.map(signal => signal.type), ['PRICE_QUERY', 'TRIAL_ACTIVATION']);
  assert.ok(signals.every(signal => signal.evidence.includes('prueba gratuita')));
  assert.ok(signals.every(signal => signal.recommendation.includes('verificad') || signal.recommendation.includes('activación')));
  assert.deepEqual(detectBuyerIntent('Necesito información para inscribirme.').map(signal => signal.type), ['INFORMATION_REQUEST', 'ENROLLMENT_QUESTION']);
});

test('no vuelve a registrar una señal del mismo tipo para el mismo mensaje', () => {
  const events = [{ detail: JSON.stringify({ messageId: 42, intentType: 'PRICE_QUERY' }) }];
  assert.equal(alreadyRecordedForMessage(events, 42, 'PRICE_QUERY'), true);
  assert.equal(alreadyRecordedForMessage(events, 42, 'TRIAL_ACTIVATION'), false);
  assert.equal(alreadyRecordedForMessage(events, 43, 'PRICE_QUERY'), false);
});

test('buyer evita repetir ofertas que ya aparecen en mensajes salientes', () => {
  const offers = buyerOffersAlreadyPresented([
    { direction: 'IN', body: '¿Qué ofrecen?' },
    { direction: 'OUT', body: 'Puedes iniciar la prueba Explora UNT de 14 días.' },
    { direction: 'OUT', body: 'Además, existe una promoción aprobada.' }
  ]);
  assert.deepEqual(offers.sort(), ['BENEFIT', 'TRIAL']);
  assert.equal(buyerDraftRepeatsOffer('¿Te gustaría activar la prueba Explora?', offers), true);
  assert.equal(buyerDraftRepeatsOffer('¿Qué información te ayudaría a decidir?', offers), false);
});

test('perfil de lead identifica campos esenciales faltantes', () => {
  const profile = buildLeadProfile(contact(), [{ id: 1, direction: 'IN', body: 'Me interesa conocer el servicio.' }]);
  assert.ok(profile.missingFields.includes('Disponibilidad semanal'));
  assert.ok(profile.missingFields.includes('Dificultades académicas'));
  assert.ok(profile.missingFields.includes('Estado de prueba gratuita'));
  assert.ok(!profile.missingFields.includes('Carrera objetivo'));
  assert.ok(!profile.missingFields.includes('Plan de interés'));
  assert.ok(profile.question);
  assert.equal((profile.question!.match(/\?/g) || []).length, 1);
});

test('prioridad comercial del lead se explica con evidencia observable, sin probabilidades', () => {
  const profile = buildLeadProfile(contact(), [{ id: 2, direction: 'IN', body: 'Quiero inscribirme esta semana.' }]);
  assert.equal(profile.priority, 'ALTA');
  assert.match(profile.priorityReason, /Quiero inscribirme/);
  assert.doesNotMatch(profile.priorityReason, /%|probabilidad/i);
  assert.equal(buildLeadProfile(contact(), [{ id: 3, direction: 'IN', body: '¿Cuánto cuesta el plan?' }]).priority, 'MEDIA');
});

test('payer recién activado inicia onboarding y deja NO_DATA para hitos desconocidos', () => {
  const now = new Date('2026-09-25T12:00:00Z');
  const payer = contact({ stage: 'PAYER', paymentStatus: 'ACTIVE', stageChangedAt: new Date(now.getTime() - 12 * 3600000).toISOString() });
  const assessment = assessPayerOnboarding(payer, [], now);
  assert.equal(assessment.activation, 'CONFIRMED');
  assert.equal(assessment.withinFirstThreeDays, true);
  assert.equal(assessment.access, 'NO_DATA');
  assert.equal(assessment.diagnostic, 'NO_DATA');
  assert.equal(assessment.studyPath, 'NO_DATA');
  assert.equal(assessment.firstActivity, 'NO_DATA');
  assert.equal(payerDraftClaimsUnconfirmedFacts('Ya tienes acceso y completaste el diagnóstico.', assessment), true);
});

test('onboarding usa solo confirmaciones y actividad posteriores a la activación', () => {
  const activatedAt = new Date('2026-09-24T12:00:00Z');
  const payer = contact({ stage: 'PAYER', paymentStatus: 'ACTIVE', stageChangedAt: activatedAt.toISOString(), lastActivityAt: new Date(activatedAt.getTime() + 3600000).toISOString() });
  const assessment = assessPayerOnboarding(payer, [
    { id: 1, direction: 'IN', body: 'Ya pude ingresar e hice el diagnóstico inicial.', createdAt: new Date(activatedAt.getTime() + 1800000).toISOString() },
    { id: 2, direction: 'IN', body: 'Ya configuré mi ruta de estudio.', createdAt: new Date(activatedAt.getTime() + 2400000).toISOString() },
    { id: 3, direction: 'IN', body: 'Ya tenía acceso y ruta en el ciclo anterior.', createdAt: new Date(activatedAt.getTime() - 86400000).toISOString() }
  ], new Date(activatedAt.getTime() + 2 * 86400000));
  assert.equal(assessment.access, 'CONFIRMED');
  assert.equal(assessment.diagnostic, 'COMPLETED');
  assert.equal(assessment.studyPath, 'CONFIGURED');
  assert.equal(assessment.firstActivity, 'RECORDED');
  assert.equal(assessment.earlyInactivity, false);
});

test('payer sin actividad registrada después de tres días recibe recomendación de ayuda', () => {
  const activatedAt = new Date('2026-09-20T12:00:00Z');
  const now = new Date(activatedAt.getTime() + 3 * 86400000 + 1000);
  const payer = contact({ stage: 'PAYER', paymentStatus: 'ACTIVE', stageChangedAt: activatedAt.toISOString(), lastActivityAt: new Date(activatedAt.getTime() - 86400000).toISOString() });
  const assessment = assessPayerOnboarding(payer, [], now);
  assert.equal(assessment.earlyInactivity, true);
  assert.match(assessment.nextAction, /ayuda personalizada/i);
  assert.equal(assessPayerOnboarding(payer, [], new Date(activatedAt.getTime() + 5 * 86400000)).earlyInactivity, false);
});

test('renovación ya confirmada por datamart no genera recordatorio', () => {
  const expected = '2026-10-02T12:00:00.000Z';
  assert.equal(shouldSendRenewalNotice(contact({ stage: 'PAYER', renewalAt: expected, paymentStatus: 'RENEWED' }), expected), false);
  assert.equal(shouldSendRenewalNotice(contact({ stage: 'PAYER', renewalAt: expected, paymentStatus: 'PAID' }), expected), false);
  assert.equal(shouldSendRenewalNotice(contact({ stage: 'PAYER', renewalAt: expected, paymentStatus: 'ACTIVE' }), expected), true);
  assert.equal(shouldSendRenewalNotice(contact({ stage: 'PAYER', renewalAt: expected, paymentStatus: null }), expected), false);
  assert.equal(shouldSendRenewalNotice(contact({ stage: 'PAYER', renewalAt: '2026-10-03T12:00:00.000Z', paymentStatus: 'ACTIVE' }), expected), false);
});

test('no envía a estudiante ni apoderado sin consentimiento y dirección disponibles', () => {
  const payer = contact({ stage: 'PAYER', consentWhatsapp: false, guardianConsent: false });
  assert.equal(messagePermission(payer, 'WHATSAPP', 'STUDENT'), 'NO_CONSENT');
  assert.equal(messagePermission(payer, 'WHATSAPP', 'GUARDIAN'), 'NO_CONSENT');
  assert.equal(messagePermission(contact({ guardianConsent: true }), 'EMAIL', 'GUARDIAN'), 'NO_ADDRESS');
  const guardianOnly = contact({ consentWhatsapp: false, guardianConsent: true, guardianPhone: '51988888888' });
  assert.equal(messagePermission(guardianOnly, 'WHATSAPP', 'STUDENT'), 'NO_CONSENT');
  assert.equal(messagePermission(guardianOnly, 'WHATSAPP', 'GUARDIAN'), 'ALLOWED');
});

test('fecha de activación o pago ausentes se representan como NO_DATA, no como inactividad', () => {
  const assessment = assessPayerOnboarding(contact({ stage: 'PAYER', paymentStatus: null, stageChangedAt: null, lastActivityAt: null }), [], new Date());
  assert.equal(assessment.activation, 'NO_DATA');
  assert.equal(assessment.firstActivity, 'NO_DATA');
  assert.equal(assessment.earlyInactivity, false);
});

test('salida estructurada rechaza propuestas inválidas o con varias preguntas', () => {
  assert.throws(() => parseStructuredProposal(JSON.stringify({ draft: '¿A o B? ¿Cuál?', nextAction: 'x', priority: 'ALTA', priorityReason: 'x', missingFields: [], proposalType: 'NONE', needsApproval: false, factsUsed: [] })));
  assert.throws(() => parseStructuredProposal('{"draft":"texto","needsApproval":"sí"}'));
});
