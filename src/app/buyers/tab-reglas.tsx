'use client';
import { useEffect, useState } from 'react';
import { Lock, Pencil, Plus, Power, RotateCcw, Save, Trash2 } from 'lucide-react';
import { fechaLima, post, type ApiError, type Issue, type Obj } from './api';
import { useBlock, useBuyer } from './hooks';
import RuleForm, { semaforoValido } from './rule-forms';
import { paramsDe, resumenRegla } from './rule-summary';
import { Dialog, Empty, Msg, Section, Spinner, Tag, Toggle } from './ui';

const CATEGORIAS_BASE: Record<string, [string, string]> = {
  SEMAFORO: ['Niveles de los indicadores', 'Desde qué valor un KPI está en rojo, amarillo o verde. Cambiarlos recalcula los semáforos al instante; los valores del KPI no cambian.'],
  MEDICION: ['Cómo se mide', 'Definiciones que calcula el DataMart. Se muestran para que se sepa qué significa cada cifra; no se pueden cambiar desde aquí.'],
  CONTENIDO: ['Contenido de las propuestas', 'Qué puede y qué debe decir una propuesta del agente.'],
  COBERTURA: ['Qué genera el agente', 'Para qué públicos, canales y videos prepara propuestas, y cuándo recomienda mejorar la atribución.'],
  AUTOMATIZACION: ['Programación automática', 'Cuándo se ejecuta solo el agente (solo si la actividad está en modo Automático).'],
  APROBACION: ['Aprobación humana', 'Garantías que no se pueden desactivar.'],
  ALERTA: ['Alertas personalizadas', 'Avisos que tú defines: «si un KPI cumple una condición, entonces avisar o ejecutar al agente».'],
  DIRECTRIZ: ['Directrices para la IA', 'Indicaciones en lenguaje natural que la IA debe respetar en todas sus ejecuciones.']
};

