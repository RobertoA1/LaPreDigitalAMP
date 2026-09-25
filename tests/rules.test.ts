import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExamFile, normalizeName } from '../src/lib/exams';
import { withinSendHours } from '../src/lib/messaging';
import { nextSendWindow } from '../src/lib/jobs';

test('ranking de no ingresantes se reinicia por carrera y ordena por puntaje', () => {
  const source = [
    '001 000001  PEREZ LOPEZ ANA MARIA             100.000   MEDICINA          INGRESA',
    '002 000002  RUIZ VERA LUIS ALBERTO             95.000   MEDICINA          NO INGRESA',
    '003 000003  DIAZ LEON SOFIA ELENA             90.000   MEDICINA          NO INGRESA',
    '001 000004  TORRES NUÑEZ EVA MARIA            85.000   DERECHO           NO INGRESA'
  ].join('\r\n');
  const rows = parseExamFile(Buffer.from(source));
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(r => r.nonAdmittedRank), [null, 1, 2, 1]);
  assert.equal(normalizeName('Núñez  Torres, Eva'), 'NUNEZ TORRES EVA');
});

test('envíos automáticos usan horario de Lima de 07 a 23', () => {
  assert.equal(withinSendHours(new Date('2026-09-25T11:59:00Z')), false);
  assert.equal(withinSendHours(new Date('2026-09-25T12:00:00Z')), true);
  assert.equal(withinSendHours(new Date('2026-09-26T03:59:00Z')), true);
  assert.equal(withinSendHours(new Date('2026-09-26T04:00:00Z')), false);
  assert.equal(nextSendWindow(new Date('2026-09-26T04:00:00Z')).toISOString(), '2026-09-26T12:00:00.000Z');
});
