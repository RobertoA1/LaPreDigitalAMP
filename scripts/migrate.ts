import { DataTypes, type ModelAttributes } from 'sequelize';
import { crearConexionMssql, getDb } from '../src/lib/db';
import { specs } from '../src/lib/schema';
import { sembrarReglas } from '../src/lib/buyer-rules';

/** Sequelize anota `field` en las definiciones y las constantes del esquema se comparten entre columnas y tablas: sin clonar y quitar `field`, las columnas se renombran o se pierden. */
function clonar(attributes: ModelAttributes): ModelAttributes {
  return Object.fromEntries(Object.entries(attributes).map(([key, definition]) => [key, typeof definition === 'object' ? (({ field, ...resto }) => resto)(definition as any) : definition])) as ModelAttributes;
}

/** Con SQL Server crea la base DB_NAME si no existe (conectando a master). Solo toca la base propia del AMP. */
async function crearBaseSiNoExiste() {
  const dialect = process.env.DB_DIALECT || (process.env.DEMO_MODE === 'true' ? 'sqlite' : 'mssql');
  if (dialect !== 'mssql') return;
  const nombre = process.env.DB_NAME || 'LaPreDigitalAMP';
  if (!/^[A-Za-z0-9_]+$/.test(nombre)) throw new Error('DB_NAME solo admite letras, números y guion bajo');
  const master = crearConexionMssql('master', 'DB');
  try {
    await master.query(`IF DB_ID(N'${nombre}') IS NULL CREATE DATABASE [${nombre}]`);
  } finally { await master.close(); }
}

