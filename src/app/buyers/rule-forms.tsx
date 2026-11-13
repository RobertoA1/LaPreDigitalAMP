'use client';
import { Plus, X } from 'lucide-react';
import { CANALES, DIAS_SEMANA, KPI_CODES, PUBLICOS, estadoDe, fmt, type Issue, type Obj, type Umbral } from './api';
import { ACCIONES, CLAVES_PILARES, CLAVES_TERMINOS, ESTADOS_ALERTA, OPERADORES, APLICA, fraseAlerta, hora, kpiDeRegla, listaDe, nombreKpi, unidadDe } from './rule-summary';
import { StatusChip } from './ui';

export type FormProps = { params: Obj; set: (p: Obj) => void; issues: Issue[]; rule: Obj | null; kpiActual?: Obj; disabled?: boolean };

/** Mensajes de validación del servidor (422) cuya ruta nombra el campo. */
const issuesDe = (issues: Issue[], k: string) => issues.filter(i => i.path && (i.path === k || i.path.split('.').includes(k) || i.path.endsWith(`.${k}`)));
export function Field({ label, k, issues, hint, children, className = '' }: { label: string; k: string; issues: Issue[]; hint?: string; children: React.ReactNode; className?: string }) {
  const own = issuesDe(issues, k);
  return <label className={`bp-rf ${own.length ? 'bad' : ''} ${className}`}><span>{label}</span>{children}
    {hint && <small>{hint}</small>}{own.map((i, n) => <small key={n} className="bp-issue" role="alert">{i.message}</small>)}</label>;
}
const num = (v: string) => (v === '' ? '' : Number(v));
const alternar = (lista: string[] = [], v: string) => (lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v]);

/** Formulario según la regla. */
export default function RuleForm(props: FormProps) {
  const { rule } = props;
  const cat = rule?.category, code = String(rule?.code || '');
  if (cat === 'SEMAFORO') return <SemaforoForm {...props} />;
  if (cat === 'ALERTA') return <AlertaForm {...props} />;
  if (cat === 'DIRECTRIZ') return <DirectrizForm {...props} />;
  if (code === 'CON_PROHIBIDOS') return <TerminosForm {...props} />;
  if (code === 'CON_PILARES') return <PilaresForm {...props} />;
  if (code === 'CON_LLAMADO_LANDING') return <LlamadoForm {...props} />;
  if (code === 'COB_B1') return <CoberturaB1 {...props} />;
  if (code === 'COB_B2') return <CoberturaB2 {...props} />;
  if (code === 'COB_ATRIBUCION') return <Atribucion {...props} />;
  if (code === 'AUT_ENFRIAMIENTO') return <Enfriamiento {...props} />;
  if (cat === 'AUTOMATIZACION') return <Programacion {...props} />;
  if (code === 'CON_EVIDENCIA') return <p className="muted">Esta regla no tiene valores: solo se puede activar o desactivar.</p>;
  return <p className="muted">Esta regla no tiene un editor específico.</p>;
}

