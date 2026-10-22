import assert from 'node:assert/strict';
import test from 'node:test';
import type { Contact } from '../src/lib/types';
import { decideInbound } from '../src/lib/inbound';
import { shouldSendRenewalNotice } from '../src/lib/stage-agents';
import {
  academicAssessment, classifyTurnedReason, lifecycleAssessment, pendingServiceReview,
  reactivationAttributionWindow, reactivated
} from '../src/lib/lifecycle-policy';

const now = new Date('2026-10-22T17:00:00Z');
function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 1, sourceKey: 'SCENARIO', stage: 'CUSTOMER', fullName: 'Ana Torres', email: 'ana@example.test', phone: '51999999999',
    university: 'Universidad Nacional de Trujillo', career: 'Medicina', accountType: 'ESTUDIANTE', guardianName: 'Mario Torres',
    guardianEmail: 'mario@example.test', guardianPhone: '51988888888', sourceChannel: 'WEB', interestChannel: 'WHATSAPP', plan: 'Meta UNT',
    paymentStatus: 'ACTIVE', admissionStatus: null, candidateNumber: null, academicStatus: 'EN_PREPARACION', examDate: null,
    renewalAt: '2026-11-01T17:00:00Z', lastActivityAt: '2026-10-17T17:00:00Z', stageChangedAt: '2026-10-01T17:00:00Z', sourceUpdatedAt: '2026-10-22T16:00:00Z', activityDays: 5,
    progress: 60, streakDays: 0, score: 60, missingCourses: null, notes: null, consentWhatsapp: true, consentEmail: true,
    guardianConsent: true, contactPaused: false, createdAt: '2026-01-01T00:00:00Z', ...overrides
  };
}

test('1. cinco días sin actividad propone una actividad breve y prioriza el riesgo', () => {
  const assessment = lifecycleAssessment(contact(), [], [], [], now);
  assert.equal(assessment.activity.thresholdReached, true);
  assert.equal(assessment.risk.level, 'MEDIO');
  assert.match(assessment.draft!, /cinco días/i);
  assert.equal(assessment.action.state, 'PROPUESTA');
});

test('2. descenso equivalente de al menos 10 % deriva ajuste académico pendiente', () => {
  const assessment = lifecycleAssessment(contact({ plan: 'Meta UNT', examDate: '2026-10-30T17:00:00Z', lastActivityAt: '2026-10-21T17:00:00Z' }), [
    { weekStart: '2026-10-20', activitiesCompleted: 8, activitiesPlanned: 10, score: 54, simulations: 1, missingCourses: 'Álgebra', equivalentGroup: 'SIM-UNT' },
    { weekStart: '2026-10-13', activitiesCompleted: 8, activitiesPlanned: 10, score: 60, simulations: 1, missingCourses: null, equivalentGroup: 'SIM-UNT' }
  ], [], [], now);
  assert.equal(assessment.academic.decline10?.variationPercent, -10);
  assert.equal(assessment.action.type, 'ACADEMIC_ROUTE_ADJUSTMENT');
  assert.equal(assessment.action.state, 'PENDIENTE');
  assert.match(assessment.evidence.join(' '), /Próxima evaluación/);
});

test('3. incidencia técnica queda abierta y se deriva antes de promover continuidad', () => {
  const messages = [{ id: 1, direction: 'IN', body: 'No puedo entrar a la plataforma', createdAt: '2026-10-22T12:00:00Z' }];
  const events = [{ type: 'INCIDENT_OPEN', summary: 'Acceso pendiente', createdAt: '2026-10-22T12:00:00Z' }];
  const assessment = lifecycleAssessment(contact({ lastActivityAt: '2026-10-21T17:00:00Z' }), [], messages, events, now);
  assert.equal(assessment.review, true);
  assert.equal(assessment.action.type, 'HUMAN_REVIEW');
  assert.equal(assessment.action.state, 'DERIVADA');
  assert.equal(assessment.risk.evidence.some(item => item.signal === 'INCIDENCIA'), true);
});

