import { Op } from 'sequelize';
import { z } from 'zod';
import { plain, plainMany, tables } from './db';
import { event } from './contacts';
import { buyerKpis, kpisPeriodo, periodoPorDefecto, type KpiResultado } from './buyer-kpis';
import { ACTIVIDADES, contarPropuestasPorRun, requestRun } from './buyer-agent';
import {
  KPI_DEFS, MODOS, REGLAS_FABRICA, ReglaError, estadoReglas, reglasVigentes, semaforo,
  type ActividadBuyer, type Estado, type KpiCode, type Modo, type ParamsAlerta, type ReglasVigentes
} from './buyer-rules';
import { sqlServerDisponible } from './external';

/**
 * Modo del agente (automático o manual), programación semanal, reglas ALERTA, avisos y estado visible (docs/agente-buyer-lead-reglas.md §2).
 * - MANUAL: el agente solo corre cuando una persona pulsa el botón; las ALERTA siguen generando avisos pero no lanzan ejecuciones.
 * - AUTOMATICO: además el worker lanza la ejecución semanal y las ALERTA con acción EJECUTAR_*, respetando el enfriamiento.
 * Las propuestas siempre nacen como borrador (APR_HUMANA).
 */

// ---------------------------------------------------------------------------
// Hora de Lima y programación (funciones puras)
// ---------------------------------------------------------------------------

const LIMA_UTC = 5; // Lima = UTC − 5, sin horario de verano
export const DIAS_SEMANA = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const;

/** Fecha (AAAA-MM-DD), día de la semana (1 = lunes … 7 = domingo) y hora (0–23) en Lima. */
export function partesLima(ahora: Date) {
  const lima = new Date(ahora.getTime() - LIMA_UTC * 3600_000);
  return { fecha: lima.toISOString().slice(0, 10), diaSemana: lima.getUTCDay() || 7, hora: lima.getUTCHours() };
}

/** Instante UTC de hoy (día de Lima de `ahora`) a la `hora` de Lima. */
function hoyALaHora(ahora: Date, hora: number) {
  const lima = new Date(ahora.getTime() - LIMA_UTC * 3600_000);
  return Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate(), hora, 0, 0) + LIMA_UTC * 3600_000;
}

/** Próxima ocurrencia (estrictamente posterior a `ahora`) de «día de la semana a tal hora de Lima». */
export function proximaEjecucionSemanal(ahora: Date, cfg: { diaSemana: number; hora: number }): Date {
  const hoy = partesLima(ahora).diaSemana;
  const delta = (cfg.diaSemana - hoy + 7) % 7;
  let instante = hoyALaHora(ahora, cfg.hora) + delta * 86400_000;
  if (instante <= ahora.getTime()) instante += 7 * 86400_000;
  return new Date(instante);
}

/**
 * ¿Toca lanzar hoy la ejecución semanal? Es el día y la hora (o más tarde ese mismo día: tolera un worker caído a la hora exacta).
 * Si el modo automático se activó DESPUÉS de la hora programada de hoy, no se lanza de inmediato: espera a la próxima semana.
 */
export function semanalVence(ahora: Date, cfg: { diaSemana: number; hora: number }, automaticoDesde?: Date | null): boolean {
  const p = partesLima(ahora);
  if (p.diaSemana !== cfg.diaSemana || p.hora < cfg.hora) return false;
  return !automaticoDesde || automaticoDesde.getTime() <= hoyALaHora(ahora, cfg.hora);
}