export default function TabReglas() {
  const { puedeEditar, kpis, agent, search, toast } = useBuyer();
  const block = useBlock('buyer/rules', { live: true });
  const [edit, setEdit] = useState<string | null>(null); // id de regla o «nueva:ALERTA» / «nueva:DIRECTRIZ»
  const [pendiente, setPendiente] = useState<null | { tipo: 'eliminar' | 'restaurar' | 'todas'; rule?: Obj }>(null);
  const [ocupado, setOcupado] = useState(false);
  const rules: Obj[] = block.data?.rules || [];
  const canEdit = puedeEditar && block.data?.canEdit !== false;
  const foco = search.get('regla') || '';

  useEffect(() => {
    if (!foco || !rules.length) return;
    const el = document.getElementById(`regla-${foco}`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [foco, rules.length]);

  const despues = (conKpi: boolean) => { block.refresh(); agent.refresh(); if (conKpi) kpis.refresh(); };
  async function ejecutar() {
    if (!pendiente) return;
    setOcupado(true);
    try {
      if (pendiente.tipo === 'eliminar') await post('buyer/rule/delete', { id: pendiente.rule!.id });
      else await post('buyer/rule/restore', pendiente.tipo === 'todas' ? { all: true } : { id: pendiente.rule!.id });
      toast(pendiente.tipo === 'eliminar' ? 'Regla eliminada.' : pendiente.tipo === 'todas' ? 'Todas las reglas de sistema volvieron a su valor de fábrica.' : 'Regla restaurada a su valor de fábrica.');
      setPendiente(null); despues(pendiente.tipo !== 'eliminar');
    } catch (err) { toast(`No se pudo completar: ${(err as Error).message}`); }
    finally { setOcupado(false); }
  }
  async function alternarActiva(r: Obj) {
    try { await post('buyer/rule/save', { id: r.id, category: r.category, params: paramsDe(r), enabled: !r.enabled }); toast(`Regla ${r.enabled ? 'desactivada' : 'activada'}.`); despues(false); }
    catch (err) { toast(`No se pudo cambiar: ${(err as Error).message}`); }
  }

  const m = Msg({ block, what: 'reglas', unavailable: 'El servidor aún no expone las reglas de negocio.' });
  if (m) return <Section eyebrow="REGLAS DE NEGOCIO" title="Reglas">{m}</Section>;
  const categorias: Obj[] = block.data?.categories?.length ? block.data.categories
    : Object.entries(CATEGORIAS_BASE).map(([category, [label, description]]) => ({ category, label, description }));
  const hayCambiadas = rules.some(r => r.origin === 'SISTEMA' && r.isDefault === false);

  return <>
    <section className="panel bp-rules-head">
      <div><p className="eyebrow">REGLAS DE NEGOCIO</p><h3>Qué decide el agente y con qué criterios</h3>
        <p className="muted">Cambiar una regla no requiere programar: se aplica a las siguientes ejecuciones y semáforos. Cada cambio queda registrado con su autor y fecha.</p></div>
      <div className="bp-actions">
        {canEdit && <button className="button secondary" disabled={!hayCambiadas} onClick={() => setPendiente({ tipo: 'todas' })}><RotateCcw size={14} /> Restaurar todas</button>}
      </div>
    </section>
    {!canEdit && <p className="bp-readonly" role="note"><Lock size={14} aria-hidden="true" /> Modo solo lectura: solo Administración y Dirección pueden crear, modificar, eliminar o restaurar reglas.</p>}
    {categorias.map(cat => {
      const lista = rules.filter(r => r.category === cat.category);
      const esUsuario = cat.category === 'ALERTA' || cat.category === 'DIRECTRIZ';
      if (!lista.length && !esUsuario) return null;
      const base = CATEGORIAS_BASE[cat.category];
      const nueva = `nueva:${cat.category}`;
      return <Section key={cat.category} id={`cat-${cat.category}`} eyebrow={cat.category} title={cat.label || base?.[0] || cat.category} right={<Tag tone="light">{lista.length}</Tag>}>
        <p className="muted bp-cat-desc">{cat.description || base?.[1]}</p>
        <div className="bp-rules">
          {lista.map(r => <RuleCard key={r.id} rule={r} canEdit={canEdit} abierta={edit === String(r.id)} destacada={foco === r.code}
            kpiActual={r.category === 'SEMAFORO' ? (kpis.data?.kpis || []).find((k: Obj) => k.code === String(r.code).replace(/^SEM_/, '')) : undefined}
            onEdit={() => setEdit(edit === String(r.id) ? null : String(r.id))} onClose={() => setEdit(null)}
            onSaved={() => { setEdit(null); despues(r.category === 'SEMAFORO'); }}
            onToggle={() => alternarActiva(r)} onDelete={() => setPendiente({ tipo: 'eliminar', rule: r })} onRestore={() => setPendiente({ tipo: 'restaurar', rule: r })} />)}
          {!lista.length && edit !== nueva && <Empty>{cat.category === 'ALERTA' ? 'No hay alertas. Crea una para que el agente te avise o se ejecute cuando un KPI se salga de rango.' : 'No hay directrices. Crea una para orientar a la IA.'}</Empty>}
          {edit === nueva && <Editor rule={null} categoria={cat.category} kpiActual={undefined} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); despues(false); }} />}
        </div>
        {esUsuario && canEdit && edit !== nueva && <button className="button primary bp-add" onClick={() => setEdit(nueva)}><Plus size={14} /> {cat.category === 'ALERTA' ? 'Nueva alerta' : 'Nueva directriz'}</button>}
      </Section>;
    })}
    <Dialog open={!!pendiente} onClose={() => setPendiente(null)}
      title={pendiente?.tipo === 'eliminar' ? 'Eliminar regla' : pendiente?.tipo === 'todas' ? 'Restaurar todas las reglas' : 'Restaurar regla'}
      actions={<><button className="button primary" disabled={ocupado} onClick={ejecutar}>{ocupado ? <Spinner /> : pendiente?.tipo === 'eliminar' ? <Trash2 size={14} /> : <RotateCcw size={14} />} {pendiente?.tipo === 'eliminar' ? 'Eliminar' : 'Restaurar'}</button>
        <button className="button secondary" onClick={() => setPendiente(null)}>Cancelar</button></>}>
      {pendiente?.tipo === 'eliminar' && <p>Se eliminará «{pendiente.rule?.name}». Esta acción no se puede deshacer.</p>}
      {pendiente?.tipo === 'restaurar' && <p>«{pendiente.rule?.name}» volverá a su valor de fábrica: <b>{resumenRegla(pendiente.rule!, true)}</b>.</p>}
      {pendiente?.tipo === 'todas' && <p>Todas las reglas de sistema modificadas volverán a su valor de fábrica. Las alertas y directrices creadas por ti no se tocan.</p>}
    </Dialog>
  </>;
}

