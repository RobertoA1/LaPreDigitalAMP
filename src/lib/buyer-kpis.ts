import { z } from 'zod';
import { datamart, oltp, queryExternal, type Parametros } from './external';
import { KPI_DEFS, REGLAS_FABRICA, reglasVigentes, semaforo, type Estado, type KpiCode, type KpiDef, type ReglasVigentes, type Umbral, type Actividad } from './buyer-rules';

/**
 * KPI del Agente de conversión Buyer → Lead (spec §3).
 * - DataMart (`LaPreDigitalDatamart`): KPI por periodo y dimensión, tendencia y comparaciones.
 * - OLTP (`LaPreDigitalOLTP`): actividad de hoy y curva de abandono.
 * Todo es de solo lectura y parametrizado.
 */

// ---------------------------------------------------------------------------
// Umbrales y semáforos (única fuente de verdad)
// ---------------------------------------------------------------------------

export { KPI_DEFS, KPI_CODES, semaforo } from './buyer-rules';
export type { KpiCode, Estado, Actividad, Umbral, KpiDef } from './buyer-rules';

// ---------------------------------------------------------------------------
// Filtros y validación de parámetros
// ---------------------------------------------------------------------------

export type Filtros = { from: string; to: string; canal?: string; campana?: number; video?: number };
const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (usa AAAA-MM-DD)').refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, 'Fecha inexistente');
const vacioANada = (value: unknown) => (value === '' || value === null ? undefined : value);
/** Parámetros de consulta de `GET buyer/kpis`. */
export const kpisQuerySchema = z.object({
  from: z.preprocess(vacioANada, fechaIso.optional()),
  to: z.preprocess(vacioANada, fechaIso.optional()),
  canal: z.preprocess(vacioANada, z.string().regex(/^[A-Za-z_]{1,20}$/, 'Canal inválido').transform(value => value.toUpperCase()).optional()),
  campana: z.preprocess(vacioANada, z.coerce.number().int().positive().optional()),
  video: z.preprocess(vacioANada, z.coerce.number().int().positive().optional())
}).refine(value => !value.from || !value.to || value.from <= value.to, 'from no puede ser posterior a to')
  .refine(value => !value.from || !value.to || (Date.parse(value.to) - Date.parse(value.from)) / 86400000 <= 800, 'El periodo máximo es de 800 días');
/** Parámetros de consulta de `GET buyer/abandonment`. */
export const abandonmentQuerySchema = z.object({
  video: z.coerce.number().int().positive(),
  from: z.preprocess(vacioANada, fechaIso.optional()),
  to: z.preprocess(vacioANada, fechaIso.optional())
}).refine(value => !value.from || !value.to || value.from <= value.to, 'from no puede ser posterior a to')
  .refine(value => !value.from || !value.to || (Date.parse(value.to) - Date.parse(value.from)) / 86400000 <= 800, 'El periodo máximo es de 800 días');

// ---------------------------------------------------------------------------
// Caché en memoria y deduplicación de peticiones en curso
// ---------------------------------------------------------------------------

type Entrada = { en: number; firma: string; valor: unknown };
const globalCache = globalThis as unknown as { ampBuyerCache?: { datos: Map<string, Entrada>; enCurso: Map<string, Promise<unknown>> } };
const memoria = (globalCache.ampBuyerCache ||= { datos: new Map(), enCurso: new Map() });
export const TTL_CACHE_MS = 5 * 60_000;

/** Vacía la caché (pruebas y recarga manual). */
export function vaciarCacheBuyer() { memoria.datos.clear(); memoria.enCurso.clear(); }

/**
 * Devuelve el resultado en caché si es reciente (TTL) y la firma (fecha de la última carga del DataMart) no cambió; si no, lo calcula.
 * Peticiones idénticas en curso comparten una sola promesa. Los errores no se guardan.
 */
