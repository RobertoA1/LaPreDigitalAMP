'use client';
import { useEffect, useRef } from 'react';
import { Copy, ShieldCheck, X } from 'lucide-react';
import { copyText, fechaLima, int, lima, num2, type Obj } from './api';
import { useBlock, useBuyer } from './hooks';
import { TabLink } from './tab-link';
import { Msg, Spinner, Tag } from './ui';

export const ESTADO_FORM: Record<string, { label: string; tone: string; icono: string }> = {
  VALIDO: { label: 'Válido', tone: 'teal', icono: '●' }, DUPLICADO: { label: 'Duplicado', tone: 'light', icono: '◐' },
  INVALIDO: { label: 'Inválido', tone: 'orange', icono: '▲' }, REVISION: { label: 'En revisión', tone: 'purple', icono: '■' }
};
export const ROL_TEXTO: Record<string, string> = { ESTUDIANTE: 'Estudiante', PADRE: 'Padre', MADRE: 'Madre', APODERADO: 'Apoderado', POSTULANTE: 'Postulante' };
export const rolTexto = (r: unknown) => (r ? ROL_TEXTO[String(r).toUpperCase()] || String(r) : 'Sin rol');
export function EstadoForm({ estado }: { estado: string }) {
  const e = ESTADO_FORM[estado] || { label: estado || 'Desconocido', tone: 'light', icono: '○' };
  return <Tag tone={e.tone}><span aria-hidden="true">{e.icono}&nbsp;</span>{e.label}</Tag>;
}
/** La campaña puede llegar como texto o como `{ id, nombre, tipo }`. */
export const campanaTexto = (c: unknown) => (c == null ? 'Sin campaña' : typeof c === 'string' ? c : `${(c as Obj).nombre || `#${(c as Obj).id}`}${(c as Obj).tipo ? ` (${(c as Obj).tipo})` : ''}`);

/** Cajón lateral con el detalle de un formulario capturado. En pantallas pequeñas ocupa todo el ancho. */
export default function PerfilDetalle({ id, onClose }: { id: string; onClose: () => void }) {
  const { toast } = useBuyer();
  const block = useBlock(id ? `buyer/profile?formulario=${encodeURIComponent(id)}` : null);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (id && !d.open) d.showModal();
    if (!id && d.open) d.close();
  }, [id]);
  const d: Obj | null = block.data;
  const f: Obj = d?.formulario || {}, p: Obj | null = d?.persona || null, v: Obj = d?.visita || {}, r: Obj | null = d?.reproduccion || null;
  const nombre = p?.nombre || f.nombre || 'Sin nombre';
  const correo = p?.correo || f.correo, telefono = p?.telefono || f.telefono, rol = p?.rol || f.rol;
  const copiar = async (texto: string, que: string) => toast((await copyText(texto)) ? `${que} copiado al portapapeles.` : `No se pudo copiar el ${que.toLowerCase()}.`);
  return <dialog ref={ref} className="bp-drawer" aria-labelledby="bp-drawer-title" onClose={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}>
    {id && <div className="bp-drawer-body">
      <div className="bp-drawer-head">
        <div><p className="eyebrow">PERFIL · FORMULARIO #{id}</p><h3 id="bp-drawer-title">{d ? nombre : 'Cargando perfil...'}</h3></div>
        <button className="button secondary bp-icon-btn" onClick={onClose} aria-label="Cerrar detalle" autoFocus><X size={16} /></button>
      </div>
      {!d ? (Msg({ block, what: 'el perfil', unavailable: 'No se encontró el formulario o el servidor aún no expone el detalle.' })) : <>
        <div className="bp-prop-tags"><EstadoForm estado={f.estado} />{rol && <Tag tone="purple">{rolTexto(rol)}</Tag>}{!p && <Tag tone="light">Sin persona asociada</Tag>}</div>
        {!p && <p className="bp-note">Este formulario no tiene persona asociada: se muestran los datos tal como se escribieron.</p>}
        <h4>Contacto</h4>
        <dl className="bp-kv">
          <div><dt>Nombre</dt><dd>{nombre}</dd></div>
          <div><dt>Correo</dt><dd>{correo || '—'}{correo && <button className="button secondary bp-copy" onClick={() => copiar(correo, 'Correo')} aria-label="Copiar correo"><Copy size={12} /> Copiar</button>}</dd></div>
          <div><dt>Teléfono</dt><dd>{telefono || '—'}{telefono && <button className="button secondary bp-copy" onClick={() => copiar(telefono, 'Teléfono')} aria-label="Copiar teléfono"><Copy size={12} /> Copiar</button>}</dd></div>
          {p?.registradaEn && <div><dt>Persona registrada</dt><dd>{fechaLima(p.registradaEn)}</dd></div>}
          <div><dt>Formulario enviado</dt><dd>{fechaLima(f.enviadoEn)} (Lima)</dd></div>
        </dl>
        <h4>Cómo llegó</h4>
        <dl className="bp-kv">
          <div><dt>Canal</dt><dd>{v.canal || 'Sin identificar'}</dd></div>
          <div><dt>Campaña</dt><dd>{campanaTexto(v.campana)}</dd></div>
          <div><dt>Visita</dt><dd>#{v.id ?? '—'}{v.inicio ? ` · ${fechaLima(v.inicio)}` : ''}</dd></div>
          <div><dt>Dispositivo</dt><dd><code className="bp-code">{v.dispositivo || '—'}</code></dd></div>
        </dl>
        <h4>Video</h4>
        {r ? <>
          <p className="bp-vid">{r.video}{r.version ? ` ${r.version}` : ''}{r.duracionSeg ? ` · ${r.duracionSeg} s` : ''}</p>
          <Avance pct={r.avancePct} />
          <div className="bp-prop-tags">
            <Tag tone={r.llegoAlFinal ? 'teal' : 'light'}>{r.llegoAlFinal ? 'Llegó al final' : 'No llegó al final'}</Tag>
            <Tag tone={r.alcanzoMitad ? 'teal' : 'light'}>{r.alcanzoMitad ? 'Pasó la mitad' : 'No pasó la mitad'}</Tag>
            <Tag tone="light">{r.mismoDia ? 'Mismo día' : 'Otro día'}</Tag><Tag tone={r.elegible ? 'purple' : 'light'}>{r.elegible ? 'Elegible' : 'No elegible'}</Tag>
          </div>
          {r.segundoMaximo != null && <p className="muted tiny">Segundo máximo alcanzado: {int(r.segundoMaximo)} s{r.duracionSeg ? ` de ${r.duracionSeg} s` : ''}.</p>}
        </> : <p className="muted">Esta visita no reprodujo el video.</p>}
        <h4>Línea de tiempo</h4>
        {(d.lineaDeTiempo || []).length ? <ol className="bp-log">{(d.lineaDeTiempo as Obj[]).map((e, i) => <li key={i}><time dateTime={e.at}>{lima(e.at, true)}</time><Tag tone="light">{String(e.tipo || '').toLowerCase()}</Tag><span>{e.texto}</span></li>)}</ol> : <p className="muted">Sin eventos registrados.</p>}
        <h4>Otros formularios <small>(misma persona o dispositivo)</small></h4>
        {(d.otrosFormularios || []).length ? <ul className="bp-minilist">{(d.otrosFormularios as Obj[]).map(o => <li key={o.id}>
          <TabLink tab="perfiles" extra={{ formulario: String(o.id) }} className="text-link">Formulario #{o.id}</TabLink><EstadoForm estado={o.estado} /><span>{fechaLima(o.enviadoEn)}</span></li>)}</ul> : <p className="muted">No hay otros formularios.</p>}
        <h4>Otras visitas del mismo dispositivo</h4>
        {(d.otrasVisitas || []).length ? <ul className="bp-minilist">{(d.otrasVisitas as Obj[]).map(o => <li key={o.id}>
          <span>Visita #{o.id}</span><span>{fechaLima(o.inicio)}</span><span>{o.canal || 'Sin canal'}</span><span>{campanaTexto(o.campana)}</span></li>)}</ul> : <p className="muted">No hay otras visitas.</p>}
        <p className="bp-privacy"><ShieldCheck size={14} aria-hidden="true" /> Datos leídos del OLTP; el AMP no los guarda. Cada consulta de detalle queda registrada.</p>
      </>}
      {block.loading && d && <p className="muted"><Spinner /> Actualizando...</p>}
    </div>}
  </dialog>;
}

export function Avance({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="muted">—</span>;
  const v = Math.max(0, Math.min(100, Number(pct)));
  return <span className="bp-avance" role="img" aria-label={`Avance del video ${num2(v)} %`}><span><i style={{ width: `${v}%` }} /></span><b>{Math.round(v)} %</b></span>;
}
