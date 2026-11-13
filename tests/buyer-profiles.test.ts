import assert from 'node:assert/strict';
import test from 'node:test';
import {
  alcanzoMitad, aPerfilListado, calcularAvancePct, construirFiltro, construirLineaDeTiempo, diaLimaDe, enmascararCorreo, enmascararTelefono, esLead, filtroPerfilesSchema,
  llegoAlFinal, perfilQuerySchema
} from '../src/lib/buyer-profiles';
import { assertSoloLectura } from '../src/lib/external';

test('enmascarado de correo y teléfono', () => {
  assert.equal(enmascararCorreo('juan.perez@dominio.com'), 'j***@dominio.com');
  assert.equal(enmascararCorreo('a@x.pe'), 'a***@x.pe');
  assert.equal(enmascararCorreo('sin-arroba'), '***');
  assert.equal(enmascararCorreo('@dominio.com'), '***');
  assert.equal(enmascararCorreo(null), '');
  assert.equal(enmascararTelefono('987654321'), '*****321');
  assert.equal(enmascararTelefono('+51 987-654-321'), '*****321');
  assert.equal(enmascararTelefono('123'), '***');
  assert.equal(enmascararTelefono(''), '');
  assert.equal(enmascararTelefono(undefined), '');
  // El enmascarado no filtra el resto del dato.
  assert.ok(!enmascararCorreo('juan.perez@dominio.com').includes('uan'));
  assert.ok(!enmascararTelefono('987654321').includes('9876'));
});

test('avancePct: porcentaje con un decimal, tope 100 y casos sin dato', () => {
  assert.equal(calcularAvancePct(45, 90), 50);
  assert.equal(calcularAvancePct(31, 90), 34.4);
  assert.equal(calcularAvancePct(200, 90), 100);
  assert.equal(calcularAvancePct(0, 90), 0); // reproducción sin puntos
  assert.equal(calcularAvancePct(10, 0), null);
  assert.equal(calcularAvancePct(10, null), null);
  assert.equal(calcularAvancePct(null, 90), null);
  assert.equal(alcanzoMitad(45, 90), true);
  assert.equal(alcanzoMitad(44, 90), false);
  assert.equal(llegoAlFinal(90, 90), true);
  assert.equal(llegoAlFinal(89, 90), false);
});

test('esLead: VALIDO o DUPLICADO con persona', () => {
  assert.equal(esLead('VALIDO', 5), true);
  assert.equal(esLead('DUPLICADO', 5), true);
  assert.equal(esLead('VALIDO', null), false);
  assert.equal(esLead('INVALIDO', null), false);
  assert.equal(esLead('REVISION', 7), false);
});

