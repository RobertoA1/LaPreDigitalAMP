import { DataTypes } from 'sequelize';
import { getDb } from '../src/lib/db';
import { specs } from '../src/lib/schema';

async function main() {
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
      await qi.createTable(table, initial);
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
    await qi.createTable('dm_academic_weekly', specs.dm_academic_weekly);
    await qi.addIndex('dm_academic_weekly', ['contactId', 'weekStart']);
    await qi.addColumn('dm_contacts', 'stageChangedAt', specs.dm_contacts.stageChangedAt);
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
    await qi.createTable('amp_contact_state', specs.amp_contact_state);
    await db.query('INSERT INTO amp_migrations (name, appliedAt) VALUES (:name, :appliedAt)', { replacements: { name: fifth, appliedAt: new Date() } });
    console.log(`Migración aplicada: ${fifth}`);
  }
  const sixth = '006_conversation_radar';
  if (!done.has(sixth)) {
    await qi.createTable('amp_insights', specs.amp_insights);
    await qi.addIndex('amp_insights', ['contactId', 'status']);
    await qi.addIndex('amp_insights', ['status', 'alert', 'createdAt']);
    await db.query('INSERT INTO amp_migrations (name, appliedAt) VALUES (:name, :appliedAt)', { replacements: { name: sixth, appliedAt: new Date() } });
    console.log(`Migración aplicada: ${sixth}`);
  }
  const seventh = '007_inbound_triage';
  if (!done.has(seventh)) {
    if (!('replyToId' in await qi.describeTable('amp_messages'))) await qi.addColumn('amp_messages', 'replyToId', specs.amp_messages.replyToId);
    await qi.createTable('amp_inbound_triage', specs.amp_inbound_triage);
    await qi.addIndex('amp_inbound_triage', ['contactId', 'createdAt']);
    await db.query('INSERT INTO amp_migrations (name, appliedAt) VALUES (:name, :appliedAt)', { replacements: { name: seventh, appliedAt: new Date() } });
    console.log(`Migración aplicada: ${seventh}`);
  }
  await db.close();
}
main().catch(error => { console.error(error); process.exit(1); });
