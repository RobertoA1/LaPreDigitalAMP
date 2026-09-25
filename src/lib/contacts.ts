import { Op } from 'sequelize';
import { plain, plainMany, tables } from './db';
import type { Contact, Stage } from './types';

export async function contacts(stage?: Stage, search?: string) {
  const where: Record<string, unknown> = {};
  if (stage) where.stage = stage;
  if (search) where.fullName = { [Op.like]: `%${search.replace(/[%_]/g, '')}%` };
  return plainMany<Contact>(await tables().dm_contacts.findAll({ where, order: [['createdAt', 'DESC']], limit: 250 }));
}
export async function contact(id: number): Promise<Contact | null> {
  const base = plain<Contact>(await tables().dm_contacts.findByPk(id));
  if (!base) return null;
  const overrides = plainMany<any>(await tables().amp_overrides.findAll({ where: { contactId: id }, order: [['createdAt', 'ASC']] }));
  base.overrides = {};
  for (const item of overrides) {
    base.overrides[item.field] = item.value;
    if (['email', 'phone', 'career', 'interestChannel', 'notes', 'guardianEmail', 'guardianPhone', 'admissionStatus', 'contactPaused'].includes(item.field)) (base as any)[item.field] = item.field === 'contactPaused' ? item.value === 'true' : item.value;
  }
  return base;
}
export async function contactHistory(id: number) {
  const db = tables();
  const [events, messages, approvals] = await Promise.all([
    db.amp_events.findAll({ where: { contactId: id }, order: [['createdAt', 'DESC']], limit: 100 }),
    db.amp_messages.findAll({ where: { contactId: id }, order: [['createdAt', 'ASC']], limit: 200 }),
    db.amp_approvals.findAll({ where: { contactId: id }, order: [['createdAt', 'DESC']], limit: 100 })
  ]);
  return { events: plainMany(events), messages: plainMany(messages), approvals: plainMany(approvals) };
}
export async function event(contactId: number | null, type: string, summary: string, actorType: string, actorId?: string, detail?: unknown) {
  return tables().amp_events.create({ contactId, type, summary, actorType, actorId, detail: detail ? JSON.stringify(detail) : null, createdAt: new Date() });
}
export async function recommend(c: Contact) {
  const recommendations: string[] = [];
  if (c.stage === 'BUYER') {
    recommendations.push('Adquisición: invitar a conocer la prueba Explora UNT y registrar señales de intención.');
    if (!c.interestChannel) recommendations.push('Confirmar el medio de comunicación establecido antes de contactar.');
  }
  if (c.stage === 'LEAD') {
    recommendations.push('Activación: resolver dudas sobre el plan y proponer un siguiente paso concreto.');
    if (!c.career) recommendations.push('Completar la carrera objetivo para personalizar la propuesta.');
  }
  if (c.stage === 'PAYER') {
    recommendations.push('Ingresos: acompañar el primer periodo y preparar la renovación.');
    if (c.renewalAt) recommendations.push(`Vencimiento registrado: ${new Date(c.renewalAt).toLocaleDateString('es-PE')}.`);
  }
  if (c.stage === 'CUSTOMER') {
    recommendations.push('Retención: revisar progreso, racha, cursos pendientes y experiencia del servicio.');
    if ((c.streakDays || 0) >= 5) recommendations.push('Reconocer la constancia del estudiante.');
  }
  if (c.stage === 'TURNED') {
    recommendations.push('Reactivación: consultar el motivo de salida antes de presentar una propuesta de retorno.');
    if (c.admissionStatus === 'ADMITTED') recommendations.splice(0, recommendations.length, 'Ingresó a la universidad: detener la recuperación comercial.');
  }
  return recommendations;
}