test('4. intención explícita de cancelar es alto riesgo por sí sola', () => {
  const messages = [{ id: 1, direction: 'IN', body: 'Quiero cancelar', createdAt: now }];
  const assessment = lifecycleAssessment(contact(), [], messages, [], now);
  assert.equal(assessment.risk.level, 'ALTO');
  assert.equal(assessment.risk.explicitCancellation, true);
  assert.equal(assessment.action.needsHuman, true);
});

test('5. renovación confirmada no pasa el control de envío', () => {
  const c = contact({ stage: 'CUSTOMER', paymentStatus: 'RENEWED' });
  assert.equal(shouldSendRenewalNotice(c, c.renewalAt!), false);
});

test('6. TURNED por tiempo ofrece preparación manejable y conserva motivo declarado', () => {
  const c = contact({ stage: 'TURNED', plan: 'Ruta UNT', lastActivityAt: '2026-09-01T17:00:00Z' });
  const messages = [{ id: 2, direction: 'IN', body: 'Dejé de usar la plataforma por falta de tiempo', createdAt: '2026-10-05T17:00:00Z' }];
  const assessment = lifecycleAssessment(c, [], messages, [{ type: 'STAGE_CHANGE', summary: 'CUSTOMER → TURNED confirmado por datamart.', createdAt: '2026-10-01T17:00:00Z' }], now);
  assert.equal(assessment.reasonType, 'TIME');
  assert.match(assessment.draft!, /manejable/);
  assert.equal(classifyTurnedReason(assessment.reason), 'TIME');
});

test('7. TURNED con motivo desconocido pregunta, no inventa una causa', () => {
  const assessment = lifecycleAssessment(contact({ stage: 'TURNED' }), [], [], [], now);
  assert.equal(assessment.reasonType, 'UNKNOWN');
  assert.match(assessment.draft!, /motivo de tu salida/i);
  assert.match(assessment.evidence.join(' '), /motivo de baja desconocido/i);
});

test('8. ingreso universitario cierra la recuperación', () => {
  const assessment = lifecycleAssessment(contact({ stage: 'TURNED', admissionStatus: 'ADMITTED' }), [], [], [], now);
  assert.equal(assessment.draft, null);
  assert.equal(assessment.action.type, 'OBJECTIVE_COMPLETED');
  assert.match(assessment.recommendation, /cerrar/i);
});

test('9. solicitud de detener contactos produce pausa y no respuesta automática', () => {
  const decision = decideInbound('No me escriban más, por favor', { fullName: 'Ana Torres', stage: 'CUSTOMER', contactPaused: false, admissionStatus: null });
  assert.equal(decision.decision, 'MANUAL');
  assert.equal(decision.optOut, true);
});

test('10. incidencias repetidas y ejecuciones confirmadas no se confunden con una recomendación', () => {
  const messages = [
    { id: 1, direction: 'IN', body: 'No puedo entrar', createdAt: '2026-10-20T12:00:00Z' },
    { id: 2, direction: 'IN', body: 'Otra vez no funciona el acceso', createdAt: '2026-10-22T12:00:00Z' }
  ];
  const assessment = lifecycleAssessment(contact(), [], messages, [], now);
  assert.equal(assessment.risk.evidence.some(item => item.signal === 'INCIDENCIA_REPETIDA'), true);
  assert.equal(pendingServiceReview([], messages), true);
  assert.equal(reactivated('TURNED', 'PAYER'), true);
  assert.equal(reactivationAttributionWindow(contact({ stage: 'TURNED' }), [], now).eligible, false);
  assert.equal(academicAssessment([{ weekStart: '2026-10-20', activitiesCompleted: 1, activitiesPlanned: 1, score: 50, simulations: 0, missingCourses: null }], now).status, 'NO_COMPARABLE');
});