async function main() {
  await crearBaseSiNoExiste();
  const db = getDb();
  await db.authenticate();
  const qi = db.getQueryInterface();
  await qi.createTable('amp_migrations', { name: { type: DataTypes.STRING(120), primaryKey: true }, appliedAt: { type: DataTypes.DATE, allowNull: false } }).catch(async error => {
    if (!(await qi.showAllTables()).some(table => String(table).toLowerCase() === 'amp_migrations')) throw error;
  });
  const done = new Set((await db.query('SELECT name FROM amp_migrations'))[0].map((row: any) => row.name));
  const name = '001_initial_datamart_and_amp';
  if (!done.has(name)) {
    for (const [table, attributes] of Object.entries(specs)) {
      if (table === 'dm_academic_weekly' || table === 'amp_contact_state' || table === 'amp_insights' || table === 'amp_inbound_triage') continue;
      const initial = table === 'dm_contacts' ? Object.fromEntries(Object.entries(attributes).filter(([field]) => field !== 'stageChangedAt')) : table === 'amp_messages' ? Object.fromEntries(Object.entries(attributes).filter(([field]) => !['recipientKind', 'replyToId'].includes(field))) : attributes;
      await qi.createTable(table, clonar(initial as ModelAttributes));
    }
    await qi.addIndex('dm_contacts', ['stage']);
    await qi.addIndex('amp_events', ['contactId', 'createdAt']);
    await qi.addIndex('amp_messages', ['contactId', 'createdAt']);
    await qi.addIndex('amp_jobs', ['status', 'runAt']);
    await qi.addIndex('amp_approvals', ['status']);
    await qi.addIndex('amp_exam_entries', ['examId', 'normalizedName']);
    await db.query('INSERT INTO amp_migrations (name, appliedAt) VALUES (:name, :appliedAt)', { replacements: { name, appliedAt: new Date() } });
    console.log(`Migración aplicada: ${name}`);
  } else console.log(`Migración ya aplicada: ${name}`);
  const second = '002_one_coupon_per_contact';
  if (!done.has(second)) {
    await qi.addIndex('amp_coupons', ['contactId'], { unique: true, name: 'amp_coupons_contact_unique' });
    await db.query('INSERT INTO amp_migrations (name, appliedAt) VALUES (:name, :appliedAt)', { replacements: { name: second, appliedAt: new Date() } });
    console.log(`Migración aplicada: ${second}`);
  }
  const third = '003_academic_weekly_and_stage_date';
  if (!done.has(third)) {
    await qi.createTable('dm_academic_weekly', clonar(specs.dm_academic_weekly));
    await qi.addIndex('dm_academic_weekly', ['contactId', 'weekStart']);
    await qi.addColumn('dm_contacts', 'stageChangedAt', clonar({ x: specs.dm_contacts.stageChangedAt }).x as any);
    await db.query('INSERT INTO amp_migrations (name, appliedAt) VALUES (:name, :appliedAt)', { replacements: { name: third, appliedAt: new Date() } });
    console.log(`Migración aplicada: ${third}`);
  }
  const fourth = '004_message_recipient';
  if (!done.has(fourth)) {
    await qi.addColumn('amp_messages', 'recipientKind', { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'STUDENT' });
    await db.query('INSERT INTO amp_migrations (name, appliedAt) VALUES (:name, :appliedAt)', { replacements: { name: fourth, appliedAt: new Date() } });
    console.log(`Migración aplicada: ${fourth}`);
  }
  const fifth = '005_contact_stage_state';
  if (!done.has(fifth)) {
    await qi.createTable('amp_contact_state', clonar(specs.amp_contact_state));
    await db.query('INSERT INTO amp_migrations (name, appliedAt) VALUES (:name, :appliedAt)', { replacements: { name: fifth, appliedAt: new Date() } });
    console.log(`Migración aplicada: ${fifth}`);
  }
  const sixth = '006_conversation_radar';
  if (!done.has(sixth)) {
    await qi.createTable('amp_insights', clonar(specs.amp_insights));
    await qi.addIndex('amp_insights', ['contactId', 'status']);
    await qi.addIndex('amp_insights', ['status', 'alert', 'createdAt']);
    await db.query('INSERT INTO amp_migrations (name, appliedAt) VALUES (:name, :appliedAt)', { replacements: { name: sixth, appliedAt: new Date() } });
    console.log(`Migración aplicada: ${sixth}`);
  }
  const seventh = '007_inbound_triage';
  if (!done.has(seventh)) {
    if (!('replyToId' in await qi.describeTable('amp_messages'))) await qi.addColumn('amp_messages', 'replyToId', clonar({ x: specs.amp_messages.replyToId }).x as any);
    await qi.createTable('amp_inbound_triage', clonar(specs.amp_inbound_triage));
    await qi.addIndex('amp_inbound_triage', ['contactId', 'createdAt']);
    await db.query('INSERT INTO amp_migrations (name, appliedAt) VALUES (:name, :appliedAt)', { replacements: { name: seventh, appliedAt: new Date() } });
    console.log(`Migración aplicada: ${seventh}`);
  }
  const eighth = '008_buyer_lead_agent';
  if (!done.has(eighth)) {
    for (const table of ['amp_buyer_notifications', 'amp_buyer_runs', 'amp_buyer_proposals']) await qi.createTable(table, clonar(specs[table]));
    await qi.addIndex('amp_buyer_notifications', ['occurredAt']);
    await qi.addIndex('amp_buyer_notifications', ['receivedAt']);
    await qi.addIndex('amp_buyer_runs', ['status', 'createdAt']);
    await qi.addIndex('amp_buyer_runs', ['activity', 'createdAt']);
    await qi.addIndex('amp_buyer_proposals', ['runId']);
    await qi.addIndex('amp_buyer_proposals', ['status', 'activity']);
    await db.query('INSERT INTO amp_migrations (name, appliedAt) VALUES (:name, :appliedAt)', { replacements: { name: eighth, appliedAt: new Date() } });
    console.log(`Migración aplicada: ${eighth}`);
  }
  const ninth = '009_repair_shared_attribute_columns';
  if (!done.has(ninth)) {
    // Causa: Sequelize anota `field` en las definiciones compartidas del esquema (text, date, number, createdAt) al crear tablas; en bases creadas antes
    // de la corrección faltan columnas o quedaron con otro nombre. Aquí solo se AÑADEN las que falten (nullables; sin borrar ni renombrar nada).
    for (const [table, attributes] of Object.entries(specs)) {
      const actuales = await qi.describeTable(table);
      for (const [column, definition] of Object.entries(clonar(attributes))) {
        if (column in actuales) continue;
        await qi.addColumn(table, column, { ...(definition as object), allowNull: true, primaryKey: false, autoIncrement: false } as any);
        console.log(`Columna añadida: ${table}.${column}`);
      }
    }
    await db.query('INSERT INTO amp_migrations (name, appliedAt) VALUES (:name, :appliedAt)', { replacements: { name: ninth, appliedAt: new Date() } });
    console.log(`Migración aplicada: ${ninth}`);
  }
  const tenth = '010_buyer_rules';
  if (!done.has(tenth)) {
    // Reglas de negocio variables y avisos de alerta. Idempotente: crea cada tabla/índice solo si falta y la siembra no toca reglas existentes.
    const existentes = new Set((await qi.showAllTables()).map(table => String(typeof table === 'string' ? table : (table as any).tableName).toLowerCase()));
    for (const table of ['amp_buyer_rules', 'amp_buyer_alerts']) if (!existentes.has(table)) await qi.createTable(table, clonar(specs[table]));
    const indices = (tabla: string) => qi.showIndex(tabla).then(lista => new Set((lista as any[]).map(i => String(i.name).toLowerCase())));
    const deRegla = await indices('amp_buyer_rules');
    if (!deRegla.has('amp_buyer_rules_category')) await qi.addIndex('amp_buyer_rules', ['category'], { name: 'amp_buyer_rules_category' });
    const deAviso = await indices('amp_buyer_alerts');
    if (!deAviso.has('amp_buyer_alerts_rule_day')) await qi.addIndex('amp_buyer_alerts', ['ruleId', 'dayKey'], { name: 'amp_buyer_alerts_rule_day', unique: true });
    if (!deAviso.has('amp_buyer_alerts_created')) await qi.addIndex('amp_buyer_alerts', ['createdAt'], { name: 'amp_buyer_alerts_created' });
    const creadas = await sembrarReglas();
    await db.query('INSERT INTO amp_migrations (name, appliedAt) VALUES (:name, :appliedAt)', { replacements: { name: tenth, appliedAt: new Date() } });
    console.log(`Migración aplicada: ${tenth} (${creadas} reglas de sistema sembradas)`);
  }
  const eleventh = '011_buyer_run_progress';
  if (!done.has(eleventh)) {
    // Progreso visible de la ejecución: solo se AÑADEN las columnas que falten (nullables; nada se borra).
    const actuales = await qi.describeTable('amp_buyer_runs');
    for (const column of ['step', 'stepStartedAt', 'log', 'updatedAt']) {
      if (column in actuales) continue;
      await qi.addColumn('amp_buyer_runs', column, { ...(clonar({ x: specs.amp_buyer_runs[column] }).x as object), allowNull: true } as any);
      console.log(`Columna añadida: amp_buyer_runs.${column}`);
    }
    await db.query('INSERT INTO amp_migrations (name, appliedAt) VALUES (:name, :appliedAt)', { replacements: { name: eleventh, appliedAt: new Date() } });
    console.log(`Migración aplicada: ${eleventh}`);
  }
  const twelfth = '012_settings_created_at_default';
  if (!done.has(twelfth)) {
    // Causa: en bases creadas antes de la corrección del esquema compartido, amp_settings conserva una columna `createdAt` NOT NULL sin valor por defecto
    // (el modelo la llama updatedAt), y todo INSERT de un ajuste (ai, followup, buyer_agent, worker_heartbeat) fallaba. Solo se añade el DEFAULT: no cambia ni borra datos.
    if (db.getDialect() === 'mssql') {
      const [columnas] = await db.query("SELECT COLUMN_DEFAULT AS valor FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'amp_settings' AND COLUMN_NAME = 'createdAt'");
      if ((columnas as any[]).length && !(columnas as any[])[0].valor) {
        await db.query('ALTER TABLE amp_settings ADD CONSTRAINT DF_amp_settings_createdAt DEFAULT SYSDATETIMEOFFSET() FOR createdAt');
        console.log('Valor por defecto añadido: amp_settings.createdAt');
      }
    }
    await db.query('INSERT INTO amp_migrations (name, appliedAt) VALUES (:name, :appliedAt)', { replacements: { name: twelfth, appliedAt: new Date() } });
    console.log(`Migración aplicada: ${twelfth}`);
  }
  await db.close();
}
main().catch(error => { console.error(error); process.exit(1); });
