export type PlanCapabilities = {
  known: boolean;
  adaptivePersonalization: boolean;
  simulations: boolean;
  punctualReviews: boolean;
  guardianReports: boolean;
  advancedAlerts: boolean;
  prioritySupport: boolean;
};

const emptyCapabilities: PlanCapabilities = {
  known: false,
  adaptivePersonalization: false,
  simulations: false,
  punctualReviews: false,
  guardianReports: false,
  advancedAlerts: false,
  prioritySupport: false
};

// This is an entitlement catalog, not a price list. Prices remain owned by
// the academic platform and must never be inferred by an agent.
export function planCapabilities(plan: string | null | undefined): PlanCapabilities {
  const value = (plan || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (value === 'explora unt') return { ...emptyCapabilities, known: true };
  if (value === 'ruta unt') return { ...emptyCapabilities, known: true, punctualReviews: true };
  if (value === 'meta unt') return { ...emptyCapabilities, known: true, adaptivePersonalization: true, simulations: true };
  if (value === 'meta unt plus') return {
    known: true, adaptivePersonalization: true, simulations: true, punctualReviews: false,
    guardianReports: true, advancedAlerts: true, prioritySupport: true
  };
  return { ...emptyCapabilities };
}

export function planSupportAction(plan: string | null | undefined, academic: boolean) {
  const capabilities = planCapabilities(plan);
  if (!capabilities.known) return { type: 'PLAN_REVIEW', state: 'PENDIENTE' as const, reason: 'El plan no coincide con el catálogo vigente disponible.' };
  if (!academic) return { type: 'ACADEMIC_REVIEW', state: 'PROPUESTA' as const, reason: 'La evidencia no requiere una intervención académica específica.' };
  if (capabilities.punctualReviews) return { type: 'PUNCTUAL_REVIEW', state: 'PENDIENTE' as const, reason: 'Ruta UNT permite proponer una revisión puntual; no modifica la ruta automáticamente.' };
  if (capabilities.adaptivePersonalization) return { type: 'ACADEMIC_ROUTE_ADJUSTMENT', state: 'PENDIENTE' as const, reason: 'El componente académico debe validar el ajuste; este agente no modifica la ruta.' };
  return { type: 'ACADEMIC_REVIEW', state: 'PENDIENTE' as const, reason: 'La revisión debe ser derivada al componente académico o a un operador.' };
}
