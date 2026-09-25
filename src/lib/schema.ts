import { DataTypes, type ModelAttributes } from 'sequelize';

const id = { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true };
const str = (length = 255) => ({ type: DataTypes.STRING(length), allowNull: true });
const req = (length = 255) => ({ type: DataTypes.STRING(length), allowNull: false });
const date = { type: DataTypes.DATE, allowNull: true };
const bool = (value = false) => ({ type: DataTypes.BOOLEAN, allowNull: false, defaultValue: value });
const number = { type: DataTypes.FLOAT, allowNull: true };
const text = { type: DataTypes.TEXT, allowNull: true };
const createdAt = { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW };

export const specs: Record<string, ModelAttributes> = {
  dm_funnel_daily: {
    id, snapshotDate: { type: DataTypes.DATEONLY, allowNull: false, unique: true }, universe: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    buyers: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, leads: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    payers: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, customers: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    turned: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, reactivated: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    revenue: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 }, createdAt
  },
  dm_academic_weekly: {
    id, contactId: { type: DataTypes.INTEGER, allowNull: false }, weekStart: { type: DataTypes.DATEONLY, allowNull: false },
    activitiesCompleted: number, activitiesPlanned: number, score: number, simulations: number,
    missingCourses: text, createdAt
  },
  dm_contacts: {
    id, sourceKey: { ...req(120), unique: true }, stage: req(20), fullName: req(200),
    email: str(200), phone: str(40), university: str(120), career: str(120),
    accountType: str(30), guardianName: str(200), guardianEmail: str(200), guardianPhone: str(40),
    sourceChannel: str(40), interestChannel: str(40), plan: str(80), paymentStatus: str(40),
    admissionStatus: str(30), candidateNumber: str(40), academicStatus: str(40),
    examDate: date, renewalAt: date, lastActivityAt: date, sourceUpdatedAt: date, stageChangedAt: date,
    activityDays: number, progress: number, streakDays: number, score: number,
    missingCourses: text, notes: text, consentWhatsapp: bool(), consentEmail: bool(),
    guardianConsent: bool(), contactPaused: bool(), createdAt
  },
  amp_contact_state: {
    id, contactId: { type: DataTypes.INTEGER, allowNull: false, unique: true }, stage: req(20),
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }, sourceUpdatedAt: date, createdAt
  },
  amp_users: {
    id, email: { ...req(200), unique: true }, name: req(120), passwordHash: req(255),
    role: req(30), active: bool(true), createdAt
  },
  amp_settings: {
    id, key: { ...req(100), unique: true }, value: text, updatedAt: createdAt
  },
  amp_overrides: {
    id, contactId: { type: DataTypes.INTEGER, allowNull: false }, field: req(80), value: text,
    confidence: number, source: req(40), actorId: str(80), reason: text, createdAt
  },
  amp_events: {
    id, contactId: { type: DataTypes.INTEGER, allowNull: true }, type: req(80), actorType: req(20),
    actorId: str(80), summary: req(500), detail: text, createdAt
  },
  amp_messages: {
    id, contactId: { type: DataTypes.INTEGER, allowNull: false }, channel: req(20),
    direction: req(20), body: { type: DataTypes.TEXT, allowNull: false },
    status: req(30), senderType: req(20), senderId: str(80), recipientKind: req(20), externalId: str(160),
    replyToId: { type: DataTypes.INTEGER, allowNull: true }, createdAt
  },
  amp_jobs: {
    id, contactId: { type: DataTypes.INTEGER, allowNull: true }, kind: req(50),
    payload: text, status: req(20), runAt: { type: DataTypes.DATE, allowNull: false },
    leaseUntil: date, attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    dedupeKey: { ...str(180), unique: true }, lastError: text, createdAt
  },
  amp_approvals: {
    id, contactId: { type: DataTypes.INTEGER, allowNull: false }, kind: req(40),
    status: req(20), payload: { type: DataTypes.TEXT, allowNull: false }, reason: text,
    requestedBy: req(80), decidedBy: str(80), decidedAt: date, createdAt
  },
  amp_campaigns: {
    id, name: req(150), stage: req(20), channel: req(20), template: { type: DataTypes.TEXT, allowNull: false },
    offerType: str(40), discountPercent: number, status: req(20), createdBy: req(80),
    approvedBy: str(80), approvedAt: date, startsAt: date, endsAt: date, createdAt
  },
  amp_coupons: {
    id, code: { ...req(40), unique: true }, contactId: { type: DataTypes.INTEGER, allowNull: false },
    approvalId: { type: DataTypes.INTEGER, allowNull: true }, discountPercent: number,
    scope: req(30), usedAt: date, expiresAt: date, createdAt
  },
  amp_exams: {
    id, name: req(200), examDate: { type: DataTypes.DATE, allowNull: false },
    filename: req(200), uploadedBy: req(80), createdAt
  },
  amp_exam_entries: {
    id, examId: { type: DataTypes.INTEGER, allowNull: false }, position: { type: DataTypes.INTEGER, allowNull: false },
    candidateNumber: str(40), fullName: req(200), normalizedName: req(200),
    career: str(120), score: number, result: req(20), nonAdmittedRank: { type: DataTypes.INTEGER, allowNull: true },
    matchedContactId: { type: DataTypes.INTEGER, allowNull: true }, matchConfidence: number, createdAt
  }
};
