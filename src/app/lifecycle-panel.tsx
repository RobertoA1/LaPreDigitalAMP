'use client';
import { useState } from 'react';
import type { lifecycleAssessment } from '@/lib/lifecycle-policy';

type Assessment = ReturnType<typeof lifecycleAssessment>;
export default function LifecyclePanel({ assessment: a, onResolve, onDraft, guardianAllowed }: { assessment: Assessment; onResolve: (reason: string) => Promise<boolean>; onDraft: (body: string, guardian: boolean) => void; guardianAllowed: boolean }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return <section className="panel">
    <p className="eyebrow">{a.proposal ? 'PROPUESTA · APOYO A LA REACTIVACIÓN' : 'FIDELIZACIÓN · INFORME 6.1–6.4'}</p>
    <h3>{a.proposal ? 'Comprender la baja y acompañar el retorno' : 'Acompañamiento y continuidad'}</h3>
    <p>{a.recommendation}</p>
    <ul>{a.evidence.map((item, i) => <li key={i}>{item}</li>)}</ul>
    <details><summary>Datos que aún no permiten una conclusión</summary><ul>{a.limits.map(item => <li key={item}>{item}</li>)}</ul></details>
    <p className="muted">Los textos son borradores. Copiarlos al chat no realiza un envío. El historial indica qué mensajes fueron enviados o simulados.</p>
    <div className="insight-actions">
      {a.draft && <button className="button secondary" onClick={() => onDraft(a.draft!, false)}>Revisar borrador para estudiante</button>}
      {!a.proposal && !a.blocked && !a.review && guardianAllowed && <button className="button secondary" onClick={() => onDraft(a.guardianDraft, true)}>Revisar reporte para apoderado</button>}
    </div>
    {a.review && <div className="form-panel">
      <label>Resultado de la atención humana<textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Registra cómo se atendió el caso y por qué puede retomarse el seguimiento."/></label>
      <p className="muted">Resolver habilita nuevamente la programación automática. No levanta una pausa del contacto ni cambia pagos o etapas.</p>
      <button className="button secondary" disabled={busy || reason.trim().length < 10} onClick={async () => { setBusy(true); try { if (await onResolve(reason)) setReason(''); } finally { setBusy(false); } }}>Registrar resolución humana</button>
    </div>}
  </section>;
}
