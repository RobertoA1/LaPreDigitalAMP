import { z } from 'zod';
import { oltp, queryExternal, type Parametros } from './external';
import { conCache } from './buyer-kpis';

/**
 * Perfiles de los buyers capturados por el formulario (docs/agente-buyer-lead-reglas.md §5).
 * Lectura directa del OLTP (`mkt.FormularioContacto` y tablas relacionadas), SOLO SELECT por `queryExternal` (con MAXDOP 1 y tiempo máximo).
 * El AMP no copia ningún dato personal: el listado enmascara correo y teléfono; el detalle los muestra completos y la ruta deja un
 * `amp_events` BUYER_PROFILE_VIEW sin datos personales (solo el id del formulario).
 * Consultas baratas: el listado ordena y pagina solo ids de formulario (columnas estrechas) y después enriquece esa página (≤ 50 filas);
 * el conteo por estado se guarda 30 s en caché.
 */

export const ESTADOS_PERFIL = ['VALIDO', 'DUPLICADO', 'INVALIDO', 'REVISION'] as const;
export const ROLES_PERFIL = ['ESTUDIANTE', 'PADRE', 'MADRE', 'APODERADO'] as const;
export type EstadoPerfil = (typeof ESTADOS_PERFIL)[number];
const ID_ESTADO: Record<EstadoPerfil, number> = { VALIDO: 1, DUPLICADO: 2, INVALIDO: 3, REVISION: 4 };
const ID_ROL: Record<(typeof ROLES_PERFIL)[number], number> = { ESTUDIANTE: 1, PADRE: 2, MADRE: 3, APODERADO: 4 };
const LIMA_UTC = 5;
export const TTL_CONTEO_PERFILES_MS = 30_000;
export const MIN_BUSQUEDA = 3;
export const MAX_PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Enmascarado y cálculos puros
// ---------------------------------------------------------------------------

/** `juan.perez@dominio.com` → `j***@dominio.com`. Sin arroba o vacío → `***`. */
export function enmascararCorreo(correo: string | null | undefined): string {
  const valor = String(correo ?? '').trim();
  const arroba = valor.lastIndexOf('@');
  if (!valor || arroba < 1) return valor ? '***' : '';
  return `${valor[0]}***${valor.slice(arroba)}`;
}
/** `987654321` → `*****321` (cinco asteriscos y los 3 últimos dígitos). Con menos de 4 dígitos todo va oculto. */
export function enmascararTelefono(telefono: string | null | undefined): string {
  const valor = String(telefono ?? '').replace(/\D/g, '');
  if (!valor) return '';
  return valor.length < 4 ? '*'.repeat(valor.length) : `*****${valor.slice(-3)}`;
}
/** Avance del video en % (1 decimal, tope 100). Sin reproducción o duración inválida → null; reproducción sin puntos → 0. */
export function calcularAvancePct(segundoMaximo: number | null | undefined, duracionSeg: number | null | undefined): number | null {
  if (duracionSeg == null || !Number.isFinite(Number(duracionSeg)) || Number(duracionSeg) <= 0 || segundoMaximo === undefined) return null;
  if (segundoMaximo === null) return null;
  return Math.min(100, Math.round((Math.max(0, Number(segundoMaximo)) / Number(duracionSeg)) * 1000) / 10);
}
/** Mitad y final con la misma definición del DataMart (avance máximo ≥ 50 % / ≥ duración). */
export const alcanzoMitad = (segundoMaximo: number, duracionSeg: number) => duracionSeg > 0 && segundoMaximo * 2 >= duracionSeg;
export const llegoAlFinal = (segundoMaximo: number, duracionSeg: number) => duracionSeg > 0 && segundoMaximo >= duracionSeg;
export const esLead = (estado: string, idPersona: number | null | undefined) => (estado === 'VALIDO' || estado === 'DUPLICADO') && idPersona != null;

