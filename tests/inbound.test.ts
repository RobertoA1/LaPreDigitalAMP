import assert from 'node:assert/strict';
import test from 'node:test';
import { decideInbound } from '../src/lib/inbound';
import { prioritize } from '../src/lib/priorities';
import type { Contact } from '../src/lib/types';

const buyer = { id: 1, fullName: 'Ana Torres', stage: 'BUYER', contactPaused: false, admissionStatus: null, lastActivityAt: null, renewalAt: null, paymentStatus: null } as Contact;

test('responde automáticamente solo consultas institucionales verificadas', () => {
  for (const text of ['Hola', 'Gracias', '¿Tienen clases presenciales?', '¿Preparan para la Universidad Nacional de Trujillo?']) {
    const result = decideInbound(text, buyer);
    assert.equal(result.decision, 'AUTO', text);
    assert.ok(result.reply);
  }
});

test('escala ofertas, pagos, admisión y asuntos no verificados', () => {
  for (const text of ['¿Cuánto cuesta?', '¿Hay promoción?', '¿Puedo cambiar mi plan?', 'Quiero una beca', '¿Ingresé a la UNT?', 'Mi clase no funciona']) {
    assert.equal(decideInbound(text, buyer).decision, 'MANUAL', text);
  }
});

test('detiene comunicaciones a petición del contacto', () => {
  const result = decideInbound('No quiero más mensajes', buyer);
  assert.equal(result.decision, 'MANUAL');
  assert.equal(result.optOut, true);
});

test('separa atención de espera y prioriza respuesta manual', () => {
  const waiting = prioritize(buyer, { id: 1, phase: 'WAIT', alert: false }, false, false);
  const manual = prioritize({ ...buyer, id: 2 }, { id: 2, phase: 'MANUAL_REPLY', alert: true, draft: 'Hola' }, false, false);
  const followup = prioritize({ ...buyer, id: 3 }, { id: 3, phase: 'FOLLOWUP_1', alert: true }, false, false);
  assert.equal(waiting.requiresAttention, false);
  assert.equal(manual.requiresAttention, true);
  assert.equal(followup.requiresAttention, true);
  assert.ok(manual.priorityScore > followup.priorityScore);
});
