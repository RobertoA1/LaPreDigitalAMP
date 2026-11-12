import { Sequelize, type Model, type ModelStatic } from 'sequelize';
import { config } from 'dotenv';
config({ path: '.env.local' });
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { specs } from './schema';

const globalForDb = globalThis as unknown as { ampDb?: Sequelize; ampModels?: Record<string, ModelStatic<Model>> };

export type PrefijoDb = 'DB' | 'OLTP_DB' | 'DATAMART_DB';

/** Variable de entorno con herencia: OLTP_DB_HOST cae en DB_HOST si no está definida. */
export function envDb(prefijo: PrefijoDb, clave: string, porDefecto = ''): string {
  const propio = process.env[`${prefijo}_${clave}`];
  if (propio !== undefined && propio !== '') return propio;
  return process.env[`DB_${clave}`] || porDefecto;
}

/** Cadena de conexión ODBC de confianza (DB_AUTH=windows). Exportada para poder probarla. */
export function cadenaOdbc(baseDatos: string, prefijo: PrefijoDb) {
  const controlador = envDb(prefijo, 'ODBC_DRIVER', 'ODBC Driver 18 for SQL Server');
  const host = envDb(prefijo, 'HOST', 'localhost');
  const instancia = envDb(prefijo, 'INSTANCE');
  const puerto = envDb(prefijo, 'PORT', '1433');
  // Con el puerto por defecto se omite: así el controlador negocia protocolo (memoria compartida o TCP), como hace sqlcmd.
  const cifrar = envDb(prefijo, 'ENCRYPT', 'false') === 'true';
  // Con el puerto por defecto se omite: así el controlador negocia el protocolo (memoria compartida o TCP), como hace sqlcmd.
  const servidor = instancia ? `${host}\\${instancia}` : puerto && puerto !== '1433' ? `${host},${puerto}` : host;
  return `Driver={${controlador}};Server=${servidor};Database=${baseDatos};Trusted_Connection=yes;Encrypt=${cifrar ? 'yes' : 'no'};TrustServerCertificate=${cifrar ? 'no' : 'yes'};`;
}


/**
 * El adaptador msnodesqlv8 para Sequelize 6 devuelve como «filas afectadas» solo las filas leídas, así que todo UPDATE/DELETE
 * informa 0 (y código como el reclamo de trabajos de `processNextJob`, que usa `const [claimed] = await update(...)`, cree que otro lo reclamó).
 * Se reemplaza `Request.execute` por una copia que además escucha el evento `rowcount` del controlador. Idempotente.
 */
function parchearConteoDeFilasMsnodesqlv8() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const lib = require('msnodesqlv8/lib/sequelize');
  const Request = lib.Request;
  if (Request.prototype.__conteoParcheado) return;
  Request.prototype.__conteoParcheado = true;
  Request.prototype.execute = function (this: any, context: any) {
    let metadata: any = null, currentRow: any = null, e: any = null, rowCount = 0, afectadas = 0, lastColumn = 0;
    let s: string = this.sql;
    context.requests.push(this);
    try {
      if (this.params.length > 0) {
        if (s.startsWith('INSERT')) s = s.replace(/@\d+/g, '?');
        else if (s.startsWith('UPDATE')) s = s.replace(/\s*=\s*@\d+/g, ' = ?');
      }
      const timeoutMs = Number(context.config?.requestTimeout) || 0;
      const request = context.connection.queryRaw(timeoutMs > 0 ? { query_str: s, query_timeout: Math.max(1, Math.ceil(timeoutMs / 1000)) } : s, this.params);
      request.on('meta', (meta: any) => { metadata = meta; currentRow = [metadata.length]; lastColumn = metadata.length - 1; });
      request.on('column', (index: number, data: any) => {
        currentRow[index] = Request.createColumn(metadata, index, data);
        if (index === lastColumn) { ++rowCount; this.emit('row', currentRow); currentRow = [metadata.length]; }
      });
      request.on('rowcount', (n: number) => { afectadas += Number(n) || 0; });
      request.on('error', (err: any) => { e = err; context.removeRequest(this, e); });
      request.on('done', () => { context.removeRequest(this); if (typeof this.callback === 'function') this.callback(e, rowCount || afectadas); });
    } catch (ex) { context.removeRequest(this, ex); context.close(); }
  };
}

