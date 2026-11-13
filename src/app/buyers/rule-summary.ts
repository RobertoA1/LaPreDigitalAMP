import { DIAS_SEMANA, KPI_NOMBRES, textoNiveles, type Obj } from './api';

/** Los parámetros pueden llegar como objeto o como texto JSON. */
export function paramsDe(rule: Obj | null | undefined, usarFabrica = false): Obj {
  let v: any = usarFabrica ? rule?.defaultParams : rule?.params;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = {}; } }
  return v && typeof v === 'object' ? v : {};
}

/** Lista de un parámetro, tolerando varios nombres posibles de la clave. */
export function listaDe(params: Obj, claves: string[]): { clave: string; lista: any[] } {
  if (Array.isArray(params)) return { clave: '', lista: params };
  for (const c of claves) if (Array.isArray(params?.[c])) return { clave: c, lista: params[c] };
  return { clave: claves[0], lista: [] };
}
export const CLAVES_TERMINOS = ['terminos', 'prohibidos', 'items', 'lista'];
export const CLAVES_PILARES = ['pilares', 'items', 'lista'];

export const OPERADORES: Record<string, string> = { '<': 'es menor que', '<=': 'es menor o igual que', '>': 'es mayor que', '>=': 'es mayor o igual que' };
export const ESTADOS_ALERTA: Record<string, string> = { ROJO: 'está en rojo', AMARILLO: 'está en amarillo' };
export const ACCIONES: Record<string, string> = { AVISAR: 'avisar', EJECUTAR_B1: 'ejecutar B-1', EJECUTAR_B2: 'ejecutar B-2' };
export const APLICA: Record<string, string> = { B1: 'B-1 Publicaciones', B2: 'B-2 Video y guion', AMBAS: 'Ambas actividades' };
export const unidadDe = (code: string) => (code === 'B-1.2' ? 'S/' : '%');
export const kpiDeRegla = (rule: Obj) => String(rule.code || '').replace(/^SEM_/, '');
export const hora = (h: unknown) => `${String(Number(h) || 0).padStart(2, '0')}:00`;

/** Frase de una regla ALERTA: «Si B-1.1 es menor que 60 en TIKTOK entonces avisar». */
export function fraseAlerta(p: Obj) {
  const cond = p.estado ? ESTADOS_ALERTA[p.estado] || p.estado : `${OPERADORES[p.operador] || p.operador || '?'} ${p.valor ?? '?'}`;
  const kpi = p.kpi === 'B1' ? 'algún KPI de B-1' : p.kpi === 'B2' ? 'algún KPI de B-2' : p.kpi || 'el KPI';
  return `Si ${kpi} ${cond}${p.canal ? ` en ${p.canal}` : ''}, entonces ${ACCIONES[p.accion] || p.accion || '?'}.`;
}

/** Resumen corto del valor de una regla (vigente o de fábrica). */
export function resumenRegla(rule: Obj, usarFabrica = false): string {
  const p = paramsDe(rule, usarFabrica);
  const code = String(rule.code || '');
  switch (rule.category) {
    case 'SEMAFORO': return textoNiveles(p, unidadDe(kpiDeRegla(rule)));
    case 'ALERTA': return fraseAlerta(p);
    case 'DIRECTRIZ': return `«${p.texto || ''}» · ${APLICA[p.aplicaA] || p.aplicaA || 'sin actividad'}`;
    case 'AUTOMATIZACION':
      if (code === 'AUT_ENFRIAMIENTO') return `${p.dias ?? '?'} días entre ejecuciones por alerta`;
      return `${DIAS_SEMANA[(Number(p.diaSemana) || 1) - 1]} ${hora(p.hora)} (hora de Lima)`;
    case 'COBERTURA':
      if (code === 'COB_B1') return `${(p.publicos || []).length} públicos × ${(p.canales || []).length} canales: ${(p.publicos || []).join(', ') || '—'} / ${(p.canales || []).join(', ') || '—'}`;
      if (code === 'COB_B2') return `${p.guiones ?? '?'} guiones, ${p.llamados ?? '?'} llamados, hasta ${p.maxVideos ?? '?'} videos; recomienda ${(p.recomendaciones || []).join(', ') || 'nada'}`;
      if (code === 'COB_ATRIBUCION') return p.cuando === 'ROJO' ? 'Solo cuando B-1.1 está en rojo' : 'Cuando B-1.1 no está en verde';
      break;
    case 'CONTENIDO': {
      if (code === 'CON_PROHIBIDOS') { const l = listaDe(p, CLAVES_TERMINOS).lista; return `${l.length} términos: ${l.slice(0, 6).map(t => t?.etiqueta || t).join(', ')}${l.length > 6 ? '…' : ''}`; }
      if (code === 'CON_PILARES') { const l = listaDe(p, CLAVES_PILARES).lista; return `${l.map(t => t?.nombre || t).join(', ')} · mínimo ${p.minimo ?? 1}`; }
      if (code === 'CON_LLAMADO_LANDING') return p.fraseDeRespaldo ? `Frase de respaldo: «${p.fraseDeRespaldo}»` : 'Todas las publicaciones llevan llamado a la landing';
      if (code === 'CON_EVIDENCIA') return 'Toda recomendación cita cifras del contexto';
      break;
    }
  }
  const t = Object.keys(p).length ? JSON.stringify(p) : '';
  return rule.locked ? 'Definida por el DataMart' : t.length > 160 ? `${t.slice(0, 157)}...` : t || '—';
}

export const nombreKpi = (c: string) => `${c} · ${KPI_NOMBRES[c] || ''}`;
