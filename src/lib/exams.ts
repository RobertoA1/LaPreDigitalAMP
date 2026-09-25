import Fuse from 'fuse.js';
import { plainMany, tables } from './db';
import { event } from './contacts';

type ParsedEntry = { position: number; candidateNumber: string; fullName: string; normalizedName: string; score: number; career: string; result: 'ADMITTED' | 'NOT_ADMITTED'; nonAdmittedRank: number | null };
export function normalizeName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function parseExamFile(buffer: Buffer): ParsedEntry[] {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  const raw = utf8.includes('\ufffd') ? new TextDecoder('windows-1252').decode(buffer) : utf8;
  const rows: ParsedEntry[] = [];
  for (const line of raw.replace(/\f/g, '\n').split(/\r\n|\n|\r/)) {
    const m = line.match(/^\s*(\d{1,4})\s+(\d{5,10})\s+(.+?)\s+(\d+(?:\.\d+)?)\s{2,}(.+?)\s{2,}(NO INGRESA|INGRESA)\s*$/i);
    if (!m) continue;
    rows.push({ position: Number(m[1]), candidateNumber: m[2], fullName: m[3].trim(), normalizedName: normalizeName(m[3]), score: Number(m[4]), career: m[5].trim(), result: m[6].toUpperCase() === 'INGRESA' ? 'ADMITTED' : 'NOT_ADMITTED', nonAdmittedRank: null });
  }
  if (rows.length === 0) throw new Error('No se encontraron filas de resultados compatibles con el formato adjunto.');
  const byCareer = new Map<string, ParsedEntry[]>();
  for (const row of rows) if (row.result === 'NOT_ADMITTED') byCareer.set(row.career, [...(byCareer.get(row.career) || []), row]);
  for (const group of byCareer.values()) group.sort((a, b) => b.score - a.score || a.position - b.position).forEach((row, i) => row.nonAdmittedRank = i + 1);
  return rows;
}

export async function importExam(name: string, examDate: Date, filename: string, buffer: Buffer, userId: number) {
  const entries = parseExamFile(buffer);
  const db = tables();
  const contacts = plainMany<any>(await db.dm_contacts.findAll());
  const indexed = contacts.map(c => ({ id: c.id, fullName: normalizeName(c.fullName), tokenKey: normalizeName(c.fullName).split(' ').sort().join(' '), candidateNumber: c.candidateNumber }));
  const fuse = new Fuse(indexed, { keys: ['fullName', 'tokenKey'], includeScore: true, threshold: 0.25 });
  const exam = await db.amp_exams.create({ name, examDate, filename, uploadedBy: String(userId), createdAt: new Date() });
  const examId = Number(exam.get('id'));
  let matched = 0, review = 0, admitted = 0, priority = 0;
  for (const row of entries) {
    const direct = contacts.filter(c => c.candidateNumber && c.candidateNumber === row.candidateNumber);
    const tokenKey = row.normalizedName.split(' ').sort().join(' ');
    const exactTokens = indexed.filter(c => c.tokenKey === tokenKey);
    const candidates = fuse.search(tokenKey, { limit: 2 });
    let contactId: number | null = null;
    let confidence = 0;
    if (direct.length === 1) { contactId = direct[0].id; confidence = 1; }
    else if (exactTokens.length === 1) { contactId = exactTokens[0].id; confidence = 1; }
    else if (candidates.length && (candidates[0].score || 0) <= 0.12 && (!candidates[1] || (candidates[1].score || 1) - (candidates[0].score || 0) >= 0.08)) {
      contactId = candidates[0].item.id;
      confidence = 1 - (candidates[0].score || 0);
    } else if (candidates.length && (candidates[0].score || 1) <= 0.25) { review++; confidence = 1 - (candidates[0].score || 0); }
    await db.amp_exam_entries.create({ examId, ...row, matchedContactId: contactId, matchConfidence: confidence, createdAt: new Date() });
    if (!contactId) continue;
    matched++;
    const person = contacts.find(c => c.id === contactId);
    if (row.result === 'ADMITTED') {
      admitted++;
      await db.amp_overrides.create({ contactId, field: 'admissionStatus', value: 'ADMITTED', confidence, source: 'EXAM', actorId: String(userId), reason: `${name}: ${row.fullName}`, createdAt: new Date() });
      await event(contactId, 'ADMISSION', 'Ingreso a la universidad confirmado; campañas de recuperación detenidas.', 'SYSTEM', String(userId), { examId, confidence });
    } else if (row.nonAdmittedRank && row.nonAdmittedRank <= 10 && person?.stage === 'BUYER') {
      priority++;
      await db.amp_approvals.create({ contactId, kind: 'SCHOLARSHIP_REVIEW', status: 'PENDING', payload: JSON.stringify({ examId, rank: row.nonAdmittedRank, career: row.career, score: row.score }), reason: 'Buyer entre los 10 primeros no ingresantes de su carrera', requestedBy: 'SYSTEM', createdAt: new Date() });
      await event(contactId, 'PRIORITY', `Buyer prioritario: puesto ${row.nonAdmittedRank} entre no ingresantes de ${row.career}.`, 'SYSTEM', String(userId));
    }
  }
  await event(null, 'EXAM_IMPORT', `${name}: ${entries.length} resultados, ${matched} coincidencias, ${review} para revisar.`, 'OPERATOR', String(userId));
  return { examId, parsed: entries.length, matched, review, admitted, priority };
}

export async function confirmExamMatch(entryId: number, contactId: number, actorId: number, reason: string) {
  const db = tables();
  const entry = (await db.amp_exam_entries.findByPk(entryId));
  const c = await db.dm_contacts.findByPk(contactId);
  if (!entry || !c || entry.get('matchedContactId')) throw new Error('Resultado o contacto no disponible para revisión');
  const [updated] = await db.amp_exam_entries.update({ matchedContactId: contactId, matchConfidence: 1 }, { where: { id: entryId, matchedContactId: null } });
  if (!updated) throw new Error('La coincidencia ya fue resuelta');
  const result = String(entry.get('result'));
  if (result === 'ADMITTED') {
    await db.amp_overrides.create({ contactId, field: 'admissionStatus', value: 'ADMITTED', confidence: 1, source: 'EXAM_MANUAL', actorId: String(actorId), reason, createdAt: new Date() });
    await event(contactId, 'ADMISSION', 'Ingreso confirmado por alta dirección al revisar el TXT.', 'OPERATOR', String(actorId), { entryId, reason });
  } else if (Number(entry.get('nonAdmittedRank')) <= 10) {
    await db.amp_approvals.create({ contactId, kind: 'SCHOLARSHIP_REVIEW', status: 'PENDING', payload: JSON.stringify({ entryId, rank: entry.get('nonAdmittedRank'), career: entry.get('career') }), reason, requestedBy: String(actorId), createdAt: new Date() });
    await event(contactId, 'PRIORITY', 'Coincidencia manual con top 10 no ingresantes.', 'OPERATOR', String(actorId), { entryId, reason });
  }
  return { entryId, contactId, result };
}
