import assert from 'node:assert/strict';
import test from 'node:test';
import { leerPeriodo, type KpiPeriodo } from '../src/app/buyers/period-reading';

const kpi = (code: string, value: number | null, status: string, numerator: number | null, denominator: number, unit = '%'): KpiPeriodo => ({
  code, value, status, numerator, denominator, unit
});

test('resume KPI por estado y usa el formato numérico de la interfaz', () => {
  const lectura = leerPeriodo([
    kpi('B-1.1', 100, 'VERDE', 7048, 7048),
    kpi('B-2.1', 18.36, 'ROJO', 312, 1699),
    kpi('B-2.2', 56.15, 'AMARILLO', 954, 1699),
    kpi('B-2.3', 27.55, 'VERDE', 603, 2189),
    kpi('B-3.1', 17.71, 'VERDE', 1248, 7048),
    kpi('B-1.2', null, 'SIN_DATOS', null, 0, 'S/')
  ]);
  assert.match(lectura.quePaso, /^Requieren atención:/);
  assert.ok(lectura.quePaso.indexOf('En seguimiento:') > lectura.quePaso.indexOf('Requieren atención:'));
  assert.ok(lectura.quePaso.indexOf('Favorables:') > lectura.quePaso.indexOf('En seguimiento:'));
  assert.ok(lectura.quePaso.indexOf('No aplicable:') > lectura.quePaso.indexOf('Favorables:'));
  assert.match(lectura.quePaso, /18\.36 % \(312 de 1,699\)/);
  assert.match(lectura.quePaso, /27\.55 % \(603 de 2,189\)/);
  assert.match(lectura.quePaso, /B-1\.2 \(denominador 0\)/);
  assert.equal(lectura.abrirAgente, true);
});

test('todos los KPI favorables no recomiendan revisar propuestas ni abrir Agente', () => {
  const lectura = leerPeriodo([
    kpi('B-1.1', 100, 'VERDE', 100, 100),
    kpi('B-1.2', 5, 'VERDE', 100, 20, 'S/'),
    kpi('B-2.1', 80, 'VERDE', 80, 100),
    kpi('B-2.2', 80, 'VERDE', 80, 100),
    kpi('B-2.3', 15, 'VERDE', 15, 100),
    kpi('B-3.1', 10, 'VERDE', 10, 100)
  ]);
  assert.match(lectura.quePaso, /^Favorables:/);
  assert.match(lectura.queHacer, /No hace falta sugerir cambios/);
  assert.equal(lectura.queAccion, 'No hace falta actuar.');
  assert.equal(lectura.abrirAgente, false);
});

test('B-1 rojo recomienda publicaciones para ambos públicos y permite ir a Agente', () => {
  const lectura = leerPeriodo([kpi('B-1.1', 50, 'ROJO', 50, 100)]);
  assert.match(lectura.queHacer, /estudiantes postulantes y padres o apoderados/);
  assert.match(lectura.queHacer, /TikTok, Instagram y WhatsApp/);
  assert.match(lectura.queAccion, /propuestas de B-1/);
  assert.equal(lectura.abrirAgente, true);
});

test('B-1 en seguimiento también recomienda publicaciones y revisión manual', () => {
  const lectura = leerPeriodo([kpi('B-1.2', 12, 'AMARILLO', 120, 10, 'S/')]);
  assert.match(lectura.queHacer, /Para B-1/);
  assert.match(lectura.queAccion, /propuestas de B-1/);
  assert.equal(lectura.abrirAgente, true);
});

test('B-2 rojo recomienda variantes y cambios permitidos', () => {
  const lectura = leerPeriodo([kpi('B-2.1', 20, 'ROJO', 20, 100)]);
  assert.match(lectura.queHacer, /variantes de guion o llamado/);
  assert.match(lectura.queHacer, /duración, orden de beneficios o mensaje final/);
  assert.match(lectura.queAccion, /propuestas de B-2/);
  assert.equal(lectura.abrirAgente, true);
});

test('B-2 en seguimiento también recomienda revisar propuestas manualmente', () => {
  const lectura = leerPeriodo([kpi('B-2.2', 60, 'AMARILLO', 60, 100)]);
  assert.match(lectura.queHacer, /Para B-2/);
  assert.match(lectura.queAccion, /propuestas de B-2/);
  assert.equal(lectura.abrirAgente, true);
});

test('un KPI con denominador cero queda como no aplicable y no como problema', () => {
  const lectura = leerPeriodo([
    kpi('B-1.1', 90, 'VERDE', 90, 100),
    kpi('B-1.2', null, 'SIN_DATOS', null, 0, 'S/')
  ]);
  assert.match(lectura.quePaso, /Favorables:/);
  assert.match(lectura.quePaso, /No aplicable: B-1\.2 \(denominador 0\)/);
  assert.doesNotMatch(lectura.quePaso, /Requieren atención|En seguimiento/);
  assert.equal(lectura.abrirAgente, false);
});

test('sin datos para ningún KPI no inventa recomendaciones ni enlaces de acción', () => {
  const lectura = leerPeriodo([]);
  assert.equal(lectura.quePaso, 'Aún no hay datos del período para mostrar.');
  assert.match(lectura.queHacer, /Sin datos/);
  assert.match(lectura.queAccion, /No hace falta ejecutar nada/);
  assert.equal(lectura.abrirAgente, false);
});

test('si solo B-3 requiere atención, aclara que no requiere IA y no enlaza a Agente', () => {
  const lectura = leerPeriodo([kpi('B-3.1', 2, 'ROJO', 2, 100)]);
  assert.match(lectura.queHacer, /B-3 se mide con el formulario y no requiere IA/);
  assert.match(lectura.queAccion, /No hace falta abrir Agente/);
  assert.equal(lectura.abrirAgente, false);
});
