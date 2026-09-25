export type Stage = 'BUYER' | 'LEAD' | 'PAYER' | 'CUSTOMER' | 'TURNED';
export type Role = 'ADMIN' | 'DIRECCION' | 'OPERADOR';
export type Channel = 'WHATSAPP' | 'EMAIL';
export type Contact = {
  id: number; sourceKey: string; stage: Stage; fullName: string; email: string | null; phone: string | null;
  university: string | null; career: string | null; accountType: string | null;
  guardianName: string | null; guardianEmail: string | null; guardianPhone: string | null;
  sourceChannel: string | null; interestChannel: string | null; plan: string | null;
  paymentStatus: string | null; admissionStatus: string | null; candidateNumber: string | null;
  academicStatus: string | null; examDate: string | null; renewalAt: string | null;
  lastActivityAt: string | null; stageChangedAt: string | null; sourceUpdatedAt: string | null; activityDays: number | null; progress: number | null;
  streakDays: number | null; score: number | null; missingCourses: string | null;
  notes: string | null; consentWhatsapp: boolean; consentEmail: boolean;
  guardianConsent: boolean; contactPaused: boolean; createdAt: string;
  overrides?: Record<string, string>;
};
export type User = { id: number; email: string; name: string; role: Role };
export const stages: Stage[] = ['BUYER', 'LEAD', 'PAYER', 'CUSTOMER', 'TURNED'];
export const labels: Record<Stage, string> = {
  BUYER: 'Buyers', LEAD: 'Leads', PAYER: 'Payers', CUSTOMER: 'Customers', TURNED: 'Turned'
};
export const agents: Record<Stage, string> = {
  BUYER: 'Agente de Marketing', LEAD: 'Agente Negociador', PAYER: 'Agente de Cobranza',
  CUSTOMER: 'Agente Académico', TURNED: 'Agente de Post-venta'
};