// ---------------------------------------------------------------------------
// SEMÁFORO: dos niveles, barra y vista previa
// ---------------------------------------------------------------------------
function SemaforoForm({ params, set, issues, rule, kpiActual, disabled }: FormProps) {
  const kpi = kpiDeRegla(rule!), unit = unidadDe(kpi);
  const th: Umbral = { direction: params.direction === 'LOWER_BETTER' ? 'LOWER_BETTER' : 'HIGHER_BETTER', yellow: Number(params.yellow), green: Number(params.green) };
  const alto = th.direction === 'HIGHER_BETTER';
  const finito = Number.isFinite(th.yellow) && Number.isFinite(th.green) && params.yellow !== '' && params.green !== '';
  const coherente = finito && (alto ? th.yellow < th.green : th.green < th.yellow);
  const valor: number | null = kpiActual?.value ?? null;
  const max = unit === '%' ? Math.max(100, th.yellow, th.green) : Math.max(th.yellow, th.green, valor ?? 0) * 1.4 || 1;
  const pos = (x: number) => `${Math.min(100, Math.max(0, (x / max) * 100))}%`;
  const cortes = finito ? [Math.min(th.yellow, th.green), Math.max(th.yellow, th.green)] : [0, 0];
  const zonas = alto ? [['rojo', 0, cortes[0]], ['amarillo', cortes[0], cortes[1]], ['verde', cortes[1], max]] : [['verde', 0, cortes[0]], ['amarillo', cortes[0], cortes[1]], ['rojo', cortes[1], max]];
  const vista = coherente ? estadoDe(th, valor) : null;
  return <div className="bp-form">
    <p className="muted">Dirección: <b>{alto ? 'mientras más alto, mejor' : 'mientras más bajo, mejor'}</b> (no se cambia). {alto ? 'Rojo por debajo del nivel amarillo; verde desde el nivel verde.' : 'Rojo por encima del nivel amarillo; verde hasta el nivel verde.'}</p>
    <div className="bp-two">
      <Field label={`Nivel amarillo (${unit})`} k="yellow" issues={issues} hint={alto ? 'Por debajo de este valor es rojo' : 'Por encima de este valor es rojo'}>
        <input type="number" step="any" value={params.yellow ?? ''} disabled={disabled} onChange={e => set({ ...params, yellow: num(e.target.value) })} /></Field>
      <Field label={`Nivel verde (${unit})`} k="green" issues={issues} hint={alto ? 'Desde este valor es verde' : 'Hasta este valor es verde'}>
        <input type="number" step="any" value={params.green ?? ''} disabled={disabled} onChange={e => set({ ...params, green: num(e.target.value) })} /></Field>
    </div>
    {finito && !coherente && <p className="error" role="alert">{alto ? 'El nivel verde debe ser mayor que el amarillo.' : 'El nivel verde debe ser menor que el amarillo.'}</p>}
    {coherente && <div className="bp-semaforo" aria-hidden="true">
      {zonas.map(([z, a, b]) => <span key={String(z)} className={`z ${z}`} style={{ width: `${(((b as number) - (a as number)) / max) * 100}%` }}>{z === 'rojo' ? 'Rojo' : z === 'amarillo' ? 'Amarillo' : 'Verde'}</span>)}
      {valor != null && <i className="marca" style={{ left: pos(valor) }} title={`KPI actual: ${fmt(valor, unit)}`} />}
    </div>}
    <p className="bp-preview" aria-live="polite">{valor == null ? 'Vista previa: el KPI actual no tiene datos con los filtros actuales.' : !coherente ? 'Vista previa: corrige los niveles para verla.' :
      <>Con estos niveles el KPI actual ({fmt(valor, unit)}) quedaría en <StatusChip status={vista!} />{kpiActual?.status && kpiActual.status !== vista ? <> (hoy: <StatusChip status={kpiActual.status} />)</> : null}</>}</p>
  </div>;
}
/** ¿Se pueden guardar los niveles? (se usa para deshabilitar «Guardar»). */
export function semaforoValido(params: Obj) {
  const y = Number(params.yellow), g = Number(params.green);
  if (params.yellow === '' || params.green === '' || !Number.isFinite(y) || !Number.isFinite(g)) return false;
  return params.direction === 'LOWER_BETTER' ? g < y : y < g;
}