export async function conCache<T>(clave: string, calcular: () => Promise<T>, opciones: { ttlMs?: number; firma?: () => Promise<string> } = {}): Promise<T> {
  const ttl = opciones.ttlMs ?? TTL_CACHE_MS;
  const firma = opciones.firma ? await opciones.firma() : '';
  const previo = memoria.datos.get(clave);
  if (previo && previo.firma === firma && Date.now() - previo.en < ttl) return previo.valor as T;
  const enCurso = memoria.enCurso.get(clave);
  if (enCurso) return enCurso as Promise<T>;
  const promesa = (async () => {
    try { const valor = await calcular(); memoria.datos.set(clave, { en: Date.now(), firma, valor }); return valor; }
    finally { memoria.enCurso.delete(clave); }
  })();
  memoria.enCurso.set(clave, promesa);
  return promesa;
}
/** Firma de la carga del DataMart (se consulta como mucho una vez por minuto). */
const firmaCarga = () => conCache('firma-carga', async () => { const c = await ultimaCargaSinCache(); return `${c.fechaDatos}|${c.cargadoEn}`; }, { ttlMs: 60_000 });

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const num = (value: unknown) => (value == null ? 0 : Number(value));
const redondear = (value: number, decimales = 2) => Math.round(value * 10 ** decimales) / 10 ** decimales;
const dia = (value: unknown) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value == null ? null : String(value));
const PAGADA = 'Anuncio pagado'; // dim.Campana.TipoCampana de las campañas pagadas

