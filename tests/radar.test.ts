import assert from 'node:assert/strict';
import test from 'node:test';
import { assessConversation } from '../src/lib/radar';
const start = new Date('2026-09-01T12:00:00Z');
const outgoing = { id: 1, direction: 'OUT', body: 'Hola', channel: 'WHATSAPP', recipientKind: 'STUDENT', createdAt: start };

test('Radar progresa por fases y detiene seguimiento a 30 días', () => {
  assert.equal(assessConversation([outgoing], 30, new Date('2026-09-02T12:00:00Z'))?.phase, 'WAIT');
  assert.equal(assessConversation([outgoing], 30, new Date('2026-09-04T12:00:00Z'))?.phase, 'FOLLOWUP_1');
  assert.equal(assessConversation([outgoing], 30, new Date('2026-09-08T12:00:00Z'))?.phase, 'FOLLOWUP_2');
  assert.equal(assessConversation([outgoing], 30, new Date('2026-10-01T12:00:00Z'))?.phase, 'STOP');
});
test('una respuesta reinicia el silencio y el plazo configurable manda', () => {
  const inbound = { id: 2, direction: 'IN', body: 'Tengo una duda', channel: 'WHATSAPP', recipientKind: 'STUDENT', createdAt: new Date('2026-09-05T12:00:00Z') };
  assert.equal(assessConversation([outgoing, inbound], 7, new Date('2026-10-01T12:00:00Z'))?.phase, 'REPLY');
  const next = { ...outgoing, id: 3, createdAt: new Date('2026-09-06T12:00:00Z') };
  assert.equal(assessConversation([outgoing, inbound, next], 7, new Date('2026-09-13T12:00:00Z'))?.phase, 'STOP');
});
test('mensajes al apoderado y de etapas previas no crean silencio', () => {
  const guardian = { ...outgoing, recipientKind: 'GUARDIAN' };
  assert.equal(assessConversation([guardian], 30, new Date('2026-10-01T12:00:00Z')), null);
  assert.equal(assessConversation([outgoing], 30, new Date('2026-10-01T12:00:00Z'), new Date('2026-09-02T12:00:00Z')), null);
});
test('plantilla sin IA responde a una objeción de precio sin conceder ofertas', async () => {
  const { fallbackDraft } = await import('../src/lib/radar');
  const contact = { fullName: 'Lucía Fernández Rojas' } as any;
  const messages = [{ id: 4, direction: 'IN', body: '¿Cuánto cuesta? ¿Hay descuento?', channel: 'WHATSAPP', recipientKind: 'STUDENT', createdAt: start }];
  const draft = fallbackDraft(contact, 'REPLY', messages);
  assert.match(draft, /planes vigentes/);
  assert.match(draft, /operador puede revisar/);
  assert.doesNotMatch(draft, /\d+\s?%/);
});

test('una incidencia de acceso recibe un borrador pertinente para revisión humana', async () => {
  const { fallbackDraft } = await import('../src/lib/radar');
  const contact = { fullName: 'Luis Herrera Castro' } as any;
  const messages = [{ id: 5, direction: 'IN', body: 'Mi clase no funciona', channel: 'EMAIL', recipientKind: 'STUDENT', createdAt: start }];
  assert.match(fallbackDraft(contact, 'REPLY', messages), /problema con la plataforma/);
});