/**
 * Crea una conexión Sequelize a SQL Server.
 * DB_AUTH=windows usa msnodesqlv8 (ODBC, conexión de confianza) mediante su adaptador para Sequelize 6
 * (`msnodesqlv8/lib/sequelize`, con la misma interfaz Connection/Request que tedious);
 * DB_AUTH=sql usa tedious con usuario y contraseña.
 */
export type PoolMssql = { max: number; min: number; idle: number; acquire?: number };
/** Tiempo máximo (ms) de una consulta: al vencer el controlador la cancela y libera la conexión. */
export const TIMEOUT_CONSULTA_AMP_MS = Number(process.env.AMP_QUERY_TIMEOUT_MS || 60000);
export function crearConexionMssql(baseDatos: string, prefijo: PrefijoDb = 'DB', pool: PoolMssql = { max: 5, min: 0, idle: 10000, acquire: 30000 }, requestTimeout = TIMEOUT_CONSULTA_AMP_MS) {
  const auth = envDb(prefijo, 'AUTH', 'windows').toLowerCase();
  if (auth !== 'windows' && auth !== 'sql') throw new Error('DB_AUTH debe ser windows o sql');
  if (auth === 'sql') {
    const instancia = envDb(prefijo, 'INSTANCE');
    const cifrar = envDb(prefijo, 'ENCRYPT', 'false') === 'true';
    return new Sequelize(baseDatos, envDb(prefijo, 'USER', 'sa'), envDb(prefijo, 'PASSWORD'), {
      dialect: 'mssql', host: envDb(prefijo, 'HOST', 'localhost'), port: Number(envDb(prefijo, 'PORT', '1433')), logging: false, pool,
      dialectOptions: { options: { requestTimeout, encrypt: cifrar, trustServerCertificate: !cifrar, ...(instancia ? { instanceName: instancia } : {}) } }
    });
  }
  parchearConteoDeFilasMsnodesqlv8();
  return new Sequelize(baseDatos, '', '', {
    dialect: 'mssql', host: envDb(prefijo, 'HOST', 'localhost'), logging: false, pool,
    dialectModulePath: 'msnodesqlv8/lib/sequelize',
    dialectOptions: { options: { connectionString: cadenaOdbc(baseDatos, prefijo), trustedConnection: true, requestTimeout } }
  });
}

export function getDb() {
  if (!globalForDb.ampDb) {
    const dialect = process.env.DB_DIALECT || (process.env.DEMO_MODE === 'true' ? 'sqlite' : 'mssql');
    if (dialect !== 'sqlite' && dialect !== 'mssql') throw new Error('DB_DIALECT debe ser sqlite o mssql');
    if (process.env.DEMO_MODE === 'true' && dialect !== 'sqlite') throw new Error('DEMO_MODE requiere SQLite aislado');
    if (dialect === 'sqlite' && process.env.DEMO_MODE !== 'true') throw new Error('SQLite solo está permitido en modo Demo');
    if (dialect === 'sqlite') {
      const storage = resolve(/* turbopackIgnore: true */ process.env.SQLITE_STORAGE || './data/demo.sqlite');
      mkdirSync(dirname(storage), { recursive: true });
      globalForDb.ampDb = new Sequelize({ dialect: 'sqlite', storage, logging: false, pool: { max: 5, min: 0, idle: 10000 } });
    } else {
      globalForDb.ampDb = crearConexionMssql(process.env.DB_NAME || 'LaPreDigitalAMP', 'DB', { max: 8, min: 0, idle: 10000, acquire: 30000 });
    }
  }
  return globalForDb.ampDb;
}

export function tables() {
  const db = getDb();
  globalForDb.ampModels ||= {};
  for (const [name, attributes] of Object.entries(specs)) {
    if (globalForDb.ampModels[name]) continue;
    const fresh = Object.fromEntries(Object.entries(attributes).map(([key, definition]) => [key, typeof definition === 'object' ? { ...(definition as object) } : definition])) as typeof attributes;
    globalForDb.ampModels[name] = db.define(name, fresh, { tableName: name, timestamps: false, freezeTableName: true });
  }
  return globalForDb.ampModels;
}

export function plain<T = Record<string, unknown>>(row: Model | null): T | null {
  return row ? row.get({ plain: true }) as T : null;
}
export function plainMany<T = Record<string, unknown>>(rows: Model[]): T[] {
  return rows.map(row => row.get({ plain: true }) as T);
}
