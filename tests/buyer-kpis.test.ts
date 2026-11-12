import assert from 'node:assert/strict';
import test from 'node:test';
import {
  abandonmentQuerySchema, construirCurva, construirKpi, diaLima, KPI_DEFS, kpisQuerySchema, periodoAnterior, semaforo, type KpiCode
} from '../src/lib/buyer-kpis';
import { assertSoloLectura } from '../src/lib/external';
import { inscripcionSchema, secretoValido } from '../src/lib/buyer-webhook';

test('semáforo de KPI porcentuales en los bordes exactos de cada umbral', () => {
  const casos: Array<[KpiCode, number, string]> = [
    ['B-1.1', 59.99, 'ROJO'], ['B-1.1', 60, 'AMARILLO'], ['B-1.1', 79.99, 'AMARILLO'], ['B-1.1', 80, 'VERDE'],
    ['B-2.1', 29.99, 'ROJO'], ['B-2.1', 30, 'AMARILLO'], ['B-2.1', 59.99, 'AMARILLO'], ['B-2.1', 60, 'VERDE'],
    ['B-2.2', 49.99, 'ROJO'], ['B-2.2', 50, 'AMARILLO'], ['B-2.2', 74.99, 'AMARILLO'], ['B-2.2', 75, 'VERDE'],
    ['B-2.3', 4.99, 'ROJO'], ['B-2.3', 5, 'AMARILLO'], ['B-2.3', 11.99, 'AMARILLO'], ['B-2.3', 12, 'VERDE'],
    ['B-3.1', 2.99, 'ROJO'], ['B-3.1', 3, 'AMARILLO'], ['B-3.1', 7.99, 'AMARILLO'], ['B-3.1', 8, 'VERDE']
  ];
  for (const [code, valor, esperado] of casos) assert.equal(semaforo(code, valor), esperado, `${code} ${valor}`);
});

test('semáforo del costo por LEAD (S/): menor es mejor', () => {
  assert.equal(semaforo('B-1.2', 0), 'VERDE');
  assert.equal(semaforo('B-1.2', 8), 'VERDE');
  assert.equal(semaforo('B-1.2', 8.01), 'AMARILLO');
  assert.equal(semaforo('B-1.2', 15), 'AMARILLO');
  assert.equal(semaforo('B-1.2', 15.01), 'ROJO');
});

test('sin valor el semáforo es SIN_DATOS y un código desconocido falla', () => {
  assert.equal(semaforo('B-1.1', null), 'SIN_DATOS');
  assert.equal(semaforo('B-3.1', undefined), 'SIN_DATOS');
  assert.equal(semaforo('B-2.1', Number.NaN), 'SIN_DATOS');
  assert.throws(() => semaforo('B-9.9', 1));
});

test('denominador 0 → valor null y SIN_DATOS; con datos calcula porcentaje y estado', () => {
  const def = (code: KpiCode) => KPI_DEFS.find(item => item.code === code)!;
  const vacio = construirKpi(def('B-1.1'), 0, 0);
  assert.equal(vacio.value, null);
  assert.equal(vacio.status, 'SIN_DATOS');
  assert.equal(vacio.numerator, null);
  const cobertura = construirKpi(def('B-1.1'), 80, 100);
  assert.equal(cobertura.value, 80);
  assert.equal(cobertura.status, 'VERDE');
  assert.equal(cobertura.numerator, 80);
  assert.equal(cobertura.denominator, 100);
  const costo = construirKpi(def('B-1.2'), 1500, 100);
  assert.equal(costo.value, 15);
  assert.equal(costo.status, 'AMARILLO');
  assert.equal(costo.unit, 'S/');
});

test('guardián de solo lectura: acepta SELECT y WITH, rechaza todo lo demás', () => {
  assert.doesNotThrow(() => assertSoloLectura('SELECT 1'));
  assert.doesNotThrow(() => assertSoloLectura('  -- comentario\n select * from mkt.Video where Nombre = \'drop table x\''));
  assert.doesNotThrow(() => assertSoloLectura('WITH a AS (SELECT 1 AS x) SELECT x FROM a;'));
  for (const sql of [
    'DELETE FROM mkt.Video', 'UPDATE mkt.Video SET Nombre = 1', 'INSERT mkt.Video VALUES (1)', 'DROP TABLE mkt.Video', 'EXEC sp_who',
    'MERGE a USING b ON 1=1 WHEN MATCHED THEN DELETE;', 'TRUNCATE TABLE mkt.Video', 'ALTER TABLE a ADD b int',
    'SELECT 1; DROP TABLE mkt.Video', 'SELECT * INTO copia FROM mkt.Video', 'WITH a AS (SELECT 1) DELETE FROM mkt.Video',
    '/* SELECT */ DELETE FROM mkt.Video', '', '   '
  ]) assert.throws(() => assertSoloLectura(sql), /rechazada/, sql);
});

