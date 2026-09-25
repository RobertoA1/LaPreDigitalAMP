import bcrypt from 'bcryptjs';
import { plain, tables, getDb } from '../src/lib/db';
import { event } from '../src/lib/contacts';

async function main() {
  if (process.env.DEMO_MODE !== 'true') throw new Error('La carga demo solo funciona con DEMO_MODE=true');
  await getDb().authenticate();
  const db = tables();
  const users = [
    ['admin@lapredigital.local', 'Administración', 'ADMIN'],
    ['direccion@lapredigital.local', 'Alta dirección', 'DIRECCION'],
    ['operador@lapredigital.local', 'Operador', 'OPERADOR']
  ];
  for (const [email, name, role] of users) {
    if (!(await db.amp_users.findOne({ where: { email } }))) await db.amp_users.create({ email, name, role, passwordHash: await bcrypt.hash('Demo1234!', 12), active: true, createdAt: new Date() });
  }
  const samples = [
    ['BUYER', 'Valeria Salazar Torres', 'Medicina', 'WHATSAPP', 'Explora UNT', 0, 0],
    ['BUYER', 'Diego Mendoza Ruiz', 'Derecho', 'EMAIL', 'Explora UNT', 0, 0],
    ['BUYER', 'Camila Paredes León', 'Ingeniería Industrial', 'WHATSAPP', 'Explora UNT', 0, 0],
    ['BUYER', 'Luis Herrera Castro', 'Arquitectura', 'EMAIL', 'Explora UNT', 0, 0],
    ['LEAD', 'Lucía Fernández Rojas', 'Medicina', 'WHATSAPP', 'Meta UNT', 3, 14],
    ['LEAD', 'Andrés Vega Díaz', 'Ingeniería Civil', 'EMAIL', 'Ruta UNT', 1, 8],
    ['LEAD', 'Sofía Chávez Morales', 'Derecho', 'WHATSAPP', 'Meta UNT Plus', 5, 26],
    ['LEAD', 'Renato Campos López', 'Psicología', 'EMAIL', 'Meta UNT', 2, 18],
    ['PAYER', 'Mariana Torres Silva', 'Medicina', 'WHATSAPP', 'Meta UNT', 6, 32],
    ['PAYER', 'Javier Rodríguez Lara', 'Derecho', 'EMAIL', 'Ruta UNT', 4, 20],
    ['PAYER', 'Paola Navarro Cruz', 'Enfermería', 'WHATSAPP', 'Meta UNT Plus', 8, 42],
    ['CUSTOMER', 'Daniela García Ríos', 'Medicina', 'EMAIL', 'Meta UNT Plus', 10, 78],
    ['CUSTOMER', 'Fernando Castillo Pérez', 'Ingeniería de Sistemas', 'WHATSAPP', 'Meta UNT', 7, 62],
    ['CUSTOMER', 'Ana María Flores Ortiz', 'Administración', 'EMAIL', 'Ruta UNT', 5, 54],
    ['CUSTOMER', 'Gabriel Ruiz Medina', 'Derecho', 'WHATSAPP', 'Meta UNT', 9, 71],
    ['TURNED', 'Elena Morales Ponce', 'Psicología', 'WHATSAPP', 'Meta UNT', 1, 29],
    ['TURNED', 'Carlos Vargas Núñez', 'Medicina', 'EMAIL', 'Ruta UNT', 2, 36],
    ['TURNED', 'Patricia Gómez Vera', 'Ingeniería Civil', 'WHATSAPP', 'Meta UNT', 0, 21]
  ] as const;
  for (let i = 0; i < samples.length; i++) {
    const [stage, fullName, career, channel, plan, streakDays, progress] = samples[i];
    const sourceKey = `DEMO-${String(i + 1).padStart(3, '0')}`;
    if (await db.dm_contacts.findOne({ where: { sourceKey } })) continue;
    const renewalAt = (stage === 'PAYER' || stage === 'CUSTOMER') ? new Date(Date.now() + ([7, 3, 1][i % 3]) * 86400000) : null;
    const row = await db.dm_contacts.create({ sourceKey, stage, fullName, email: `demo${i + 1}@example.test`, phone: `5190000${String(i + 1).padStart(4, '0')}`, university: 'Universidad Nacional de Trujillo', career, accountType: 'ESTUDIANTE', guardianName: i % 2 ? 'Apoderado de ejemplo' : null, guardianEmail: i % 2 ? `apoderado${i}@example.test` : null, sourceChannel: i % 3 ? 'Instagram' : 'TikTok', interestChannel: channel, plan, paymentStatus: 'ACTIVE', admissionStatus: 'UNKNOWN', academicStatus: 'EN_PREPARACION', activityDays: i + 1, streakDays, progress, score: 50 + i, missingCourses: i % 2 ? 'Matemática' : 'Comunicación', notes: 'Registro sintético para demostración.', consentWhatsapp: true, consentEmail: true, guardianConsent: true, contactPaused: false, renewalAt, stageChangedAt: new Date(Date.now() - (10 - i % 8) * 86400000), lastActivityAt: new Date(Date.now() - (i % 8) * 86400000), createdAt: new Date(Date.now() - (20 - i) * 86400000) });
    const id = Number(row.get('id'));
    await event(id, 'STAGE', `Ingreso a etapa ${stage} desde datamart de demostración.`, 'SYSTEM', 'seed');
    if (stage === 'CUSTOMER') {
      for (const [weeksAgo, delta] of [[2, -7], [1, 0]] as const) await db.dm_academic_weekly.create({ contactId: id, weekStart: new Date(Date.now() - weeksAgo * 7 * 86400000).toISOString().slice(0, 10), activitiesCompleted: Math.max(1, 6 + delta + i % 4), activitiesPlanned: 10, score: 50 + i + delta, simulations: weeksAgo === 1 ? 2 : 1, missingCourses: i % 2 ? 'Matemática' : 'Comunicación', createdAt: new Date() });
    }
    if (stage === 'LEAD' || stage === 'TURNED') await db.amp_messages.create({ contactId: id, channel, direction: 'IN', body: stage === 'LEAD' ? 'Me interesa el servicio. ¿Cuánto cuesta? ¿Hay descuento?' : 'Dejé de usar el servicio por falta de tiempo.', status: 'RECEIVED', senderType: 'CONTACT', senderId: String(id), recipientKind: 'STUDENT', createdAt: new Date() });
  }
  for (const row of await db.dm_contacts.findAll({ where: { stage: 'CUSTOMER' } })) {
    const contactId = Number(row.get('id'));
    if (await db.dm_academic_weekly.count({ where: { contactId } })) continue;
    for (const [weeksAgo, score] of [[2, 61], [1, 68]] as const) await db.dm_academic_weekly.create({ contactId, weekStart: new Date(Date.now() - weeksAgo * 7 * 86400000).toISOString().slice(0, 10), activitiesCompleted: weeksAgo === 1 ? 8 : 6, activitiesPlanned: 10, score, simulations: weeksAgo === 1 ? 2 : 1, missingCourses: 'Matemática', createdAt: new Date() });
  }
  if (!(await db.dm_funnel_daily.findOne())) await db.dm_funnel_daily.create({ snapshotDate: new Date().toISOString().slice(0, 10), universe: 80, buyers: 18, leads: 14, payers: 10, customers: 7, turned: 3, reactivated: 1, revenue: 1547.30, createdAt: new Date() });
  if (!(await db.amp_settings.findOne({ where: { key: 'ai' } }))) await db.amp_settings.create({ key: 'ai', value: JSON.stringify({ provider: 'OPENAI', model: 'gpt-5-nano' }), updatedAt: new Date() });
  console.log('Demo cargada. Usuarios: admin@lapredigital.local, direccion@lapredigital.local y operador@lapredigital.local. Contraseña: Demo1234!');
  await getDb().close();
}
main().catch(error => { console.error(error); process.exit(1); });