/** Próxima ejecución automática de una actividad y el motivo que se muestra en la interfaz. */
export function proximaEjecucionAutomatica(entrada: {
  ahora: Date; modo: Modo; semanal: { activo: boolean; diaSemana: number; hora: number }; automaticoDesde?: Date | null; yaLanzadaHoy?: boolean; alertasEjecutables?: number;
}): { at: Date | null; reason: string } {
  const { ahora, modo, semanal } = entrada;
  if (modo === 'MANUAL') return { at: null, reason: 'Modo manual: el agente solo se ejecuta cuando alguien pulsa «Ejecutar ahora»' };
  const alertas = entrada.alertasEjecutables ? ` o antes si se cumple una de las ${entrada.alertasEjecutables} alertas con ejecución` : '';
  if (!semanal.activo) return { at: null, reason: `Automático sin programación semanal activa${entrada.alertasEjecutables ? `: solo se lanza cuando se cumple una de las ${entrada.alertasEjecutables} alertas con ejecución` : ''}` };
  const cuando = `${DIAS_SEMANA[semanal.diaSemana]} ${String(semanal.hora).padStart(2, '0')}:00 (hora de Lima)`;
  if (semanalVence(ahora, semanal, entrada.automaticoDesde) && !entrada.yaLanzadaHoy) return { at: ahora, reason: `Semanal (${cuando}): se lanza en el próximo ciclo del worker${alertas}` };
  return { at: proximaEjecucionSemanal(ahora, semanal), reason: `Semanal: ${cuando}${alertas}` };
}

// ---------------------------------------------------------------------------
// Reglas ALERTA (funciones puras)
// ---------------------------------------------------------------------------

export type Lectura = { code: KpiCode; name: string; unit: '%' | 'S/'; value: number | null; status: Estado };

/** Lecturas de los KPI globales del periodo. */
export const lecturasDeKpis = (kpis: Array<Pick<KpiResultado, 'code' | 'name' | 'unit' | 'value' | 'status'>>): Lectura[] => kpis.map(k => ({ code: k.code, name: k.name, unit: k.unit, value: k.value, status: k.status }));
/** Lecturas de un canal (la fila `byCanal` trae el valor de cada KPI; el estado sale del semáforo vigente). */
export const lecturasDeCanal = (fila: Record<string, any>, reglas: ReglasVigentes = REGLAS_FABRICA): Lectura[] => KPI_DEFS.map(def => {
  const value = fila[def.code] == null ? null : Number(fila[def.code]);
  return { code: def.code, name: def.name, unit: def.unit, value, status: semaforo(def.code, value, reglas) };
});

