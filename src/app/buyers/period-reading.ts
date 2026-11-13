import { fmt, int, KPI_NOMBRES } from './api';

export type KpiPeriodo = {
  code: string;
  value: number | null;
  unit: string;
  status: string;
  numerator: number | null;
  denominator: number;
};

export type LecturaPeriodo = {
  quePaso: string;
  queHacer: string;
  queAccion: string;
  abrirAgente: boolean;
};

const descripcionKpi = (kpi: KpiPeriodo) => {
  const nombre = KPI_NOMBRES[kpi.code] || kpi.code;
  const valor = fmt(kpi.value, kpi.unit);
  const numerador = kpi.unit === 'S/' ? fmt(kpi.numerator, 'S/') : int(kpi.numerator);
  const denominador = `${int(kpi.denominator)}${kpi.code === 'B-1.2' ? ' LEADs nuevos' : ''}`;
  return `${kpi.code} (${nombre}) está en ${valor} (${numerador} de ${denominador})`;
};

export function leerPeriodo(kpis: KpiPeriodo[]): LecturaPeriodo {
  if (!kpis.length) {
    return {
      quePaso: 'Aún no hay datos del período para mostrar.',
      queHacer: 'Sin datos, no se pueden recomendar acciones.',
      queAccion: 'No hace falta ejecutar nada. Cuando haya datos, revisa el análisis.',
      abrirAgente: false
    };
  }

  const noAplicables = kpis.filter(kpi => kpi.denominator <= 0);
  const conDatos = kpis.filter(kpi => kpi.denominator > 0);
  const rojos = conDatos.filter(kpi => kpi.status === 'ROJO');
  const seguimiento = conDatos.filter(kpi => kpi.status === 'AMARILLO');
  const favorables = conDatos.filter(kpi => kpi.status === 'VERDE');
  const sinDatos = conDatos.filter(kpi => kpi.status !== 'ROJO' && kpi.status !== 'AMARILLO' && kpi.status !== 'VERDE');

  const partes: string[] = [];
  if (rojos.length) partes.push(`Requieren atención: ${rojos.map(descripcionKpi).join('; ')}.`);
  if (seguimiento.length) partes.push(`En seguimiento: ${seguimiento.map(descripcionKpi).join('; ')}.`);
  if (favorables.length) partes.push(`Favorables: ${favorables.map(descripcionKpi).join('; ')}.`);
  if (sinDatos.length) partes.push(`Sin datos: ${sinDatos.map(kpi => `${kpi.code} (${KPI_NOMBRES[kpi.code] || kpi.code})`).join(', ')}.`);
  if (noAplicables.length) partes.push(`No aplicable: ${noAplicables.map(kpi => `${kpi.code} (denominador 0)`).join(', ')}.`);

  const hayDatosEvaluables = conDatos.some(kpi => kpi.status === 'ROJO' || kpi.status === 'AMARILLO' || kpi.status === 'VERDE');
  const quePaso = partes.length ? partes.join(' ') : 'Aún no hay datos del período para mostrar.';
  if (!hayDatosEvaluables) {
    return {
      quePaso,
      queHacer: 'Sin datos evaluables, no se pueden recomendar acciones.',
      queAccion: 'No hace falta ejecutar nada. Cuando haya datos, revisa el análisis.',
      abrirAgente: false
    };
  }

  const b1 = [...rojos, ...seguimiento].some(kpi => kpi.code === 'B-1.1' || kpi.code === 'B-1.2');
  const b2 = [...rojos, ...seguimiento].some(kpi => kpi.code === 'B-2.1' || kpi.code === 'B-2.2' || kpi.code === 'B-2.3');
  const b3 = [...rojos, ...seguimiento].some(kpi => kpi.code === 'B-3.1');
  const recomendaciones: string[] = [];
  if (b1) recomendaciones.push('Para B-1, preparar propuestas de publicaciones para estudiantes postulantes y padres o apoderados en TikTok, Instagram y WhatsApp hacia la landing.');
  if (b2) recomendaciones.push('Para B-2, preparar variantes de guion o llamado y considerar cambios en duración, orden de beneficios o mensaje final.');
  if (b3) recomendaciones.push('B-3 se mide con el formulario y no requiere IA.');

  if (!b1 && !b2 && !b3) {
    return {
      quePaso,
      queHacer: 'No hace falta sugerir cambios: los KPI con datos están favorables.',
      queAccion: 'No hace falta actuar.',
      abrirAgente: false
    };
  }

  const queAccion = b1 || b2
    ? `Revisar manualmente las propuestas de ${[b1 ? 'B-1' : '', b2 ? 'B-2' : ''].filter(Boolean).join(' y ')}.`
    : 'No hace falta abrir Agente para B-3.';
  return { quePaso, queHacer: recomendaciones.join(' '), queAccion, abrirAgente: b1 || b2 };
}