// ---------------------------------------------------------------------------
// Tarjeta de regla
// ---------------------------------------------------------------------------
function RuleCard({ rule, canEdit, abierta, destacada, kpiActual, onEdit, onClose, onSaved, onToggle, onDelete, onRestore }: {
  rule: Obj; canEdit: boolean; abierta: boolean; destacada: boolean; kpiActual?: Obj;
  onEdit: () => void; onClose: () => void; onSaved: () => void; onToggle: () => void; onDelete: () => void; onRestore: () => void;
}) {
  const usuario = rule.origin === 'USUARIO';
  const cambiada = !usuario && rule.isDefault === false;
  const puedeDesactivar = !rule.locked && rule.category !== 'SEMAFORO' && (usuario || rule.category === 'ALERTA' || rule.category === 'AUTOMATIZACION' || rule.category === 'CONTENIDO' || rule.category === 'COBERTURA');
  const editable = canEdit && !rule.locked;
  return <article id={`regla-${rule.code}`} className={`bp-rule ${rule.enabled ? '' : 'off'} ${destacada ? 'flash' : ''} ${rule.locked ? 'locked' : ''}`}>
    <div className="bp-rule-top">
      <div>
        <h4>{rule.locked && <Lock size={14} aria-label="Bloqueada" />} {rule.name}</h4>
        <div className="bp-prop-tags">
          {rule.locked && <Tag tone="light">Bloqueada</Tag>}
          <Tag tone={rule.enabled ? 'teal' : 'neutral'}>{rule.enabled ? 'Activa' : 'Desactivada'}</Tag>
          <Tag tone={usuario ? 'purple' : 'light'}>{usuario ? 'Creada por ti' : 'De sistema'}</Tag>
          {cambiada && <Tag tone="orange">Personalizada</Tag>}
          {rule.code && !usuario && <code className="bp-code">{rule.code}</code>}
        </div>
      </div>
      {editable && <div className="bp-rule-actions">
        <button className="button secondary" onClick={onEdit} aria-expanded={abierta}><Pencil size={13} /> {abierta ? 'Cerrar' : 'Editar'}</button>
        {puedeDesactivar && <button className="button secondary" onClick={onToggle}><Power size={13} /> {rule.enabled ? 'Desactivar' : 'Activar'}</button>}
        {cambiada && <button className="button secondary" onClick={onRestore}><RotateCcw size={13} /> Restaurar</button>}
        {usuario && <button className="button secondary" onClick={onDelete}><Trash2 size={13} /> Eliminar</button>}
      </div>}
    </div>
    {rule.description && <p className="bp-rule-desc">{rule.description}</p>}
    <dl className="bp-rule-vals">
      <div><dt>Valor vigente</dt><dd>{resumenRegla(rule)}</dd></div>
      {cambiada && <div><dt>De fábrica</dt><dd>{resumenRegla(rule, true)}</dd></div>}
      {rule.updatedBy || rule.updatedAt ? <div><dt>Último cambio</dt><dd>{rule.updatedBy ? `${/^d+$/.test(String(rule.updatedBy)) ? `usuario #${rule.updatedBy}` : rule.updatedBy} · ` : ''}{fechaLima(rule.updatedAt)}</dd></div> : null}
    </dl>
    {rule.locked && <p className="bp-lock"><Lock size={12} aria-hidden="true" /> {rule.category === 'APROBACION' ? 'Ninguna propuesta se publica sin la aprobación de una persona. Esta garantía no se puede quitar.' : 'La define el DataMart y no se puede cambiar desde el AMP.'}</p>}
    {abierta && editable && <Editor rule={rule} categoria={rule.category} kpiActual={kpiActual} onClose={onClose} onSaved={onSaved} />}
  </article>;
}

// ---------------------------------------------------------------------------
// Editor (alta y modificación)
// ---------------------------------------------------------------------------
/** El servidor valida de forma estricta: se omiten los campos vacíos para que reporte lo que falta. */
const limpiar = (p: Obj) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== "" && v !== undefined));
const INICIAL: Record<string, Obj> = {
  ALERTA: { kpi: 'B-1.1', operador: '<', valor: '', accion: 'AVISAR' },
  DIRECTRIZ: { texto: '', aplicaA: 'AMBAS' }
};
function Editor({ rule, categoria, kpiActual, onClose, onSaved }: { rule: Obj | null; categoria: string; kpiActual?: Obj; onClose: () => void; onSaved: () => void }) {
  const { toast } = useBuyer();
  const nueva = !rule;
  const usuario = categoria === 'ALERTA' || categoria === 'DIRECTRIZ';
  const [params, setParams] = useState<Obj>(() => (rule ? structuredClone(paramsDe(rule)) : { ...INICIAL[categoria] }));
  const [name, setName] = useState<string>(rule?.name || '');
  const [enabled, setEnabled] = useState<boolean>(rule?.enabled ?? true);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const fake = rule || { category: categoria, code: '', origin: 'USUARIO' };
  const puedeApagar = usuario || (!!rule && ['ALERTA', 'AUTOMATIZACION', 'CONTENIDO', 'COBERTURA'].includes(categoria));
  const invalido = categoria === 'SEMAFORO' && !semaforoValido(params);
  const sinNombre = usuario && !name.trim();

  async function guardar() {
    setOcupado(true); setIssues([]); setError('');
    try {
      await post('buyer/rule/save', { ...(rule ? { id: rule.id } : {}), category: categoria, ...(usuario ? { name: name.trim() } : {}), params: limpiar(params), enabled });
      toast(nueva ? 'Regla creada.' : 'Regla guardada.');
      onSaved();
    } catch (err) {
      const e = err as ApiError;
      setError(e.message);
      if (e.issues?.length) setIssues(e.issues);
    } finally { setOcupado(false); }
  }
  return <form className="bp-editor-rule" onSubmit={e => { e.preventDefault(); guardar(); }} aria-label={nueva ? 'Nueva regla' : `Editar ${rule!.name}`}>
    {nueva && <h4>{categoria === 'ALERTA' ? 'Nueva alerta' : 'Nueva directriz'}</h4>}
    {usuario && <label className="bp-rf"><span>Nombre de la regla</span><input value={name} maxLength={120} onChange={e => setName(e.target.value)} placeholder={categoria === 'ALERTA' ? 'Ej. Cobertura baja en TikTok' : 'Ej. Tono cercano'} /></label>}
    <RuleForm params={params} set={setParams} issues={issues} rule={fake} kpiActual={kpiActual} />
    {puedeApagar && <Toggle checked={enabled} onChange={setEnabled} label={enabled ? 'Regla activa' : 'Regla desactivada'} />}
    {(error || issues.length > 0) && <div className="bp-issues" role="alert"><b>{error || 'El servidor rechazó el cambio.'}</b>
      {issues.length > 0 && <ul>{issues.map((i, n) => <li key={n}>{i.path ? `${i.path}: ` : ''}{i.message}</li>)}</ul>}</div>}
    <div className="bp-actions">
      <button type="submit" className="button primary" disabled={ocupado || invalido || sinNombre}>{ocupado ? <Spinner /> : <Save size={14} />} {nueva ? 'Crear regla' : 'Guardar cambios'}</button>
      <button type="button" className="button secondary" onClick={onClose}>Cancelar</button>
    </div>
  </form>;
}