test('webhook: solo idFormulario es obligatorio y se valida el resto', () => {
  assert.equal(inscripcionSchema.parse({ idFormulario: 116501 }).idFormulario, 116501);
  assert.equal(inscripcionSchema.parse({ idFormulario: '116501' }).idFormulario, 116501);
  const completo = inscripcionSchema.parse({ idFormulario: 116501, idVisita: 647224, fechaHoraEnvio: '2026-11-12T15:04:05Z', estado: 'VALIDO' });
  assert.deepEqual(completo, { idFormulario: 116501, idVisita: 647224, fechaHoraEnvio: '2026-11-12T15:04:05Z', estado: 'VALIDO' });
  for (const malo of [{}, { idFormulario: 0 }, { idFormulario: -3 }, { idFormulario: 1.5 }, { idFormulario: 'abc' }, { idFormulario: null }, { idFormulario: 1, estado: 'OTRO' }, { idFormulario: 1, fechaHoraEnvio: 'ayer' }, { idFormulario: 1, idVisita: 0 }]) {
    assert.equal(inscripcionSchema.safeParse(malo).success, false, JSON.stringify(malo));
  }
});

test('webhook: los datos personales enviados se descartan', () => {
  const datos = inscripcionSchema.parse({ idFormulario: 5, nombre: 'Ana', correo: 'ana@x.pe', telefono: '999999999' });
  assert.deepEqual(Object.keys(datos), ['idFormulario']);
});

test('secreto del webhook en tiempo constante', () => {
  assert.equal(secretoValido('abc', 'abc'), true);
  assert.equal(secretoValido('abd', 'abc'), false);
  assert.equal(secretoValido('abcd', 'abc'), false);
  assert.equal(secretoValido('', 'abc'), false);
  assert.equal(secretoValido(null, 'abc'), false);
  assert.equal(secretoValido('abc', ''), false);
  assert.equal(secretoValido('abc', undefined), false);
});

test('parámetros de consulta de KPI y abandono', () => {
  assert.deepEqual(kpisQuerySchema.parse({}), {});
  assert.deepEqual(kpisQuerySchema.parse({ from: '2026-10-01', to: '2026-10-31', canal: 'tiktok', campana: '3', video: '5' }), { from: '2026-10-01', to: '2026-10-31', canal: 'TIKTOK', campana: 3, video: 5 });
  assert.equal(kpisQuerySchema.safeParse({ from: '2026-13-01' }).success, false);
  assert.equal(kpisQuerySchema.safeParse({ from: '2026-02-30' }).success, false);
  assert.equal(kpisQuerySchema.safeParse({ from: '2026-10-31', to: '2026-10-01' }).success, false);
  assert.equal(kpisQuerySchema.safeParse({ canal: "x'; DROP" }).success, false);
  assert.equal(kpisQuerySchema.safeParse({ campana: 'abc' }).success, false);
  assert.equal(abandonmentQuerySchema.safeParse({}).success, false);
  assert.equal(abandonmentQuerySchema.parse({ video: '5' }).video, 5);
});

test('periodo anterior y día de Lima (UTC−5)', () => {
  assert.deepEqual(periodoAnterior('2026-10-01', '2026-10-31'), { from: '2026-08-31', to: '2026-09-30' });
  const dia = diaLima(new Date('2026-11-12T03:00:00Z')); // en Lima aún es 11 de noviembre
  assert.equal(dia.fecha, '2026-11-11');
  assert.equal(dia.inicioUtc.toISOString(), '2026-11-11T05:00:00.000Z');
  assert.equal(dia.finUtc.toISOString(), '2026-11-12T05:00:00.000Z');
});

test('curva de abandono: alcanzan acumulado, conversión por tramo y mayor caída', () => {
  const tramos = new Map([[0, { n: 10, conv: 0 }], [10, { n: 30, conv: 3 }], [50, { n: 20, conv: 10 }], [100, { n: 40, conv: 20 }]]);
  const { total, curve, mayorCaida } = construirCurva(tramos);
  assert.equal(total, 100);
  assert.equal(curve.length, 11);
  assert.equal(curve[0].alcanzan, 100);
  assert.equal(curve[1].alcanzan, 90);
  assert.equal(curve[2].alcanzan, 60);
  assert.equal(curve[5].alcanzan, 60);
  assert.equal(curve[6].alcanzan, 40);
  assert.equal(curve[10].alcanzan, 40);
  assert.equal(curve[1].conversion, 10);
  assert.equal(curve[5].conversion, 50);
  assert.equal(curve[2].conversion, null);
  assert.deepEqual(mayorCaida, { desdePct: 10, hastaPct: 20, perdida: 30, perdidaPct: 30 });
  assert.equal(construirCurva(new Map()).mayorCaida, null);
});
