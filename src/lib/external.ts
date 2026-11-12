import { QueryTypes, type Sequelize } from 'sequelize';
import { crearConexionMssql, envDb } from './db';

/**
 * Conexiones de SOLO LECTURA al OLTP y al DataMart de LaPreDigital (SQL Server).
 * El AMP nunca escribe en ellas: toda consulta pasa por `queryExternal`, que rechaza
 * cualquier sentencia que no sea SELECT/WITH y obliga a usar parámetros.
 */
/** Pool explícito y pequeño: la instancia dispone de poca memoria para consultas, así que como mucho 2 consultas simultáneas por base. */
export const POOL_EXTERNO = { max: 2, min: 0, idle: 10000, acquire: 25000 };
/** Tiempo máximo (ms) de una consulta externa; al vencer el controlador la cancela y libera la conexión. */
export const TIMEOUT_CONSULTA_EXTERNA_MS = Number(process.env.EXTERNAL_QUERY_TIMEOUT_MS || 20000);

const globalForExternal = globalThis as unknown as { ampExternal?: Partial<Record<'oltp' | 'datamart', Sequelize>> };

export const MENSAJE_REQUIERE_SQLSERVER = 'El Agente de conversión Buyer → Lead requiere SQL Server (no está disponible en modo Demo).';

/** Verdadero si el AMP corre con SQL Server (no Demo/SQLite). */
export function sqlServerDisponible() {
  const dialect = process.env.DB_DIALECT || (process.env.DEMO_MODE === 'true' ? 'sqlite' : 'mssql');
  return process.env.DEMO_MODE !== 'true' && dialect === 'mssql';
}

function conexion(clave: 'oltp' | 'datamart') {
  if (!sqlServerDisponible()) throw new Error(MENSAJE_REQUIERE_SQLSERVER);
  globalForExternal.ampExternal ||= {};
  if (!globalForExternal.ampExternal[clave]) {
    const prefijo = clave === 'oltp' ? 'OLTP_DB' : 'DATAMART_DB';
    const nombre = envDb(prefijo, 'NAME', clave === 'oltp' ? 'LaPreDigitalOLTP' : 'LaPreDigitalDatamart');
    globalForExternal.ampExternal[clave] = crearConexionMssql(nombre, prefijo, POOL_EXTERNO, TIMEOUT_CONSULTA_EXTERNA_MS);
  }
  return globalForExternal.ampExternal[clave]!;
}

/** Conexión de solo lectura a `LaPreDigitalOLTP` (perezosa). */
export const oltp = () => conexion('oltp');
/** Conexión de solo lectura a `LaPreDigitalDatamart` (perezosa). */
export const datamart = () => conexion('datamart');

const PALABRAS_PROHIBIDAS = /\b(insert|update|delete|merge|drop|alter|create|truncate|exec|execute|grant|revoke|deny|backup|restore|shutdown|into|openrowset|openquery|bulk|xp_\w+|sp_\w+)\b/i;

/**
 * Guardián de solo lectura: acepta únicamente una sentencia que empiece por SELECT o WITH,
 * sin segundas sentencias ni palabras de escritura/DDL/ejecución (se ignoran literales y comentarios).
 * Lanza un error si la sentencia no es segura.
 */
export function assertSoloLectura(sql: string) {
  const sinComentarios = sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n\r]*/g, ' ');
  const sinLiterales = sinComentarios.replace(/N?'(?:[^']|'')*'/gi, "''").trim();
  if (!/^(select|with)\b/i.test(sinLiterales)) throw new Error('Consulta externa rechazada: solo se permiten sentencias SELECT o WITH.');
  if (/;\s*\S/.test(sinLiterales)) throw new Error('Consulta externa rechazada: solo se permite una sentencia.');
  const prohibida = sinLiterales.match(PALABRAS_PROHIBIDAS);
  if (prohibida) throw new Error(`Consulta externa rechazada: la palabra «${prohibida[0]}» no está permitida en consultas de solo lectura.`);
}

export type Parametros = Record<string, string | number | boolean | Date | null>;

/** Ejecuta un SELECT parametrizado (`:nombre`) sobre una conexión externa. Nunca concatenes entrada del usuario en `sql`. */
export class ConsultaExternaTimeout extends Error {
  constructor(public readonly ms: number) { super(`La base de datos tardó más de ${Math.round(ms / 1000)} s en responder (consulta cancelada). Intenta de nuevo en unos minutos.`); this.name = 'ConsultaExternaTimeout'; }
}
/** Tiempo agotado del controlador (HYT00) o de espera de una conexión libre del pool. */
export function esTiempoAgotado(error: unknown) {
  const e = error as any;
  return e?.original?.sqlstate === 'HYT00' || e?.parent?.sqlstate === 'HYT00' || e?.name === 'SequelizeConnectionAcquireTimeoutError' || /Query timeout expired/i.test(String(e?.message));
}

export async function queryExternal<T = Record<string, unknown>>(db: Sequelize, sql: string, replacements: Parametros = {}): Promise<T[]> {
  assertSoloLectura(sql);
  // MAXDOP 1: sin paralelismo la concesión de memoria baja mucho (la instancia dispone de poca memoria para consultas).
  const texto = /\boption\s*\(/i.test(sql) ? sql : `${sql.trim().replace(/;\s*$/, '')} OPTION (MAXDOP 1)`;
  try { return (await db.query(texto, { type: QueryTypes.SELECT, replacements })) as T[]; }
  catch (error) { throw esTiempoAgotado(error) ? new ConsultaExternaTimeout(TIMEOUT_CONSULTA_EXTERNA_MS) : error; }
}
