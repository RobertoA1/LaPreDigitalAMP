import { Sequelize, type Model, type ModelStatic } from 'sequelize';
import { config } from 'dotenv';
config({ path: '.env.local' });
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { specs } from './schema';

const globalForDb = globalThis as unknown as { ampDb?: Sequelize; ampModels?: Record<string, ModelStatic<Model>> };

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
      globalForDb.ampDb = new Sequelize(process.env.DB_NAME || 'LaPreDigitalAMP', process.env.DB_USER || 'sa', process.env.DB_PASSWORD || '', {
        dialect: 'mssql', host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 1433),
        logging: false, dialectOptions: { options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_ENCRYPT !== 'true' } }
      });
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