/** Primer día del mes de `fecha` desplazado `meses` meses. */
function inicioMes(fecha: string, meses = 0) {
  const d = new Date(`${fecha}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + meses, 1)).toISOString().slice(0, 10);
}
/** Periodo inmediatamente anterior de la misma duración (para comparar). */
export function periodoAnterior(from: string, to: string) {
  const dias = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
  const fin = new Date(Date.parse(`${from}T00:00:00Z`) - 86400000);
  const ini = new Date(fin.getTime() - (dias - 1) * 86400000);
  return { from: ini.toISOString().slice(0, 10), to: fin.toISOString().slice(0, 10) };
}

// ---------------------------------------------------------------------------
// DataMart: agregación por grano
// ---------------------------------------------------------------------------

type Grupo = 'none' | 'mes' | 'canal' | 'campana' | 'video';
type Fila = Record<string, any>;
const COLUMNAS_GRUPO: Record<Grupo, string> = {
  none: '',
  mes: 't.AnioMes AS mes',
  canal: 'ca.Codigo AS canal, ca.Nombre AS canalNombre',
  campana: 'cp.IdCampana AS campanaId, cp.NombreCampana AS campana, cp.TipoCampana AS tipo',
  video: 'v.IdVideo AS videoId, v.NombreVideo AS video, v.VersionGuion AS version, v.DuracionSeg AS duracionSeg'
};
const GRUPO_POR: Record<Grupo, string> = {
  none: '', mes: 't.AnioMes', canal: 'ca.Codigo, ca.Nombre', campana: 'cp.IdCampana, cp.NombreCampana, cp.TipoCampana',
  video: 'v.IdVideo, v.NombreVideo, v.VersionGuion, v.DuracionSeg'
};
const claveDe = (grupo: Grupo, fila: Fila) => grupo === 'none' ? 'all' : grupo === 'mes' ? String(fila.mes) : grupo === 'canal' ? String(fila.canal) : grupo === 'campana' ? String(fila.campanaId) : String(fila.videoId);

/** Condiciones y parámetros comunes (siempre parametrizados). */
function condiciones(f: Filtros, opciones: { video: boolean; campana?: boolean }) {
  const params: Parametros = { from: f.from, to: f.to };
  const where = ['t.idFecha >= :from', 't.idFecha <= :to'];
  if (f.canal) { where.push('ca.Codigo = :canal'); params.canal = f.canal; }
  if (f.campana && opciones.campana !== false) { where.push('cp.IdCampana = :campana'); params.campana = f.campana; }
  if (f.video && opciones.video) { where.push('v.IdVideo = :video'); params.video = f.video; }
  return { where: where.join(' AND '), params };
}

type Sumas = {
  visitas: number; visitasCampana: number; repTotales: number; repFinal: number; repMitad: number; elegMitad: number; elegMitadForm: number;
  registros: number; leadsNuevos: number; leadsPagados: number; costo: number;
};
const sumasVacias = (): Sumas => ({ visitas: 0, visitasCampana: 0, repTotales: 0, repFinal: 0, repMitad: 0, elegMitad: 0, elegMitadForm: 0, registros: 0, leadsNuevos: 0, leadsPagados: 0, costo: 0 });

/**
 * Hecho de visitas (hecho.ComportamientoVisita), agrupado. El costo (B-1.2) vive en OTRO hecho (hecho.CostoCampana)
 * y se consulta aparte: nunca se hace JOIN entre ambos hechos, para no duplicar filas.
 */
async function sumasVisitas(grupo: Grupo, f: Filtros) {
  const { where, params } = condiciones(f, { video: true });
  const columnas = COLUMNAS_GRUPO[grupo];
  const sql = `SELECT ${columnas ? columnas + ',' : ''}
      SUM(CAST(h.Visitas AS bigint)) AS visitas,
      SUM(CAST(CASE WHEN h.KeyCampana <> 0 THEN h.Visitas ELSE 0 END AS bigint)) AS visitasCampana,
      SUM(CAST(h.ReproduccionesTotales AS bigint)) AS repTotales,
      SUM(CAST(h.ReproduccionesAlFinal AS bigint)) AS repFinal,
      SUM(CAST(h.ReproduccionesMitad AS bigint)) AS repMitad,
      SUM(CAST(h.ReproduccionesElegiblesMitad AS bigint)) AS elegMitad,
      SUM(CAST(h.ReproduccionesElegiblesMitadFormulario AS bigint)) AS elegMitadForm,
      SUM(CAST(h.RegistrosFormulario AS bigint)) AS registros,
      SUM(CAST(h.LeadsNuevos AS bigint)) AS leadsNuevos,
      SUM(CAST(CASE WHEN cp.TipoCampana = N'${PAGADA}' THEN h.LeadsNuevos ELSE 0 END AS bigint)) AS leadsPagados
    FROM hecho.ComportamientoVisita AS h
    JOIN dim.Tiempo AS t ON t.KeyTiempo = h.KeyTiempo
    JOIN dim.Canal AS ca ON ca.KeyCanal = h.KeyCanal
    JOIN dim.Campana AS cp ON cp.KeyCampana = h.KeyCampana
    JOIN dim.Video AS v ON v.KeyVideo = h.KeyVideo
    WHERE ${where}
    ${GRUPO_POR[grupo] ? 'GROUP BY ' + GRUPO_POR[grupo] : ''}`;
  return queryExternal<Fila>(datamart(), sql, params);
}

/**
 * B-1.2 con la fórmula literal: SUM(hecho.CostoCampana.CostoCampana) con fecha dentro del periodo / SUM(LeadsNuevos) de campañas PAGADAS dentro
 * del mismo periodo. Son dos agregaciones separadas (nunca un JOIN entre los dos hechos). Sin filas de costo el numerador es 0 (no null).
 * El filtro de video no aplica al costo (no se reparte por video). Devuelve el costo por clave de grupo.
 */
async function costosPeriodo(grupo: Grupo, f: Filtros) {
  const mapa = new Map<string, number>();
  if (grupo === 'video') return mapa;
  const { where, params } = condiciones(f, { video: false });
  const columnas = grupo === 'none' ? '' : grupo === 'mes' ? 't.AnioMes AS mes,' : grupo === 'canal' ? 'ca.Codigo AS canal,' : 'cp.IdCampana AS campanaId,';
  const agrupar = grupo === 'none' ? '' : grupo === 'mes' ? 'GROUP BY t.AnioMes' : grupo === 'canal' ? 'GROUP BY ca.Codigo' : 'GROUP BY cp.IdCampana';
  const filas = await queryExternal<Fila>(datamart(), `SELECT ${columnas} SUM(cc.CostoCampana) AS costo
    FROM hecho.CostoCampana AS cc
    JOIN dim.Tiempo AS t ON t.KeyTiempo = cc.KeyTiempo
    JOIN dim.Canal AS ca ON ca.KeyCanal = cc.KeyCanal
    JOIN dim.Campana AS cp ON cp.KeyCampana = cc.KeyCampana
    WHERE ${where} AND cp.TipoCampana = N'${PAGADA}' ${agrupar}`, params);
  for (const fila of filas) mapa.set(grupo === 'none' ? 'all' : claveDe(grupo, fila), num(fila.costo));
  return mapa;
}

/** Agrega por grupo combinando los dos hechos en memoria (por clave de grupo). */
async function agregar(grupo: Grupo, f: Filtros) {
  const filas = await sumasVisitas(grupo, f);
  const costos = await costosPeriodo(grupo, f);
  const mapa = new Map<string, { fila: Fila; sumas: Sumas }>();
  const sumasDe = (fila: Fila, clave: string): Sumas => ({
    visitas: num(fila.visitas), visitasCampana: num(fila.visitasCampana), repTotales: num(fila.repTotales), repFinal: num(fila.repFinal), repMitad: num(fila.repMitad),
    elegMitad: num(fila.elegMitad), elegMitadForm: num(fila.elegMitadForm), registros: num(fila.registros), leadsNuevos: num(fila.leadsNuevos),
    leadsPagados: num(fila.leadsPagados), costo: costos.get(clave) ?? 0
  });
  for (const fila of filas) { const clave = claveDe(grupo, fila); mapa.set(clave, { fila, sumas: sumasDe(fila, clave) }); }
  // Claves que solo existen en el costo (p. ej. un mes sin visitas): se agregan con visitas en cero.
  for (const [clave, costo] of costos) {
    if (mapa.has(clave)) continue;
    const fila: Fila = grupo === 'mes' ? { mes: clave } : grupo === 'canal' ? { canal: clave, canalNombre: clave } : {};
    mapa.set(clave, { fila, sumas: { ...sumasVacias(), costo } });
  }
  return mapa;
}

export type KpiResultado = { code: KpiCode; name: string; activity: Actividad; value: number | null; unit: '%' | 'S/'; status: Estado; numerator: number | null; denominator: number; thresholds: Umbral };

function partes(code: KpiCode, s: Sumas): [number, number] {
  switch (code) {
    case 'B-1.1': return [s.visitasCampana, s.visitas];
    case 'B-1.2': return [s.costo, s.leadsPagados];
    case 'B-2.1': return [s.repFinal, s.repTotales];
    case 'B-2.2': return [s.repMitad, s.repTotales];
    case 'B-2.3': return [s.elegMitadForm, s.elegMitad];
    case 'B-3.1': return [s.registros, s.visitas];
  }
}
/** Construye un KPI desde numerador y denominador (denominador 0 → valor null y SIN_DATOS). */
export function construirKpi(def: KpiDef, numerador: number, denominador: number, reglas: ReglasVigentes = REGLAS_FABRICA): KpiResultado {
  const valor = denominador > 0 ? redondear(def.unit === '%' ? (numerador / denominador) * 100 : numerador / denominador) : null;
  return { code: def.code, name: def.name, activity: def.activity, value: valor, unit: def.unit, status: semaforo(def.code, valor, reglas), numerator: denominador > 0 ? redondear(numerador) : null, denominator: denominador, thresholds: reglas.semaforos[def.code] };
}
const kpisDe = (s: Sumas, reglas: ReglasVigentes) => KPI_DEFS.map(def => construirKpi(def, ...partes(def.code, s), reglas));
const valoresDe = (s: Sumas) => Object.fromEntries(KPI_DEFS.map(def => [def.code, construirKpi(def, ...partes(def.code, s)).value])) as Record<KpiCode, number | null>;

// ---------------------------------------------------------------------------
// API del DataMart
// ---------------------------------------------------------------------------

/** Último mes con datos: del primer día de ese mes a la última fecha con hechos. */
export const periodoPorDefecto = () => conCache('periodo-defecto', periodoPorDefectoSinCache, { firma: firmaCarga });
async function periodoPorDefectoSinCache() {
  const [fila] = await queryExternal<Fila>(datamart(), `SELECT TOP 1 t.idFecha AS ultima FROM dim.Tiempo AS t WHERE EXISTS (SELECT 1 FROM hecho.ComportamientoVisita AS h WHERE h.KeyTiempo = t.KeyTiempo) ORDER BY t.idFecha DESC`);
  if (!fila?.ultima) return null;
  const ultima = dia(fila.ultima);
  return { from: inicioMes(ultima), to: ultima };
}

export const ultimaCarga = () => conCache('ultima-carga', ultimaCargaSinCache, { ttlMs: 60_000 });
async function ultimaCargaSinCache() {
  const [fila] = await queryExternal<Fila>(datamart(), `SELECT (SELECT TOP 1 t.idFecha FROM dim.Tiempo AS t WHERE EXISTS (SELECT 1 FROM hecho.ComportamientoVisita AS h WHERE h.KeyTiempo = t.KeyTiempo) ORDER BY t.idFecha DESC) AS fechaDatos, (SELECT MAX(FechaHora) FROM etl.CargaLog) AS cargadoEn`);
  return { fechaDatos: fila?.fechaDatos ? dia(fila.fechaDatos) : null, cargadoEn: iso(fila?.cargadoEn) };
}

/** KPI globales del periodo y filtros (numerador/denominador incluidos). */
export async function kpisPeriodo(f: Filtros, reglas?: ReglasVigentes) {
  const vigentes = reglas ?? await reglasVigentes();
  const mapa = await agregar('none', f);
  return kpisDe(mapa.get('all')?.sumas || sumasVacias(), vigentes);
}

export async function listasFiltros() {
  const [canales, campanas, videos] = await Promise.all([
    queryExternal<Fila>(datamart(), 'SELECT Codigo, Nombre FROM dim.Canal ORDER BY Nombre'),
    queryExternal<Fila>(datamart(), 'SELECT IdCampana, NombreCampana, TipoCampana FROM dim.Campana WHERE IdCampana <> 0 ORDER BY IdCampana DESC'),
    queryExternal<Fila>(datamart(), 'SELECT IdVideo, NombreVideo, VersionGuion, DuracionSeg FROM dim.Video WHERE IdVideo <> 0 ORDER BY IdVideo')
  ]);
  return {
    canales: canales.map(c => ({ codigo: String(c.Codigo), nombre: String(c.Nombre) })),
    campanas: campanas.map(c => ({ id: num(c.IdCampana), nombre: String(c.NombreCampana), tipo: String(c.TipoCampana) })),
    videos: videos.map(v => ({ id: num(v.IdVideo), nombre: String(v.NombreVideo), version: String(v.VersionGuion), duracionSeg: v.DuracionSeg == null ? null : num(v.DuracionSeg) }))
  };
}

/**
 * Respuesta completa de `GET buyer/kpis`. La caché guarda SUMAS (numeradores y denominadores) y no estados: `status` y `thresholds` se calculan en cada
 * respuesta con las reglas vigentes, así que cambiar o restaurar un semáforo se refleja al instante sin volver a consultar el DataMart.
 */
export async function buyerKpis(entrada: { from?: string; to?: string; canal?: string; campana?: number; video?: number }, reglas?: ReglasVigentes) {
  const vigentes = reglas ?? await reglasVigentes();
  const { sumasGlobales, ...resto } = await conCache(`kpis-v4|${JSON.stringify([entrada.from || '', entrada.to || '', entrada.canal || '', entrada.campana || 0, entrada.video || 0])}`, () => buyerKpisSinCache(entrada), { firma: firmaCarga });
  return { ...resto, kpis: sumasGlobales ? kpisDe(sumasGlobales, vigentes) : [] };
}
async function buyerKpisSinCache(entrada: { from?: string; to?: string; canal?: string; campana?: number; video?: number }) {
  const defecto = await periodoPorDefecto();
  const from = entrada.from || defecto?.from, to = entrada.to || defecto?.to;
  const lastLoad = await ultimaCarga();
  const filters = await listasFiltros();
  if (!from || !to) return { period: { from: null, to: null }, lastLoad, filters, sumasGlobales: null as Sumas | null, trend: [], byCanal: [], byCampana: [], byVideo: [] };
  const f: Filtros = { from, to, canal: entrada.canal, campana: entrada.campana, video: entrada.video };
  const tendenciaDesde = inicioMes(to, -11);
  // En serie: la instancia tiene poca memoria para concesiones de consulta y varias agregaciones a la vez se bloquean entre sí.
  const global = await agregar('none', f);
  const tendencia = await agregar('mes', { ...f, from: tendenciaDesde });
  const porCanal = await agregar('canal', f);
  const porCampana = await agregar('campana', f);
  const porVideo = await agregar('video', f);
  const campanas = [...porCampana.values()].filter(({ fila, sumas }) => num(fila.campanaId) !== 0 && sumas.visitas > 0).sort((a, b) => b.sumas.visitas - a.sumas.visitas);
  return {
    period: { from, to },
    lastLoad,
    filters,
    applied: { canal: f.canal || null, campana: f.campana || null, video: f.video || null },
    sumasGlobales: (global.get('all')?.sumas || sumasVacias()) as Sumas | null,
    trend: [...tendencia.values()].sort((a, b) => String(a.fila.mes).localeCompare(String(b.fila.mes))).map(({ fila, sumas }) => ({ mes: String(fila.mes), ...valoresDe(sumas) })),
    byCanal: [...porCanal.values()].sort((a, b) => b.sumas.visitas - a.sumas.visitas).map(({ fila, sumas }) => ({ canal: String(fila.canal), canalNombre: String(fila.canalNombre ?? fila.canal), visitas: sumas.visitas, ...valoresDe(sumas) })),
    // Todo del periodo y filtros: costo = suma de hecho.CostoCampana con fecha en el periodo; costoPorLead = costo / leadsNuevos (solo campañas pagadas).
    byCampana: campanas.map(({ fila, sumas }) => ({
      campanaId: num(fila.campanaId), campana: String(fila.campana), tipo: String(fila.tipo), visitas: sumas.visitas, leadsNuevos: sumas.leadsNuevos,
      costo: redondear(sumas.costo), costoPorLead: String(fila.tipo) === PAGADA && sumas.leadsNuevos > 0 ? redondear(sumas.costo / sumas.leadsNuevos) : null
    })),
    byVideo: [...porVideo.values()].filter(({ fila }) => num(fila.videoId) !== 0).sort((a, b) => num(a.fila.videoId) - num(b.fila.videoId)).map(({ fila, sumas }) => {
      const v = valoresDe(sumas);
      return { videoId: num(fila.videoId), video: String(fila.video), version: String(fila.version), duracionSeg: fila.duracionSeg == null ? null : num(fila.duracionSeg), reproducciones: sumas.repTotales, 'B-2.1': v['B-2.1'], 'B-2.2': v['B-2.2'], 'B-2.3': v['B-2.3'] };
    })
  };
}

// ---------------------------------------------------------------------------
// OLTP: tiempo real y curva de abandono
// ---------------------------------------------------------------------------

const LIMA_UTC = 5; // hora de Lima = UTC − 5 (sin horario de verano)
const sqlFecha = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

/** Límites UTC del día de Lima de `ahora`. */
export function diaLima(ahora = new Date()) {
  const lima = new Date(ahora.getTime() - LIMA_UTC * 3600_000);
  const fecha = lima.toISOString().slice(0, 10);
  const inicio = new Date(Date.parse(`${fecha}T00:00:00Z`) + LIMA_UTC * 3600_000);
  return { fecha, inicioUtc: inicio, finUtc: new Date(inicio.getTime() + 86400_000) };
}

/** Actividad de hoy (hora de Lima) en el OLTP, con consultas acotadas por fecha. */
export function actividadHoy(ahora = new Date()) {
  // Se comparte entre pestañas: una consulta cada 10 s como máximo.
  return conCache(`hoy|${diaLima(ahora).fecha}`, () => actividadHoySinCache(ahora), { ttlMs: 10_000 });
}
async function actividadHoySinCache(ahora = new Date()) {
  const { fecha, inicioUtc, finUtc } = diaLima(ahora);
  const params = { ini: sqlFecha(inicioUtc), fin: sqlFecha(finUtc) };
  const db = oltp();
  const visitas = await queryExternal<Fila>(db, `SELECT COUNT(*) AS visitas, SUM(CASE WHEN IdCampana IS NOT NULL THEN 1 ELSE 0 END) AS conCampana
      FROM mkt.VisitaLanding WHERE FechaHoraInicio >= CAST(:ini AS datetime2(0)) AND FechaHoraInicio < CAST(:fin AS datetime2(0))`, params);
  const reproducciones = await queryExternal<Fila>(db, `SELECT COUNT(*) AS n FROM mkt.ReproduccionVideo WHERE FechaHoraInicio >= CAST(:ini AS datetime2(0)) AND FechaHoraInicio < CAST(:fin AS datetime2(0))`, params);
  const formularios = await queryExternal<Fila>(db, `SELECT e.Codigo AS estado, COUNT(*) AS n FROM mkt.FormularioContacto AS f JOIN cat.EstadoFormulario AS e ON e.IdEstadoFormulario = f.IdEstadoFormulario
      WHERE f.FechaHoraEnvio >= CAST(:ini AS datetime2(0)) AND f.FechaHoraEnvio < CAST(:fin AS datetime2(0)) GROUP BY e.Codigo`, params);
  const ultima = await queryExternal<Fila>(db, `SELECT (SELECT TOP 1 FechaHoraInicio FROM mkt.VisitaLanding ORDER BY IdVisita DESC) AS visita, (SELECT TOP 1 FechaHoraEnvio FROM mkt.FormularioContacto ORDER BY IdFormulario DESC) AS formulario`);
  const porEstado = Object.fromEntries(formularios.map(fila => [String(fila.estado), num(fila.n)]));
  const forms = { VALIDO: porEstado.VALIDO || 0, DUPLICADO: porEstado.DUPLICADO || 0, INVALIDO: porEstado.INVALIDO || 0, REVISION: porEstado.REVISION || 0 };
  const nVisitas = num(visitas[0]?.visitas);
  const fechas = [ultima[0]?.visita, ultima[0]?.formulario].filter(Boolean).map(valor => new Date(valor as Date).getTime());
  return {
    fechaLima: fecha,
    today: {
      visitas: nVisitas, visitasConCampana: num(visitas[0]?.conCampana), reproducciones: num(reproducciones[0]?.n), formularios: forms,
      // Misma definición de registro que B-3.1: formularios VALIDO o DUPLICADO sobre visitas (en %).
      conversion: nVisitas > 0 ? redondear(((forms.VALIDO + forms.DUPLICADO) / nVisitas) * 100) : null
    },
    lastActivityAt: fechas.length ? new Date(Math.max(...fechas)).toISOString() : null
  };
}

export type PuntoCurva = { pct: number; alcanzan: number; conversion: number | null; enTramo: number; convertidas: number };

/** Curva de abandono a partir de los conteos por tramo (función pura, probada). */
export function construirCurva(porTramo: Map<number, { n: number; conv: number }>) {
  const curva: PuntoCurva[] = [];
  for (let pct = 0; pct <= 100; pct += 10) {
    let alcanzan = 0;
    for (const [tramo, datos] of porTramo) if (tramo >= pct) alcanzan += datos.n;
    const propio = porTramo.get(pct) || { n: 0, conv: 0 };
    curva.push({ pct, alcanzan, conversion: propio.n > 0 ? redondear((propio.conv / propio.n) * 100) : null, enTramo: propio.n, convertidas: propio.conv });
  }
  const total = curva[0].alcanzan;
  let mayor: { desdePct: number; hastaPct: number; perdida: number; perdidaPct: number } | null = null;
  for (let i = 0; i < curva.length - 1; i++) {
    const perdida = curva[i].alcanzan - curva[i + 1].alcanzan;
    if (total > 0 && (!mayor || perdida > mayor.perdida)) mayor = { desdePct: curva[i].pct, hastaPct: curva[i + 1].pct, perdida, perdidaPct: redondear((perdida / total) * 100) };
  }
  return { total, curve: curva, mayorCaida: mayor };
}

/**
 * Curva de abandono de un video en un periodo (por día de la visita, hora de Lima).
 * Máximo `SegundoAlcanzado` por reproducción en tramos de 10 % de la duración; conversión por tramo = reproducciones del tramo
 * con formulario VALIDO en la misma visita y el mismo día de Lima / reproducciones del tramo.
 */
export function curvaAbandono(video: number, from: string, to: string) {
  return conCache(`curva|${video}|${from}|${to}`, () => curvaAbandonoSinCache(video, from, to), { firma: firmaCarga });
}
async function curvaAbandonoSinCache(video: number, from: string, to: string) {
  const db = oltp();
  const [v] = await queryExternal<Fila>(db, 'SELECT IdVideo, Nombre, VersionGuion, DuracionSeg FROM mkt.Video WHERE IdVideo = :video', { video });
  if (!v) return null;
  const duracion = num(v.DuracionSeg);
  const ini = new Date(Date.parse(`${from}T00:00:00Z`) + LIMA_UTC * 3600_000);
  const fin = new Date(Date.parse(`${to}T00:00:00Z`) + 86400_000 + LIMA_UTC * 3600_000);
  const filas = await queryExternal<Fila>(db, `WITH r AS (
      SELECT rv.IdReproduccion, rv.IdVisita, CAST(DATEADD(HOUR, -${LIMA_UTC}, vi.FechaHoraInicio) AS date) AS diaLima,
             ISNULL((SELECT MAX(p.SegundoAlcanzado) FROM mkt.ReproduccionVideoPunto AS p WHERE p.IdReproduccion = rv.IdReproduccion), 0) AS mx
      FROM mkt.ReproduccionVideo AS rv
      JOIN mkt.VisitaLanding AS vi ON vi.IdVisita = rv.IdVisita
      WHERE rv.IdVideo = :video AND vi.FechaHoraInicio >= CAST(:ini AS datetime2(0)) AND vi.FechaHoraInicio < CAST(:fin AS datetime2(0))
    ), t AS (
      SELECT CASE WHEN r.mx >= :dur THEN 100 ELSE (r.mx * 10 / :dur) * 10 END AS pct,
             CASE WHEN EXISTS (SELECT 1 FROM mkt.FormularioContacto AS f WHERE f.IdVisita = r.IdVisita AND f.IdEstadoFormulario = 1
                               AND CAST(DATEADD(HOUR, -${LIMA_UTC}, f.FechaHoraEnvio) AS date) = r.diaLima) THEN 1 ELSE 0 END AS conv
      FROM r
    )
    SELECT pct, COUNT(*) AS n, SUM(conv) AS conv FROM t GROUP BY pct`, { video, dur: duracion, ini: sqlFecha(ini), fin: sqlFecha(fin) });
  const porTramo = new Map<number, { n: number; conv: number }>(filas.map(fila => [num(fila.pct), { n: num(fila.n), conv: num(fila.conv) }]));
  return { videoId: video, video: String(v.Nombre), version: String(v.VersionGuion), duracionSeg: duracion, period: { from, to }, ...construirCurva(porTramo) };
}