const COMPARA: Record<NonNullable<ParamsAlerta['operador']>, (a: number, b: number) => boolean> = { '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b };
const actividadDe = (code: KpiCode) => KPI_DEFS.find(def => def.code === code)?.activity;

/** ¿Se cumple la condición de la alerta? Con una actividad (B1/B2) basta que algún KPI de ella la cumpla; devuelve el primero. `estado: AMARILLO` incluye el rojo. */
export function evaluarAlerta(params: ParamsAlerta, lecturas: Lectura[]): { cumple: boolean; lectura: Lectura | null } {
  const candidatas = lecturas.filter(l => params.kpi === l.code || params.kpi === actividadDe(l.code));
  const cumple = (l: Lectura) => params.estado
    ? (params.estado === 'ROJO' ? l.status === 'ROJO' : l.status === 'ROJO' || l.status === 'AMARILLO')
    : l.value != null && params.operador !== undefined && params.valor !== undefined && COMPARA[params.operador](l.value, params.valor);
  const lectura = candidatas.find(cumple) ?? null;
  return { cumple: !!lectura, lectura };
}

const num = (valor: number | null, unit: '%' | 'S/') => (valor == null ? 'sin datos' : unit === '%' ? `${String(valor).replace('.', ',')} %` : `S/ ${String(valor).replace('.', ',')}`);
export function mensajeAlerta(nombreRegla: string, params: ParamsAlerta, lectura: Lectura, periodo: { from: string; to: string }): string {
  const donde = `${params.canal ? ` en ${params.canal}` : ''} (${periodo.from} a ${periodo.to})`;
  const que = params.estado
    ? `${lectura.code} ${lectura.name} está en ${lectura.status} con ${num(lectura.value, lectura.unit)}${donde}`
    : `${lectura.code} ${lectura.name} vale ${num(lectura.value, lectura.unit)}${donde}, y la condición era ${params.operador} ${num(params.valor ?? null, lectura.unit)}`;
  return `${que}. Regla: «${nombreRegla}».`.slice(0, 490);
}

/** Qué hace una alerta cumplida según el modo y el enfriamiento: AVISAR nunca ejecuta; EJECUTAR_* ejecuta solo en AUTOMATICO y fuera del enfriamiento. */
export function decidirEjecucionPorAlerta(entrada: { accion: ParamsAlerta['accion']; modos: Record<ActividadBuyer, Modo>; enfriamientoLibre: boolean }): { lanzar: ActividadBuyer | null; motivo: 'SOLO_AVISO' | 'MODO_MANUAL' | 'ENFRIAMIENTO' | 'LANZAR' } {
  if (entrada.accion === 'AVISAR') return { lanzar: null, motivo: 'SOLO_AVISO' };
  const actividad: ActividadBuyer = entrada.accion === 'EJECUTAR_B1' ? 'B1' : 'B2';
  if (entrada.modos[actividad] !== 'AUTOMATICO') return { lanzar: null, motivo: 'MODO_MANUAL' };
  if (!entrada.enfriamientoLibre) return { lanzar: null, motivo: 'ENFRIAMIENTO' };
  return { lanzar: actividad, motivo: 'LANZAR' };
}

// ---------------------------------------------------------------------------
// Ajustes: modo del agente y latido del worker
// ---------------------------------------------------------------------------

type Ajuste = { B1: Modo; B2: Modo; desde: { B1?: string; B2?: string } };
const AJUSTE_DEFECTO = (): Ajuste => ({ B1: 'MANUAL', B2: 'MANUAL', desde: {} });

async function leerSetting(key: string): Promise<{ value: any; updatedAt: Date | null } | null> {
  const fila = plain<any>(await tables().amp_settings.findOne({ where: { key } }));
  if (!fila) return null;
  try { return { value: JSON.parse(String(fila.value)), updatedAt: fila.updatedAt ?? null }; } catch { return { value: null, updatedAt: fila.updatedAt ?? null }; }
}
async function guardarSetting(key: string, valor: unknown) {
  const T = tables().amp_settings;
  const value = JSON.stringify(valor);
  const [cambiadas] = await T.update({ value, updatedAt: new Date() }, { where: { key } });
  if (!cambiadas) { try { await T.create({ key, value, updatedAt: new Date() }); } catch { await T.update({ value, updatedAt: new Date() }, { where: { key } }); } }
}

async function leerAjuste(): Promise<Ajuste> {
  const s = await leerSetting('buyer_agent');
  const base = AJUSTE_DEFECTO();
  if (!s?.value || typeof s.value !== 'object') return base;
  for (const a of ACTIVIDADES) {
    if ((MODOS as readonly string[]).includes(s.value[a])) base[a] = s.value[a];
    if (typeof s.value.desde?.[a] === 'string') base.desde[a] = s.value.desde[a];
  }
  return base;
}
export async function leerModo(): Promise<Record<ActividadBuyer, Modo>> { const a = await leerAjuste(); return { B1: a.B1, B2: a.B2 }; }

export const cambiarModoSchema = z.object({ activity: z.enum(ACTIVIDADES), mode: z.enum(MODOS) });

/** Cambia el modo de una actividad (el permiso lo comprueba la ruta). Deja `amp_events` `BUYER_AGENT_MODE`. */
export async function cambiarModo(activity: ActividadBuyer, mode: Modo, usuarioId: string) {
  const ajuste = await leerAjuste();
  const previo = ajuste[activity];
  if (previo !== mode) {
    ajuste[activity] = mode;
    if (mode === 'AUTOMATICO') ajuste.desde[activity] = new Date().toISOString(); else delete ajuste.desde[activity];
    await guardarSetting('buyer_agent', ajuste);
    await event(null, 'BUYER_AGENT_MODE', `Modo del agente ${activity}: ${previo} → ${mode}.`, 'OPERATOR', usuarioId, { activity, previous: previo, mode });
    reiniciarRevision();
    invalidarEstadoAgente();
  }
  return { B1: ajuste.B1, B2: ajuste.B2 };
}

/** Sin latido en este tiempo el agente figura como detenido. */
export const LATIDO_VIVO_MS = 45_000;
export const LATIDO_INTERVALO_MS = 10_000;
const inicioProceso = new Date().toISOString();
/** El worker escribe `amp_settings.worker_heartbeat` (una fila pequeña, sin ordenar ni leer tablas grandes). */
export async function escribirLatido() { await guardarSetting('worker_heartbeat', { at: new Date().toISOString(), pid: process.pid, startedAt: inicioProceso }); }
export const latidoVivo = (ultimo: string | null, ahora = new Date()) => !!ultimo && ahora.getTime() - new Date(ultimo).getTime() <= LATIDO_VIVO_MS;
export async function leerLatido(ahora = new Date()) {
  const s = await leerSetting('worker_heartbeat');
  const lastBeatAt: string | null = typeof s?.value?.at === 'string' ? s.value.at : null;
  return { alive: latidoVivo(lastBeatAt, ahora), lastBeatAt };
}

// ---------------------------------------------------------------------------
// Programación: ejecución semanal y revisión de alertas
// ---------------------------------------------------------------------------

let ultimaRevision = '';
/** Fuerza una nueva evaluación de alertas en el próximo ciclo (se usa al cambiar el modo). */
export function reiniciarRevision() { ultimaRevision = ''; }

async function enfriamientoLibre(actividad: ActividadBuyer, dias: number, ahora: Date) {
  if (dias <= 0) return true;
  const recientes = await tables().amp_buyer_runs.count({ where: { activity: actividad, status: { [Op.ne]: 'FAILED' }, createdAt: { [Op.gte]: new Date(ahora.getTime() - dias * 86400_000) } } });
  return recientes === 0;
}

export function avisoAPlano(fila: any, nombres?: Map<number, string>) {
  return {
    id: Number(fila.id), ruleId: Number(fila.ruleId), ruleName: nombres?.get(Number(fila.ruleId)) ?? null, kpi: fila.kpi ?? null, value: fila.value == null ? null : Number(fila.value),
    status: fila.status ?? null, message: fila.message, action: fila.action ?? null, runId: fila.runId == null ? null : Number(fila.runId),
    createdAt: fila.createdAt instanceof Date ? fila.createdAt.toISOString() : fila.createdAt, acknowledgedBy: fila.acknowledgedBy ?? null,
    acknowledgedAt: fila.acknowledgedAt instanceof Date ? fila.acknowledgedAt.toISOString() : fila.acknowledgedAt ?? null
  };
}

/**
 * Evalúa las reglas ALERTA sobre el periodo por defecto: como mucho una vez por hora (y de nuevo si cambian las reglas o el modo).
 * Crea un aviso por regla y día; si la acción es EJECUTAR_* y el modo es AUTOMATICO, lanza la ejecución respetando el enfriamiento.
 */
async function revisarAlertas(ahora: Date, reglas: ReglasVigentes, ajuste: Ajuste): Promise<number> {
  if (!reglas.alertas.length) return 0;
  const { fecha, hora } = partesLima(ahora);
  const marca = `${fecha}-${hora}|${reglas.version}|${ajuste.B1}${ajuste.B2}`;
  if (ultimaRevision === marca) return 0;
  const periodo = await periodoPorDefecto();
  if (!periodo) { ultimaRevision = marca; return 0; }
  // Una sola lectura del DataMart (en serie y en caché): sin canal basta el KPI global; con canal se usa el desglose.
  let globales: Lectura[]; const porCanal = new Map<string, Lectura[]>();
  if (reglas.alertas.some(a => a.params.canal)) {
    const k = await buyerKpis(periodo, reglas);
    globales = lecturasDeKpis(k.kpis);
    for (const fila of k.byCanal) porCanal.set(String(fila.canal), lecturasDeCanal(fila, reglas));
  } else globales = lecturasDeKpis(await kpisPeriodo(periodo, reglas));
  const db = tables();
  let lanzadas = 0;
  for (const alerta of reglas.alertas) {
    const resultado = evaluarAlerta(alerta.params, alerta.params.canal ? porCanal.get(alerta.params.canal) ?? [] : globales);
    if (!resultado.cumple || !resultado.lectura) continue;
    let aviso = plain<any>(await db.amp_buyer_alerts.findOne({ where: { ruleId: alerta.id, dayKey: fecha } }));
    if (!aviso) {
      const ejecutable = alerta.params.accion !== 'AVISAR';
      const objetivo: ActividadBuyer | null = alerta.params.accion === 'EJECUTAR_B1' ? 'B1' : alerta.params.accion === 'EJECUTAR_B2' ? 'B2' : null;
      const nota = !ejecutable ? '' : objetivo && ajuste[objetivo] !== 'AUTOMATICO' ? ' Modo manual: no se ejecuta solo.' : '';
      try {
        const creado = await db.amp_buyer_alerts.create({
          ruleId: alerta.id, dayKey: fecha, kpi: resultado.lectura.code, value: resultado.lectura.value, status: resultado.lectura.status,
          message: `${mensajeAlerta(alerta.name, alerta.params, resultado.lectura, periodo)}${nota}`.slice(0, 500), action: alerta.params.accion, runId: null, createdAt: ahora
        });
        aviso = plain<any>(await db.amp_buyer_alerts.findByPk(Number(creado.get('id'))));
      } catch { aviso = plain<any>(await db.amp_buyer_alerts.findOne({ where: { ruleId: alerta.id, dayKey: fecha } })); }
    }
    if (!aviso || aviso.runId != null || alerta.params.accion === 'AVISAR') continue;
    const objetivo: ActividadBuyer = alerta.params.accion === 'EJECUTAR_B1' ? 'B1' : 'B2';
    const decision = decidirEjecucionPorAlerta({ accion: alerta.params.accion, modos: ajuste, enfriamientoLibre: await enfriamientoLibre(objetivo, reglas.automatizacion.enfriamientoDias, ahora) });
    if (!decision.lanzar) continue;
    const run = await requestRun({ activity: decision.lanzar, trigger: 'KPI_ALERT', requestedBy: 'worker', dedupeKey: `buyer-alert:${decision.lanzar}:${fecha}`, instructions: `Alerta: ${alerta.name}`.slice(0, 500) });
    if (run) { await db.amp_buyer_alerts.update({ runId: run.runId }, { where: { id: aviso.id } }); lanzadas++; }
  }
  ultimaRevision = marca;
  return lanzadas;
}

/**
 * Programación del agente (la llama el worker cada minuto; nunca lanza):
 * - Semanal por actividad según las reglas AUT_SEMANAL_*, solo en modo AUTOMATICO (dedupe `buyer-weekly:<B1|B2>:<fecha Lima>`).
 * - Reglas ALERTA (avisos siempre; ejecución solo en AUTOMATICO, dedupe `buyer-alert:<B1|B2>:<fecha Lima>`).
 * Sin SQL Server (Demo) no hace nada. Devuelve cuántas ejecuciones lanzó.
 */
export async function scanBuyerSchedules(ahora = new Date()): Promise<number> {
  if (!sqlServerDisponible()) return 0;
  let creadas = 0;
  let reglas: ReglasVigentes, ajuste: Ajuste;
  try { reglas = await reglasVigentes(); ajuste = await leerAjuste(); } catch (error) { console.error('Programación Buyer: no se pudieron leer las reglas', error); return 0; }
  const { fecha } = partesLima(ahora);
  for (const actividad of ACTIVIDADES) {
    try {
      const cfg = reglas.automatizacion[actividad];
      if (ajuste[actividad] !== 'AUTOMATICO' || !cfg.activo) continue;
      const desde = ajuste.desde[actividad] ? new Date(ajuste.desde[actividad]!) : null;
      if (!semanalVence(ahora, cfg, desde)) continue;
      if (await requestRun({ activity: actividad, trigger: 'SCHEDULED', requestedBy: 'worker', dedupeKey: `buyer-weekly:${actividad}:${fecha}` })) creadas++;
    } catch (error) { console.error(`Programación semanal Buyer ${actividad}`, error); }
  }
  try { creadas += await revisarAlertas(ahora, reglas, ajuste); } catch (error) { console.error('Alertas Buyer', error); }
  return creadas;
}

// ---------------------------------------------------------------------------
// Estado del agente (GET buyer/agent) y avisos
// ---------------------------------------------------------------------------

const COLUMNAS_RUN = ['id', 'activity', 'trigger', 'status', 'periodFrom', 'periodTo', 'provider', 'model', 'error', 'requestedBy', 'createdAt', 'finishedAt', 'step', 'stepStartedAt', 'log', 'updatedAt'];
const isoOrNull = (valor: unknown) => (valor instanceof Date ? valor.toISOString() : valor == null ? null : String(valor));
const leerLog = (valor: unknown) => { try { const r = JSON.parse(String(valor ?? '[]')); return Array.isArray(r) ? r : []; } catch { return []; } };

type Memo = { en: number; valor: any | null; promesa: Promise<any> | null };
const globalAuto = globalThis as unknown as { ampBuyerAgenteMemo?: Memo };
const memoEstado: Memo = (globalAuto.ampBuyerAgenteMemo ||= { en: 0, valor: null, promesa: null });
export const TTL_ESTADO_MS = 2000;
export function invalidarEstadoAgente() { memoEstado.en = 0; memoEstado.valor = null; memoEstado.promesa = null; }

async function calcularEstado(ahora: Date) {
  const db = tables();
  const [latido, ajuste, { filas, vigentes }] = await Promise.all([leerLatido(ahora), leerAjuste(), estadoReglas()]);
  const nombres = new Map(filas.map(f => [f.id, f.name]));
  const { fecha } = partesLima(ahora);
  const activas = plainMany<any>(await db.amp_buyer_runs.findAll({ attributes: COLUMNAS_RUN, where: { status: { [Op.in]: ['PENDING', 'RUNNING'] } }, order: [['id', 'ASC']], limit: 20 }));
  const ultimas = new Map<ActividadBuyer, any>();
  for (const actividad of ACTIVIDADES) ultimas.set(actividad, plain<any>(await db.amp_buyer_runs.findOne({ attributes: COLUMNAS_RUN, where: { activity: actividad, status: { [Op.in]: ['DONE', 'FAILED'] } }, order: [['id', 'DESC']] })));
  const cuentas = await contarPropuestasPorRun([...ultimas.values()].filter(Boolean).map(r => Number(r.id)));
  const actividades = [];
  for (const actividad of ACTIVIDADES) {
    const delTipo = activas.filter(r => r.activity === actividad);
    const actual = delTipo.find(r => r.status === 'RUNNING') ?? delTipo[0] ?? null;
    const ultima = ultimas.get(actividad) ?? null;
    const lanzadaHoy = !!(await db.amp_jobs.findOne({ attributes: ['id'], where: { dedupeKey: `buyer-weekly:${actividad}:${fecha}` } }));
    const cfg = vigentes.automatizacion[actividad];
    const proxima = proximaEjecucionAutomatica({
      ahora, modo: ajuste[actividad], semanal: cfg, automaticoDesde: ajuste.desde[actividad] ? new Date(ajuste.desde[actividad]!) : null, yaLanzadaHoy: lanzadaHoy,
      alertasEjecutables: vigentes.alertas.filter(a => a.params.accion === (actividad === 'B1' ? 'EJECUTAR_B1' : 'EJECUTAR_B2')).length
    });
    const registro = actual ? leerLog(actual.log) : [];
    actividades.push({
      activity: actividad,
      mode: ajuste[actividad],
      state: actual ? (actual.status === 'RUNNING' ? 'EJECUTANDO' : 'EN_COLA') : ultima?.status === 'FAILED' ? 'ERROR' : 'EN_REPOSO',
      currentRun: actual ? {
        id: Number(actual.id), status: actual.status, trigger: actual.trigger, step: actual.step ?? (actual.status === 'RUNNING' ? 'CONTEXTO' : 'COLA'),
        stepStartedAt: isoOrNull(actual.stepStartedAt) ?? isoOrNull(actual.createdAt), createdAt: isoOrNull(actual.createdAt),
        startedAt: registro.find((e: any) => e.step !== 'COLA')?.at ?? isoOrNull(actual.createdAt), log: registro
      } : null,
      lastRun: ultima ? {
        id: Number(ultima.id), status: ultima.status, trigger: ultima.trigger, provider: ultima.provider ?? null, model: ultima.model ?? null,
        finishedAt: isoOrNull(ultima.finishedAt), proposals: cuentas.get(Number(ultima.id)) ?? 0, error: ultima.error ?? null
      } : null,
      nextRunAt: proxima.at ? proxima.at.toISOString() : null,
      nextRunReason: proxima.reason,
      schedule: { enabled: cfg.activo, diaSemana: cfg.diaSemana, hora: cfg.hora }
    });
  }
  const avisos = plainMany<any>(await db.amp_buyer_alerts.findAll({ where: { acknowledgedAt: null }, order: [['id', 'DESC']], limit: 50 }));
  const pendingProposals = await db.amp_buyer_proposals.count({ where: { status: 'DRAFT' } });
  return {
    now: ahora.toISOString(),
    worker: latido,
    mode: { B1: ajuste.B1, B2: ajuste.B2 },
    activities: actividades,
    alerts: avisos.map(a => avisoAPlano(a, nombres)),
    pendingProposals
  };
}

/** Estado completo del agente para `GET buyer/agent` (la ruta añade `canChangeMode`). Memoizado 2 s por proceso. */
export async function estadoAgente(ahora = new Date()) {
  if (memoEstado.valor && Date.now() - memoEstado.en < TTL_ESTADO_MS) return memoEstado.valor as Awaited<ReturnType<typeof calcularEstado>>;
  if (memoEstado.promesa) return memoEstado.promesa as ReturnType<typeof calcularEstado>;
  const promesa = calcularEstado(ahora).then(valor => { if (memoEstado.promesa === promesa) { memoEstado.valor = valor; memoEstado.en = Date.now(); } return valor; }).finally(() => { if (memoEstado.promesa === promesa) memoEstado.promesa = null; });
  memoEstado.promesa = promesa;
  return promesa;
}

export const reconocerAvisoSchema = z.object({ id: z.number().int().positive() });
/** Marca un aviso como visto (idempotente). Lanza `ReglaError` 404 si no existe. */
export async function reconocerAviso(id: number, usuarioId: string) {
  const T = tables().amp_buyer_alerts;
  const fila = plain<any>(await T.findByPk(id));
  if (!fila) throw new ReglaError(404, 'Aviso no encontrado');
  if (!fila.acknowledgedAt) {
    await T.update({ acknowledgedBy: usuarioId, acknowledgedAt: new Date() }, { where: { id, acknowledgedAt: null } });
    invalidarEstadoAgente();
  }
  const { filas } = await estadoReglas();
  return avisoAPlano(plain<any>(await T.findByPk(id)), new Map(filas.map(f => [f.id, f.name])));
}