// ---------------------------------------------------------------------------
// Listas: términos prohibidos y pilares
// ---------------------------------------------------------------------------
function TerminosForm({ params, set, issues, disabled }: FormProps) {
  const { clave, lista } = listaDe(params, CLAVES_TERMINOS);
  const guardar = (l: Obj[]) => set(Array.isArray(params) ? (l as any) : { ...params, [clave]: l });
  return <div className="bp-form">
    <p className="muted">Una propuesta que contenga alguno de estos términos se corrige o se descarta. Los términos con detección integrada (precios, descuentos, becas…) reconocen además variantes; puedes añadirles palabras.</p>
    <ul className="bp-listedit">{lista.map((t: Obj, i) => <li key={i}>
      <Field label="Etiqueta" k={`${i}.etiqueta`} issues={issues}><input value={t.etiqueta ?? ''} maxLength={60} disabled={disabled} placeholder="Ej. precio" onChange={e => guardar(lista.map((x, n) => (n === i ? { ...x, etiqueta: e.target.value } : x)))} /></Field>
      <Field label={t.integrado ? "Palabras adicionales (la detección integrada ya está activa)" : "Texto a detectar"} k={`${i}.patron`} issues={issues} hint={i === 0 ? "Varias palabras o frases separadas por | o coma; se comparan sin tildes ni mayúsculas." : undefined}><input value={t.patron ?? ''} maxLength={300} disabled={disabled} placeholder={t.integrado ? "Opcional" : "Ej. descuento"} onChange={e => guardar(lista.map((x, n) => (n === i ? { ...x, patron: e.target.value } : x)))} /></Field>
      <button type="button" className="button secondary bp-icon-btn" disabled={disabled} aria-label={`Quitar término ${t.etiqueta || i + 1}`} onClick={() => guardar(lista.filter((_, n) => n !== i))}><X size={14} /></button>
    </li>)}</ul>
    {!lista.length && <p className="muted">No hay términos: nada se bloqueará por contenido.</p>}
    <button type="button" className="button secondary" disabled={disabled || lista.length >= 40} onClick={() => guardar([...lista, { etiqueta: '', patron: '' }])}><Plus size={14} /> Añadir término</button>
    <small className="muted">{lista.length} términos</small>
  </div>;
}

function PilaresForm({ params, set, issues, disabled }: FormProps) {
  const { clave, lista } = listaDe(params, CLAVES_PILARES);
  const guardar = (l: Obj[]) => set({ ...params, [clave]: l });
  return <div className="bp-form">
    <p className="muted">Cada publicación debe destacar al menos {params.minimo ?? 1} de estos pilares (se reconocen por sus palabras clave).</p>
    <ul className="bp-listedit">{lista.map((t: Obj, i) => {
      const claves: string[] = Array.isArray(t.palabrasClave) ? t.palabrasClave : [];
      return <li key={i}>
        <Field label="Pilar" k={`${i}.nombre`} issues={issues}><input value={t.nombre ?? ''} maxLength={60} disabled={disabled} onChange={e => guardar(lista.map((x, n) => (n === i ? { ...x, nombre: e.target.value } : x)))} /></Field>
        <Field label="Palabras clave (separadas por comas)" k={`${i}.palabrasClave`} issues={issues}><input value={claves.join(', ')} disabled={disabled}
          onChange={e => guardar(lista.map((x, n) => (n === i ? { ...x, palabrasClave: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } : x)))} /></Field>
        <button type="button" className="button secondary bp-icon-btn" disabled={disabled} aria-label={`Quitar pilar ${t.nombre || i + 1}`} onClick={() => guardar(lista.filter((_, n) => n !== i))}><X size={14} /></button>
      </li>;
    })}</ul>
    <button type="button" className="button secondary" disabled={disabled || lista.length >= 8} onClick={() => guardar([...lista, { nombre: '', palabrasClave: [] }])}><Plus size={14} /> Añadir pilar</button>
    <Field label="Mínimo de pilares por publicación" k="minimo" issues={issues} className="bp-narrow"><input type="number" min={1} max={Math.max(lista.length, 1)} value={params.minimo ?? 1} disabled={disabled} onChange={e => set({ ...params, minimo: num(e.target.value) })} /></Field>
  </div>;
}

function LlamadoForm({ params, set, issues, disabled }: FormProps) {
  return <div className="bp-form"><Field label="Frase de respaldo (se añade si la publicación no trae un llamado a la landing)" k="fraseDeRespaldo" issues={issues}>
    <textarea rows={2} maxLength={300} value={params.fraseDeRespaldo ?? ''} disabled={disabled} onChange={e => set({ ...params, fraseDeRespaldo: e.target.value })} /></Field></div>;
}