test('parámetros del listado: valores por defecto, límites y búsqueda de 3 o más caracteres', () => {
  const base = filtroPerfilesSchema.parse({});
  assert.equal(base.page, 1); assert.equal(base.pageSize, 25); assert.equal(base.q, undefined);
  const f = filtroPerfilesSchema.parse({ page: '2', pageSize: '50', q: '  Ana  ', estado: 'VALIDO', canal: 'tiktok', campana: '7', rol: 'MADRE', from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(f, { page: 2, pageSize: 50, q: 'Ana', estado: 'VALIDO', canal: 'TIKTOK', campana: 7, rol: 'MADRE', from: '2026-10-01', to: '2026-10-31' });
  assert.equal(filtroPerfilesSchema.parse({ q: '   ', estado: '', canal: '' }).q, undefined); // vacíos = sin filtro
  for (const malo of [{ pageSize: 51 }, { pageSize: 0 }, { page: 0 }, { q: 'ab' }, { estado: 'OTRO' }, { rol: 'TIO' }, { canal: "x'; DROP" }, { campana: 'abc' }, { campana: -2 },
    { from: '2026-13-01' }, { from: '2026-10-31', to: '2026-10-01' }, { from: '2020-01-01', to: '2026-10-01' }]) {
    assert.equal(filtroPerfilesSchema.safeParse(malo).success, false, JSON.stringify(malo));
  }
  assert.match(filtroPerfilesSchema.safeParse({ q: 'ab' }).error!.issues[0].message, /al menos 3 caracteres/);
  assert.equal(perfilQuerySchema.parse({ formulario: '116501' }).formulario, 116501);
  for (const malo of [{}, { formulario: '0' }, { formulario: 'abc' }, { formulario: '1.5' }, { formulario: '-3' }]) assert.equal(perfilQuerySchema.safeParse(malo).success, false, JSON.stringify(malo));
});

test('armado del filtro SQL: parametrizado, sin unir tablas de más y de solo lectura', () => {
  const vacio = construirFiltro(filtroPerfilesSchema.parse({}));
  assert.equal(vacio.joins, '');
  assert.equal(vacio.where, '1 = 1');
  assert.deepEqual(vacio.params, {});
  const total = construirFiltro(filtroPerfilesSchema.parse({ estado: 'INVALIDO', rol: 'PADRE', canal: 'instagram', campana: 3, q: 'Ana 987', from: '2026-10-01', to: '2026-10-31' }));
  assert.match(total.joins, /JOIN mkt\.VisitaLanding AS vi/);
  assert.match(total.joins, /JOIN cat\.Canal AS ca/);
  assert.match(total.where, /f\.IdEstadoFormulario = 3/);
  assert.match(total.where, /f\.IdRolContacto = 2/);
  assert.match(total.where, /\(f\.NombreCompleto LIKE :q OR f\.Correo LIKE :q OR f\.Telefono LIKE :qd\)/); // 'Ana 987' trae 3 dígitos: también busca por teléfono
  assert.match(total.where, /f\.Telefono LIKE :qd/);
  assert.equal(total.params.canal, 'INSTAGRAM');
  assert.equal(total.params.campana, 3);
  assert.equal(total.params.q, '%Ana 987%');
  assert.equal(total.params.qd, '%987%');
  assert.equal(total.params.ini, '2026-10-01 05:00:00'); // medianoche de Lima en UTC
  assert.equal(total.params.fin, '2026-11-01 05:00:00');
  // El conteo por estado ignora el estado elegido (las tarjetas siguen mostrando todos).
  assert.ok(!construirFiltro(filtroPerfilesSchema.parse({ estado: 'VALIDO' }), false).where.includes('IdEstadoFormulario'));
  // Los comodines escritos por el usuario no se interpretan.
  assert.equal(construirFiltro(filtroPerfilesSchema.parse({ q: '100%_[x]' })).params.q, '%100 x%');
  assert.doesNotThrow(() => assertSoloLectura(`SELECT f.IdFormulario FROM mkt.FormularioContacto AS f${total.joins} WHERE ${total.where} ORDER BY f.FechaHoraEnvio DESC OFFSET 0 ROWS FETCH NEXT 25 ROWS ONLY`));
  // Un `q` hostil solo llega como parámetro, nunca dentro del SQL.
  assert.ok(!construirFiltro(filtroPerfilesSchema.parse({ q: "x' OR 1=1 --" })).where.includes('OR 1=1'));
});

test('fila del listado: correo y teléfono enmascarados, campaña, video y avance', () => {
  const p = aPerfilListado({
    IdFormulario: 116501, IdPersona: 900, NombreCompleto: 'Ana Quispe', Correo: 'ana.quispe@correo.pe', Telefono: '987654321', rol: 'MADRE', estado: 'VALIDO', envio: '2026-11-12T15:04:05',
    canal: 'TIKTOK', IdCampana: 12, campana: 'Verano', tipo: 'PAGADA', IdVideo: 5, video: 'Presentación', DuracionSeg: 100, MaxSeg: 62
  });
  assert.deepEqual(p, {
    idFormulario: 116501, idPersona: 900, nombre: 'Ana Quispe', correo: 'a***@correo.pe', telefono: '*****321', rol: 'MADRE', estado: 'VALIDO', enviadoEn: '2026-11-12T15:04:05Z', canal: 'TIKTOK',
    campana: { id: 12, nombre: 'Verano', tipo: 'PAGADA' }, video: { id: 5, nombre: 'Presentación' }, avancePct: 62, esLead: true
  });
  const sin = aPerfilListado({ IdFormulario: 7, IdPersona: null, NombreCompleto: null, Correo: null, Telefono: null, rol: null, estado: 'INVALIDO', envio: '2026-11-12T15:04:05', canal: 'DIRECTO', IdCampana: null, IdVideo: null });
  assert.equal(sin.campana, null); assert.equal(sin.video, null); assert.equal(sin.avancePct, null); assert.equal(sin.esLead, false);
  assert.equal(sin.correo, ''); assert.equal(sin.nombre, '');
});

test('línea de tiempo: visita, video (inicio, mitad, final o abandono) y formulario en orden', () => {
  const base = {
    visita: { inicio: '2026-11-12T15:00:00Z', canal: 'TIKTOK', campana: { id: 12, nombre: 'Verano', tipo: 'PAGADA' } },
    formulario: { enviadoEn: '2026-11-12T15:02:10Z', estado: 'VALIDO', rol: 'MADRE' }
  };
  const completo = construirLineaDeTiempo({
    ...base,
    reproduccion: { inicio: '2026-11-12T15:00:20Z', video: 'Presentación', version: 'v2', duracionSeg: 100, puntos: [{ segundo: 10, registradoEn: '2026-11-12T15:00:30Z' }, { segundo: 50, registradoEn: '2026-11-12T15:01:10Z' }, { segundo: 100, registradoEn: '2026-11-12T15:01:50Z' }] }
  });
  assert.deepEqual(completo.map(e => e.tipo), ['VISITA', 'VIDEO', 'VIDEO', 'VIDEO', 'FORMULARIO']);
  assert.match(completo[0].texto, /Llegó a la landing desde TIKTOK por la campaña «Verano» \(anuncio pagado\)/);
  assert.match(completo[1].texto, /Empezó a ver «Presentación» \(v2, 100 s\)/);
  assert.match(completo[2].texto, /mitad del video \(segundo 50 s\)/);
  assert.equal(completo[3].texto, 'Vio el video completo.');
  assert.match(completo[4].texto, /como madre: estado válido/);
  assert.deepEqual(completo.map(e => e.at), [...completo.map(e => e.at)].sort());
  const abandono = construirLineaDeTiempo({
    visita: { inicio: '2026-11-12T15:00:00Z', canal: 'DIRECTO', campana: null }, formulario: { enviadoEn: '2026-11-12T15:05:00Z', estado: 'INVALIDO', rol: null },
    reproduccion: { inicio: '2026-11-12T15:00:20Z', video: 'Presentación', version: 'v2', duracionSeg: 100, puntos: [{ segundo: 10, registradoEn: '2026-11-12T15:00:30Z' }, { segundo: 30, registradoEn: '2026-11-12T15:00:50Z' }] }
  });
  assert.match(abandono[0].texto, /sin campaña identificada/);
  assert.ok(!abandono.some(e => /mitad|completo/.test(e.texto)));
  assert.match(abandono.find(e => /Dejó de ver/.test(e.texto))!.texto, /en el 30 % \(segundo 30 s de 100 s\)/);
  assert.match(abandono[abandono.length - 1].texto, /estado inválido/);
  const sinVideo = construirLineaDeTiempo({ ...base, reproduccion: null });
  assert.deepEqual(sinVideo.map(e => e.tipo), ['VISITA', 'FORMULARIO']);
  const sinPuntos = construirLineaDeTiempo({ ...base, reproduccion: { inicio: '2026-11-12T15:00:20Z', video: 'V', version: 'v1', duracionSeg: 60, puntos: [] } });
  assert.ok(sinPuntos.some(e => /No se registró avance/.test(e.texto)));
  // A igual instante: visita, video, formulario.
  const empate = construirLineaDeTiempo({ visita: { inicio: '2026-11-12T15:00:00Z', canal: 'X', campana: null }, formulario: { enviadoEn: '2026-11-12T15:00:00Z', estado: 'VALIDO', rol: null }, reproduccion: { inicio: '2026-11-12T15:00:00Z', video: 'V', version: 'v1', duracionSeg: 60, puntos: [] } });
  assert.deepEqual(empate.map(e => e.tipo), ['VISITA', 'VIDEO', 'VIDEO', 'FORMULARIO']);
});

test('día de Lima de un instante UTC', () => {
  assert.equal(diaLimaDe('2026-11-12T03:00:00Z'), '2026-11-11');
  assert.equal(diaLimaDe('2026-11-12T05:00:00Z'), '2026-11-12');
});