/** Día de Lima (AAAA-MM-DD) de un instante ISO en UTC. */
export const diaLimaDe = (iso: string) => new Date(Date.parse(iso) - LIMA_UTC * 3600_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Parámetros
// ---------------------------------------------------------------------------

const vacioANada = (v: unknown) => (v === '' || v === null ? undefined : v);
const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (usa AAAA-MM-DD)').refine(v => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, 'Fecha inexistente');

/** Parámetros de `GET buyer/profiles`. */
export const filtroPerfilesSchema = z.object({
  page: z.preprocess(vacioANada, z.coerce.number().int().min(1, 'page mínimo 1').max(100000).default(1)),
  pageSize: z.preprocess(vacioANada, z.coerce.number().int().min(1, 'pageSize mínimo 1').max(MAX_PAGE_SIZE, `pageSize máximo ${MAX_PAGE_SIZE}`).default(25)),
  q: z.preprocess(v => (typeof v === 'string' && !v.trim() ? undefined : vacioANada(v)), z.string().trim().min(MIN_BUSQUEDA, `La búsqueda requiere al menos ${MIN_BUSQUEDA} caracteres`).max(100, 'La búsqueda admite hasta 100 caracteres').optional()),
  estado: z.preprocess(vacioANada, z.enum(ESTADOS_PERFIL).optional()),
  canal: z.preprocess(vacioANada, z.string().regex(/^[A-Za-z_]{1,20}$/, 'Canal inválido').transform(v => v.toUpperCase()).optional()),
  campana: z.preprocess(vacioANada, z.coerce.number().int().positive().optional()),
  rol: z.preprocess(vacioANada, z.enum(ROLES_PERFIL).optional()),
  from: z.preprocess(vacioANada, fechaIso.optional()),
  to: z.preprocess(vacioANada, fechaIso.optional())
}).refine(v => !v.from || !v.to || v.from <= v.to, 'from no puede ser posterior a to')
  .refine(v => !v.from || !v.to || (Date.parse(v.to) - Date.parse(v.from)) / 86400000 <= 800, 'El periodo máximo es de 800 días');
export type FiltroPerfiles = z.infer<typeof filtroPerfilesSchema>;
/** Parámetros de `GET buyer/profile`. */
export const perfilQuerySchema = z.object({ formulario: z.coerce.number('formulario debe ser un número').int('formulario debe ser un entero').positive('formulario debe ser positivo').max(Number.MAX_SAFE_INTEGER) });

const sqlFecha = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
const sinComodines = (v: string) => v.replace(/[%_[\]\\]/g, ' ').replace(/\s+/g, ' ').trim();

/** Arma JOIN, WHERE y parámetros (todo parametrizado). `incluirEstado` = false para el conteo por estado. */
export function construirFiltro(filtro: FiltroPerfiles, incluirEstado = true): { joins: string; where: string; params: Parametros } {
  const params: Parametros = {};
  const where: string[] = ['1 = 1'];
  let joins = '';
  if (filtro.canal || filtro.campana) {
    joins += ' JOIN mkt.VisitaLanding AS vi ON vi.IdVisita = f.IdVisita';
    if (filtro.canal) { joins += ' JOIN cat.Canal AS ca ON ca.IdCanal = vi.IdCanal'; where.push('ca.Codigo = :canal'); params.canal = filtro.canal; }
    if (filtro.campana) { where.push('vi.IdCampana = :campana'); params.campana = filtro.campana; }
  }
  if (incluirEstado && filtro.estado) where.push(`f.IdEstadoFormulario = ${ID_ESTADO[filtro.estado]}`);
  if (filtro.rol) where.push(`f.IdRolContacto = ${ID_ROL[filtro.rol]}`);
  if (filtro.from) { where.push('f.FechaHoraEnvio >= CAST(:ini AS datetime2(0))'); params.ini = sqlFecha(new Date(Date.parse(`${filtro.from}T00:00:00Z`) + LIMA_UTC * 3600_000)); }
  if (filtro.to) { where.push('f.FechaHoraEnvio < CAST(:fin AS datetime2(0))'); params.fin = sqlFecha(new Date(Date.parse(`${filtro.to}T00:00:00Z`) + 86400_000 + LIMA_UTC * 3600_000)); }
  const texto = filtro.q ? sinComodines(filtro.q) : '';
  if (texto.length >= MIN_BUSQUEDA) {
    const condiciones = ['f.NombreCompleto LIKE :q', 'f.Correo LIKE :q'];
    params.q = `%${texto}%`;
    const digitos = texto.replace(/\D/g, '');
    if (digitos.length >= MIN_BUSQUEDA) { condiciones.push('f.Telefono LIKE :qd'); params.qd = `%${digitos}%`; }
    where.push(`(${condiciones.join(' OR ')})`);
  }
  return { joins, where: where.join(' AND '), params };
}

// ---------------------------------------------------------------------------
// Listado
// ---------------------------------------------------------------------------

type Fila = Record<string, any>;
const num = (v: unknown) => (v == null ? 0 : Number(v));
const iso = (v: unknown) => (v == null ? null : `${String(v).slice(0, 19)}Z`);
const campanaDe = (fila: Fila) => (fila.IdCampana == null ? null : { id: num(fila.IdCampana), nombre: String(fila.campana), tipo: String(fila.tipo) });
const SQL_FECHA = (columna: string) => `CONVERT(varchar(19), ${columna}, 126)`;

export type PerfilListado = {
  idFormulario: number; idPersona: number | null; nombre: string; correo: string; telefono: string; rol: string | null; estado: string; enviadoEn: string | null;
  canal: string | null; campana: { id: number; nombre: string; tipo: string } | null; video: { id: number; nombre: string } | null; avancePct: number | null; esLead: boolean;
};

/** Convierte una fila SQL del listado en el perfil público (enmascarado). */
export function aPerfilListado(fila: Fila): PerfilListado {
  const idPersona = fila.IdPersona == null ? null : num(fila.IdPersona);
  const estado = String(fila.estado);
  return {
    idFormulario: num(fila.IdFormulario), idPersona, nombre: String(fila.NombreCompleto ?? ''), correo: enmascararCorreo(fila.Correo), telefono: enmascararTelefono(fila.Telefono),
    rol: fila.rol == null ? null : String(fila.rol), estado, enviadoEn: iso(fila.envio), canal: fila.canal == null ? null : String(fila.canal), campana: campanaDe(fila),
    video: fila.IdVideo == null ? null : { id: num(fila.IdVideo), nombre: String(fila.video) },
    avancePct: fila.IdVideo == null ? null : calcularAvancePct(num(fila.MaxSeg), num(fila.DuracionSeg)), esLead: esLead(estado, idPersona)
  };
}

async function conteosPorEstado(filtro: FiltroPerfiles) {
  const base = { ...filtro, estado: undefined, page: 1, pageSize: 1 };
  const clave = `perfiles-conteo|${JSON.stringify([base.q ?? '', base.canal ?? '', base.campana ?? 0, base.rol ?? '', base.from ?? '', base.to ?? ''])}`;
  return conCache(clave, async () => {
    const { joins, where, params } = construirFiltro(base, false);
    const filas = await queryExternal<Fila>(oltp(), `SELECT f.IdEstadoFormulario AS e, COUNT(*) AS n FROM mkt.FormularioContacto AS f${joins} WHERE ${where} GROUP BY f.IdEstadoFormulario`, params);
    const counts = { VALIDO: 0, DUPLICADO: 0, INVALIDO: 0, REVISION: 0 };
    for (const fila of filas) { const estado = (Object.keys(ID_ESTADO) as EstadoPerfil[]).find(k => ID_ESTADO[k] === num(fila.e)); if (estado) counts[estado] = num(fila.n); }
    return counts;
  }, { ttlMs: TTL_CONTEO_PERFILES_MS });
}

/** `GET buyer/profiles`: página de formularios con correo y teléfono enmascarados. */
export async function listarPerfiles(filtro: FiltroPerfiles) {
  const counts = await conteosPorEstado(filtro);
  const total = filtro.estado ? counts[filtro.estado] : counts.VALIDO + counts.DUPLICADO + counts.INVALIDO + counts.REVISION;
  const { page, pageSize } = filtro;
  const { joins, where, params } = construirFiltro(filtro, true);
  const db = oltp();
  // 1) Solo ids de la página (columnas estrechas: el orden por fecha pide poca memoria).
  const ids = (await queryExternal<Fila>(db, `SELECT f.IdFormulario AS id FROM mkt.FormularioContacto AS f${joins} WHERE ${where}
    ORDER BY f.FechaHoraEnvio DESC, f.IdFormulario DESC OFFSET ${(page - 1) * pageSize} ROWS FETCH NEXT ${pageSize} ROWS ONLY`, params)).map(f => Math.trunc(num(f.id))).filter(Number.isSafeInteger);
  if (!ids.length) return { total, page, pageSize, counts, profiles: [] as PerfilListado[] };
  // 2) Detalle de esas filas (≤ 50): visita, campaña, rol, estado y avance del primer video reproducido en la visita.
  const filas = await queryExternal<Fila>(db, `SELECT f.IdFormulario, f.IdPersona, f.NombreCompleto, f.Correo, f.Telefono, rc.Codigo AS rol, e.Codigo AS estado, ${SQL_FECHA('f.FechaHoraEnvio')} AS envio,
      ca.Codigo AS canal, cp.IdCampana, cp.Nombre AS campana, tc.Codigo AS tipo, rp.IdVideo, rp.Nombre AS video, rp.DuracionSeg, rp.MaxSeg
    FROM mkt.FormularioContacto AS f
    JOIN cat.EstadoFormulario AS e ON e.IdEstadoFormulario = f.IdEstadoFormulario
    JOIN mkt.VisitaLanding AS vi2 ON vi2.IdVisita = f.IdVisita
    JOIN cat.Canal AS ca ON ca.IdCanal = vi2.IdCanal
    LEFT JOIN cat.RolContacto AS rc ON rc.IdRolContacto = f.IdRolContacto
    LEFT JOIN mkt.Campana AS cp ON cp.IdCampana = vi2.IdCampana
    LEFT JOIN cat.TipoCampana AS tc ON tc.IdTipoCampana = cp.IdTipoCampana
    OUTER APPLY (SELECT TOP 1 v.IdVideo, v.Nombre, v.DuracionSeg, ISNULL((SELECT MAX(p.SegundoAlcanzado) FROM mkt.ReproduccionVideoPunto AS p WHERE p.IdReproduccion = rv.IdReproduccion), 0) AS MaxSeg
                 FROM mkt.ReproduccionVideo AS rv JOIN mkt.Video AS v ON v.IdVideo = rv.IdVideo WHERE rv.IdVisita = f.IdVisita ORDER BY rv.FechaHoraInicio, rv.IdReproduccion) AS rp
    WHERE f.IdFormulario IN (${ids.join(',')})
    ORDER BY f.FechaHoraEnvio DESC, f.IdFormulario DESC`);
  return { total, page, pageSize, counts, profiles: filas.map(aPerfilListado) };
}

// ---------------------------------------------------------------------------
// Línea de tiempo (función pura)
// ---------------------------------------------------------------------------

export type EventoTiempo = { at: string; tipo: 'VISITA' | 'VIDEO' | 'FORMULARIO'; texto: string };
export type EntradaLinea = {
  visita: { inicio: string; canal: string; campana: { id: number; nombre: string; tipo: string } | null };
  reproduccion: { inicio: string; video: string; version: string; duracionSeg: number; puntos: Array<{ segundo: number; registradoEn: string }> } | null;
  formulario: { enviadoEn: string; estado: string; rol: string | null };
};
const ESTADO_TEXTO: Record<string, string> = { VALIDO: 'válido', DUPLICADO: 'válido, coincide con una persona ya registrada', INVALIDO: 'inválido', REVISION: 'en revisión' };
const minSeg = (s: number) => `${Math.round(s)} s`;

/** Eventos de la captura en orden cronológico (a igual instante: visita, video, formulario). */
export function construirLineaDeTiempo(e: EntradaLinea): EventoTiempo[] {
  const eventos: EventoTiempo[] = [];
  const camp = e.visita.campana ? ` por la campaña «${e.visita.campana.nombre}» (${e.visita.campana.tipo === 'PAGADA' ? 'anuncio pagado' : 'publicación orgánica'})` : ' sin campaña identificada';
  eventos.push({ at: e.visita.inicio, tipo: 'VISITA', texto: `Llegó a la landing desde ${e.visita.canal}${camp}.` });
  const r = e.reproduccion;
  if (r) {
    eventos.push({ at: r.inicio, tipo: 'VIDEO', texto: `Empezó a ver «${r.video}» (${r.version}, ${minSeg(r.duracionSeg)}).` });
    const puntos = [...r.puntos].sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));
    const max = puntos.reduce((m, p) => Math.max(m, p.segundo), 0);
    const mitad = puntos.find(p => alcanzoMitad(p.segundo, r.duracionSeg));
    if (mitad) eventos.push({ at: mitad.registradoEn, tipo: 'VIDEO', texto: `Llegó a la mitad del video (segundo ${minSeg(mitad.segundo)}).` });
    const final = puntos.find(p => llegoAlFinal(p.segundo, r.duracionSeg));
    if (final) eventos.push({ at: final.registradoEn, tipo: 'VIDEO', texto: 'Vio el video completo.' });
    else if (puntos.length) eventos.push({ at: puntos[puntos.length - 1].registradoEn, tipo: 'VIDEO', texto: `Dejó de ver el video en el ${calcularAvancePct(max, r.duracionSeg)} % (segundo ${minSeg(max)} de ${minSeg(r.duracionSeg)}).` });
    else eventos.push({ at: r.inicio, tipo: 'VIDEO', texto: 'No se registró avance del video.' });
  }
  eventos.push({ at: e.formulario.enviadoEn, tipo: 'FORMULARIO', texto: `Envió el formulario${e.formulario.rol ? ` como ${e.formulario.rol.toLowerCase()}` : ''}: estado ${ESTADO_TEXTO[e.formulario.estado] ?? e.formulario.estado.toLowerCase()}.` });
  const orden = { VISITA: 0, VIDEO: 1, FORMULARIO: 2 } as const;
  return eventos.map((ev, i) => ({ ev, i })).sort((a, b) => a.ev.at.localeCompare(b.ev.at) || orden[a.ev.tipo] - orden[b.ev.tipo] || a.i - b.i).map(x => x.ev);
}