// ---------------------------------------------------------------------------
// Cobertura
// ---------------------------------------------------------------------------
function CoberturaB1({ params, set, issues, disabled }: FormProps) {
  const pub: string[] = params.publicos || [], can: string[] = params.canales || [];
  return <div className="bp-form">
    <Field label="Públicos" k="publicos" issues={issues}><span className="bp-checks">{Object.entries(PUBLICOS).map(([k, v]) =>
      <label key={k} className="bp-check"><input type="checkbox" disabled={disabled} checked={pub.includes(k)} onChange={() => set({ ...params, publicos: alternar(pub, k) })} /> {v}</label>)}</span></Field>
    <Field label="Canales" k="canales" issues={issues}><span className="bp-checks">{CANALES.map(c =>
      <label key={c} className="bp-check"><input type="checkbox" disabled={disabled} checked={can.includes(c)} onChange={() => set({ ...params, canales: alternar(can, c) })} /> {c}</label>)}</span></Field>
    <p className="bp-preview"><b>{pub.length}</b> públicos × <b>{can.length}</b> canales = <b>{pub.length * can.length}</b> publicaciones por ejecución de B-1.</p>
    {(!pub.length || !can.length) && <p className="error" role="alert">Elige al menos un público y un canal.</p>}
  </div>;
}
const RECOMENDACIONES: Record<string, string> = { DURACION: 'Duración del video', ORDEN_BENEFICIOS: 'Orden de los beneficios', MENSAJE_FINAL: 'Mensaje final' };
function CoberturaB2({ params, set, issues, disabled }: FormProps) {
  const rec: string[] = params.recomendaciones || [];
  return <div className="bp-form">
    <div className="bp-three">
      <Field label="Variantes de guion por video" k="guiones" issues={issues}><input type="number" min={0} max={5} value={params.guiones ?? ''} disabled={disabled} onChange={e => set({ ...params, guiones: num(e.target.value) })} /></Field>
      <Field label="Variantes del llamado al formulario" k="llamados" issues={issues}><input type="number" min={0} max={6} value={params.llamados ?? ''} disabled={disabled} onChange={e => set({ ...params, llamados: num(e.target.value) })} /></Field>
      <Field label="Máximo de videos por ejecución" k="maxVideos" issues={issues}><input type="number" min={1} max={10} value={params.maxVideos ?? ''} disabled={disabled} onChange={e => set({ ...params, maxVideos: num(e.target.value) })} /></Field>
    </div>
    <Field label="Recomendaciones que se generan por video" k="recomendaciones" issues={issues}><span className="bp-checks">{Object.entries(RECOMENDACIONES).map(([k, v]) =>
      <label key={k} className="bp-check"><input type="checkbox" disabled={disabled} checked={rec.includes(k)} onChange={() => set({ ...params, recomendaciones: alternar(rec, k) })} /> {v}</label>)}</span></Field>
  </div>;
}
function Atribucion({ params, set, issues, disabled }: FormProps) {
  return <div className="bp-form"><Field label="Recomendar mejoras de atribución cuando B-1.1…" k="cuando" issues={issues}>
    <select value={params.cuando ?? 'NO_VERDE'} disabled={disabled} onChange={e => set({ ...params, cuando: e.target.value })}>
      <option value="NO_VERDE">no esté en verde (rojo o amarillo)</option><option value="ROJO">esté en rojo</option></select></Field></div>;
}

// ---------------------------------------------------------------------------
// Automatización
// ---------------------------------------------------------------------------
function Programacion({ params, set, issues, disabled }: FormProps) {
  return <div className="bp-form"><div className="bp-two">
    <Field label="Día de la semana" k="diaSemana" issues={issues}><select value={params.diaSemana ?? 1} disabled={disabled} onChange={e => set({ ...params, diaSemana: Number(e.target.value) })}>
      {DIAS_SEMANA.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></Field>
    <Field label="Hora (Lima, UTC−5)" k="hora" issues={issues}><select value={params.hora ?? 8} disabled={disabled} onChange={e => set({ ...params, hora: Number(e.target.value) })}>
      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hora(h)}</option>)}</select></Field>
  </div><p className="bp-preview">Se ejecutará cada <b>{DIAS_SEMANA[(Number(params.diaSemana) || 1) - 1].toLowerCase()}</b> a las <b>{hora(params.hora)}</b> (hora de Lima), solo si la actividad está en modo Automático.</p></div>;
}
function Enfriamiento({ params, set, issues, disabled }: FormProps) {
  return <div className="bp-form"><Field label="Días mínimos entre ejecuciones automáticas de una misma actividad lanzadas por alerta" k="dias" issues={issues} className="bp-narrow">
    <input type="number" min={0} max={90} value={params.dias ?? ''} disabled={disabled} onChange={e => set({ ...params, dias: num(e.target.value) })} /></Field></div>;
}

// ---------------------------------------------------------------------------
// Reglas de usuario: ALERTA y DIRECTRIZ
// ---------------------------------------------------------------------------
export function AlertaForm({ params, set, issues, disabled }: FormProps) {
  const porEstado = !!params.estado;
  return <div className="bp-form">
    <p className="bp-sentence" aria-live="polite">{fraseAlerta(params)}</p>
    <div className="bp-alertrow">
      <Field label="Si el KPI…" k="kpi" issues={issues}><select value={params.kpi ?? ''} disabled={disabled} onChange={e => set({ ...params, kpi: e.target.value })}><option value="">Elige un KPI</option>{KPI_CODES.map(c => <option key={c} value={c}>{nombreKpi(c)}</option>)}{porEstado && <><option value="B1">Cualquier KPI de B-1</option><option value="B2">Cualquier KPI de B-2</option></>}</select></Field>
      <Field label="Condición" k="condicion" issues={issues}><select value={porEstado ? 'estado' : 'valor'} disabled={disabled} onChange={e => { const { operador, valor, estado, ...resto } = params; set(e.target.value === 'estado' ? { ...resto, estado: 'ROJO' } : { ...resto, kpi: params.kpi === 'B1' || params.kpi === 'B2' ? 'B-1.1' : params.kpi, operador: '<', valor: '' }); }}>
        <option value="valor">compara con un valor</option><option value="estado">está en un estado del semáforo</option></select></Field>
      {porEstado
        ? <Field label="Estado" k="estado" issues={issues}><select value={params.estado} disabled={disabled} onChange={e => set({ ...params, estado: e.target.value })}>{Object.entries(ESTADOS_ALERTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        : <><Field label="Operador" k="operador" issues={issues}><select value={params.operador ?? '<'} disabled={disabled} onChange={e => set({ ...params, operador: e.target.value })}>{Object.entries(OPERADORES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label={`Valor${params.kpi ? ` (${unidadDe(params.kpi)})` : ''}`} k="valor" issues={[...issues, ...issues.filter(i => i.path === 'operador').map(i => ({ ...i, path: 'valor' }))]}><input type="number" step="any" value={params.valor ?? ''} disabled={disabled} onChange={e => set({ ...params, valor: num(e.target.value) })} /></Field></>}
      <Field label="En el canal" k="canal" issues={issues}><select value={params.canal ?? ''} disabled={disabled} onChange={e => { const { canal, ...resto } = params; set(e.target.value ? { ...resto, canal: e.target.value } : resto); }}><option value="">Todos</option>{CANALES.map(c => <option key={c} value={c}>{c}</option>)}</select></Field>
      <Field label="Entonces" k="accion" issues={issues}><select value={params.accion ?? 'AVISAR'} disabled={disabled} onChange={e => set({ ...params, accion: e.target.value })}>{Object.entries(ACCIONES).map(([k, v]) => <option key={k} value={k}>{v[0].toUpperCase() + v.slice(1)}</option>)}</select></Field>
    </div>
    {String(params.accion).startsWith('EJECUTAR') && <p className="muted">Ejecutar solo ocurre si la actividad está en modo Automático y respetando los días de enfriamiento; en Manual solo se genera el aviso.</p>}
  </div>;
}
export function DirectrizForm({ params, set, issues, disabled }: FormProps) {
  const texto: string = params.texto ?? '';
  return <div className="bp-form">
    <Field label={`Directriz para la IA (${texto.length}/300)`} k="texto" issues={issues} hint="Se entrega a la IA como un dato a respetar, después de las reglas de seguridad. No puede contradecirlas (nada de precios, descuentos, becas ni promesas de ingreso).">
      <textarea rows={3} maxLength={300} value={texto} disabled={disabled} placeholder="Ej. Usa un tono cercano y evita tecnicismos." onChange={e => set({ ...params, texto: e.target.value })} /></Field>
    <Field label="Aplica a" k="aplicaA" issues={issues} className="bp-narrow"><select value={params.aplicaA ?? 'AMBAS'} disabled={disabled} onChange={e => set({ ...params, aplicaA: e.target.value })}>
      {Object.entries(APLICA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
  </div>;
}