// ---------------------------------------------------------------------------
// Detalle
// ---------------------------------------------------------------------------

/** `GET buyer/profile`: ficha completa de un formulario (datos de contacto sin enmascarar). `null` si no existe. */
export async function perfilDeFormulario(idFormulario: number) {
  const db = oltp();
  const [f] = await queryExternal<Fila>(db, `SELECT f.IdFormulario, f.IdPersona, f.IdVisita, f.NombreCompleto, f.Correo, f.Telefono, rc.Codigo AS rol, e.Codigo AS estado, ${SQL_FECHA('f.FechaHoraEnvio')} AS envio,
      pe.NombreCompleto AS pNombre, pe.Correo AS pCorreo, pe.Telefono AS pTelefono, rp.Codigo AS pRol, ${SQL_FECHA('pe.FechaRegistro')} AS pRegistro,
      vi.CodigoDispositivo, ${SQL_FECHA('vi.FechaHoraInicio')} AS inicio, ca.Codigo AS canal, cp.IdCampana, cp.Nombre AS campana, tc.Codigo AS tipo,
      CASE WHEN f.IdEstadoFormulario IN (1, 2) AND CAST(DATEADD(HOUR, -${LIMA_UTC}, f.FechaHoraEnvio) AS date) = CAST(DATEADD(HOUR, -${LIMA_UTC}, vi.FechaHoraInicio) AS date) THEN 1 ELSE 0 END AS mismoDia,
      CASE WHEN EXISTS (SELECT 1 FROM mkt.FormularioContacto AS f1 WHERE f1.IdVisita = f.IdVisita AND f1.IdEstadoFormulario IN (2, 4)) THEN 0
           WHEN EXISTS (SELECT 1 FROM mkt.FormularioContacto AS f2 JOIN mkt.VisitaLanding AS v2 ON v2.IdVisita = f2.IdVisita WHERE v2.CodigoDispositivo = vi.CodigoDispositivo AND f2.IdEstadoFormulario IN (1, 2) AND f2.FechaHoraEnvio < vi.FechaHoraInicio) THEN 0
           ELSE 1 END AS elegible
    FROM mkt.FormularioContacto AS f
    JOIN cat.EstadoFormulario AS e ON e.IdEstadoFormulario = f.IdEstadoFormulario
    JOIN mkt.VisitaLanding AS vi ON vi.IdVisita = f.IdVisita
    JOIN cat.Canal AS ca ON ca.IdCanal = vi.IdCanal
    LEFT JOIN cat.RolContacto AS rc ON rc.IdRolContacto = f.IdRolContacto
    LEFT JOIN per.Persona AS pe ON pe.IdPersona = f.IdPersona
    LEFT JOIN cat.RolContacto AS rp ON rp.IdRolContacto = pe.IdRolContacto
    LEFT JOIN mkt.Campana AS cp ON cp.IdCampana = vi.IdCampana
    LEFT JOIN cat.TipoCampana AS tc ON tc.IdTipoCampana = cp.IdTipoCampana
    WHERE f.IdFormulario = :id`, { id: idFormulario });
  if (!f) return null;
  const campana = campanaDe(f);
  const idVisita = num(f.IdVisita), idPersona = f.IdPersona == null ? null : num(f.IdPersona);
  // Primera reproducción de la visita y sus puntos (la misma regla del DataMart).
  const [rep] = await queryExternal<Fila>(db, `SELECT TOP 1 rv.IdReproduccion, v.IdVideo, v.Nombre, v.VersionGuion, v.DuracionSeg, ${SQL_FECHA('rv.FechaHoraInicio')} AS inicio,
      ISNULL((SELECT MAX(p.SegundoAlcanzado) FROM mkt.ReproduccionVideoPunto AS p WHERE p.IdReproduccion = rv.IdReproduccion), 0) AS MaxSeg
    FROM mkt.ReproduccionVideo AS rv JOIN mkt.Video AS v ON v.IdVideo = rv.IdVideo WHERE rv.IdVisita = :visita ORDER BY rv.FechaHoraInicio, rv.IdReproduccion`, { visita: idVisita });
  const puntos = rep ? (await queryExternal<Fila>(db, `SELECT TOP 300 p.SegundoAlcanzado AS segundo, ${SQL_FECHA('p.FechaHoraRegistro')} AS registrado FROM mkt.ReproduccionVideoPunto AS p
    WHERE p.IdReproduccion = :rep ORDER BY p.FechaHoraRegistro, p.IdPunto`, { rep: num(rep.IdReproduccion) })).map(p => ({ segundo: num(p.segundo), registradoEn: iso(p.registrado)! })) : [];
  // Otros formularios de la misma persona o del mismo dispositivo (dos búsquedas con índice, unidas en memoria).
  const porPersona = idPersona == null ? [] : await queryExternal<Fila>(db, `SELECT TOP 20 x.IdFormulario, e.Codigo AS estado, ${SQL_FECHA('x.FechaHoraEnvio')} AS envio FROM mkt.FormularioContacto AS x
    JOIN cat.EstadoFormulario AS e ON e.IdEstadoFormulario = x.IdEstadoFormulario WHERE x.IdPersona = :persona AND x.IdFormulario <> :id ORDER BY x.FechaHoraEnvio DESC`, { persona: idPersona, id: idFormulario });
  const porDispositivo = await queryExternal<Fila>(db, `SELECT TOP 20 x.IdFormulario, e.Codigo AS estado, ${SQL_FECHA('x.FechaHoraEnvio')} AS envio FROM mkt.VisitaLanding AS v2
    JOIN mkt.FormularioContacto AS x ON x.IdVisita = v2.IdVisita JOIN cat.EstadoFormulario AS e ON e.IdEstadoFormulario = x.IdEstadoFormulario
    WHERE v2.CodigoDispositivo = :disp AND x.IdFormulario <> :id ORDER BY x.FechaHoraEnvio DESC`, { disp: String(f.CodigoDispositivo), id: idFormulario });
  const otros = new Map<number, { id: number; estado: string; enviadoEn: string }>();
  for (const x of [...porPersona, ...porDispositivo]) otros.set(num(x.IdFormulario), { id: num(x.IdFormulario), estado: String(x.estado), enviadoEn: iso(x.envio)! });
  const otrosFormularios = [...otros.values()].sort((a, b) => b.enviadoEn.localeCompare(a.enviadoEn) || b.id - a.id).slice(0, 20);
  const visitas = await queryExternal<Fila>(db, `SELECT TOP 20 v2.IdVisita, ${SQL_FECHA('v2.FechaHoraInicio')} AS inicio, ca.Codigo AS canal, cp.IdCampana, cp.Nombre AS campana, tc.Codigo AS tipo
    FROM mkt.VisitaLanding AS v2 JOIN cat.Canal AS ca ON ca.IdCanal = v2.IdCanal LEFT JOIN mkt.Campana AS cp ON cp.IdCampana = v2.IdCampana LEFT JOIN cat.TipoCampana AS tc ON tc.IdTipoCampana = cp.IdTipoCampana
    WHERE v2.CodigoDispositivo = :disp AND v2.IdVisita <> :visita ORDER BY v2.FechaHoraInicio DESC, v2.IdVisita DESC`, { disp: String(f.CodigoDispositivo), visita: idVisita });
  const inicioVisita = iso(f.inicio)!;
  const enviadoEn = iso(f.envio)!;
  const reproduccion = rep ? {
    video: String(rep.Nombre), videoId: num(rep.IdVideo), version: String(rep.VersionGuion), duracionSeg: num(rep.DuracionSeg), segundoMaximo: num(rep.MaxSeg),
    avancePct: calcularAvancePct(num(rep.MaxSeg), num(rep.DuracionSeg)), llegoAlFinal: llegoAlFinal(num(rep.MaxSeg), num(rep.DuracionSeg)), alcanzoMitad: alcanzoMitad(num(rep.MaxSeg), num(rep.DuracionSeg)),
    mismoDia: num(f.mismoDia) === 1, elegible: num(f.elegible) === 1, puntos
  } : null;
  return {
    persona: idPersona == null ? null : { id: idPersona, nombre: String(f.pNombre ?? ''), correo: String(f.pCorreo ?? ''), telefono: String(f.pTelefono ?? ''), rol: f.pRol == null ? null : String(f.pRol), registradaEn: iso(f.pRegistro) },
    formulario: { id: num(f.IdFormulario), estado: String(f.estado), enviadoEn, nombre: String(f.NombreCompleto ?? ''), correo: String(f.Correo ?? ''), telefono: String(f.Telefono ?? ''), rol: f.rol == null ? null : String(f.rol) },
    visita: { id: idVisita, inicio: inicioVisita, canal: String(f.canal), campana, dispositivo: String(f.CodigoDispositivo).slice(0, 8) },
    reproduccion,
    otrosFormularios,
    otrasVisitas: visitas.map(v => ({ id: num(v.IdVisita), inicio: iso(v.inicio)!, canal: String(v.canal), campana: campanaDe(v) })),
    lineaDeTiempo: construirLineaDeTiempo({
      visita: { inicio: inicioVisita, canal: String(f.canal), campana },
      reproduccion: rep ? { inicio: iso(rep.inicio)!, video: String(rep.Nombre), version: String(rep.VersionGuion), duracionSeg: num(rep.DuracionSeg), puntos } : null,
      formulario: { enviadoEn, estado: String(f.estado), rol: f.rol == null ? null : String(f.rol) }
    })
  };
}
