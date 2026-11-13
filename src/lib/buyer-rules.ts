import { createHash } from 'node:crypto';
import { z } from 'zod';
import { plain, plainMany, tables } from './db';
import { event } from './contacts';

/**
 * Reglas de negocio variables del agente Buyer → Lead (docs/agente-buyer-lead-reglas.md).
 * - Definiciones de fábrica (las que antes eran constantes del código) y su siembra idempotente en `amp_buyer_rules`.
 * - Esquemas zod por categoría y validación de coherencia.
 * - Lectura con caché corta (invalidada al escribir) y escritura con permisos y auditoría `BUYER_RULE_CHANGE`.
 * - Funciones PURAS que aplican las reglas (semáforo, prohibidos, pilares): reciben las reglas como parámetro con valor de fábrica por defecto.
 * Este módulo no depende de buyer-kpis ni de buyer-agent (ellos lo importan a él).
 */

// ---------------------------------------------------------------------------
// KPI y umbrales
// ---------------------------------------------------------------------------

export type KpiCode = 'B-1.1' | 'B-1.2' | 'B-2.1' | 'B-2.2' | 'B-2.3' | 'B-3.1';
export type Estado = 'ROJO' | 'AMARILLO' | 'VERDE' | 'SIN_DATOS';
export type Actividad = 'B1' | 'B2' | 'B3';
/**
 * HIGHER_BETTER: ROJO si valor < yellow; VERDE si valor >= green; AMARILLO entre ambos.
 * LOWER_BETTER:  ROJO si valor > yellow; VERDE si valor <= green; AMARILLO entre ambos.
 */
export type Umbral = { direction: 'HIGHER_BETTER' | 'LOWER_BETTER'; yellow: number; green: number };
export type KpiDef = { code: KpiCode; name: string; activity: Actividad; unit: '%' | 'S/'; thresholds: Umbral };

/** KPI con sus umbrales de FÁBRICA (los vigentes salen de las reglas SEM_*). */
export const KPI_DEFS: readonly KpiDef[] = [
  { code: 'B-1.1', name: 'Cobertura de atribución a campañas', activity: 'B1', unit: '%', thresholds: { direction: 'HIGHER_BETTER', yellow: 60, green: 80 } },
  { code: 'B-1.2', name: 'Costo por LEADs nuevos por campaña (S/)', activity: 'B1', unit: 'S/', thresholds: { direction: 'LOWER_BETTER', yellow: 15, green: 8 } },
  { code: 'B-2.1', name: 'Tasa de visualización completa', activity: 'B2', unit: '%', thresholds: { direction: 'HIGHER_BETTER', yellow: 30, green: 60 } },
  { code: 'B-2.2', name: 'Tasa de avance al 50 %', activity: 'B2', unit: '%', thresholds: { direction: 'HIGHER_BETTER', yellow: 50, green: 75 } },
  { code: 'B-2.3', name: 'Conversión a LEAD tras el 50 %', activity: 'B2', unit: '%', thresholds: { direction: 'HIGHER_BETTER', yellow: 5, green: 12 } },
  { code: 'B-3.1', name: 'Tasa de conversión a LEADS', activity: 'B3', unit: '%', thresholds: { direction: 'HIGHER_BETTER', yellow: 3, green: 8 } }
];
export const KPI_CODES = KPI_DEFS.map(def => def.code);

// ---------------------------------------------------------------------------
// Enumeraciones del agente
// ---------------------------------------------------------------------------

export const PUBLICOS = ['POSTULANTE', 'APODERADO'] as const;
export const CANALES = ['TIKTOK', 'INSTAGRAM', 'WHATSAPP'] as const;
export const RECOMENDACIONES_B2 = ['DURACION', 'ORDEN_BENEFICIOS', 'MENSAJE_FINAL'] as const;
export type Publico = (typeof PUBLICOS)[number];
export type CanalBuyer = (typeof CANALES)[number];
export type RecomendacionB2 = (typeof RECOMENDACIONES_B2)[number];
export type ActividadBuyer = 'B1' | 'B2';
export const MODOS = ['AUTOMATICO', 'MANUAL'] as const;
export type Modo = (typeof MODOS)[number];

export const FRASE_PILARES = 'Con LaPreDigital tienes preparación flexible, una ruta de estudio clara y seguimiento académico.';
export const FRASE_LLAMADO = 'Entra a la landing de LaPreDigital, mira el video y completa el formulario.';

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

export const CATEGORIAS = ['SEMAFORO', 'MEDICION', 'CONTENIDO', 'COBERTURA', 'AUTOMATIZACION', 'APROBACION', 'ALERTA', 'DIRECTRIZ'] as const;
export type Categoria = (typeof CATEGORIAS)[number];
export const INFO_CATEGORIAS: Record<Categoria, { label: string; description: string }> = {
  SEMAFORO: { label: 'Semáforos', description: 'Niveles rojo, amarillo y verde de cada KPI. Se pueden ajustar y restaurar, no eliminar.' },
  MEDICION: { label: 'Medición', description: 'Cómo calcula el DataMart los KPI. Solo informativas: no se pueden cambiar desde el AMP.' },
  CONTENIDO: { label: 'Contenido', description: 'Qué puede y qué debe decir una propuesta: términos prohibidos, pilares, llamado a la landing y evidencia.' },
  COBERTURA: { label: 'Cobertura', description: 'Qué propuestas debe generar el agente: públicos, canales, videos y mejoras de atribución.' },
  AUTOMATIZACION: { label: 'Automatización', description: 'Define el horario semanal y el tiempo de espera entre ejecuciones. Solo se aplica si está activo Automático (cada semana).' },
  APROBACION: { label: 'Aprobación', description: 'Ninguna propuesta se publica sin la aprobación de una persona. Bloqueada.' },
  ALERTA: { label: 'Alertas', description: 'Avisos y acciones cuando un KPI cumple una condición. Se pueden crear, modificar, desactivar y eliminar.' },
  DIRECTRIZ: { label: 'Directrices', description: 'Indicaciones en lenguaje natural que la IA debe tener en cuenta al redactar. No cambian las reglas obligatorias.' }
};

// ---------------------------------------------------------------------------
// Términos prohibidos: texto literal (nunca expresiones regulares del usuario)
// ---------------------------------------------------------------------------

/** Detectores integrados (código del sistema, no editables por el usuario). Son los que antes eran `REGLAS` en buyer-agent. */
export const INTEGRADOS = {
  PRECIO: { descripcion: 'precios, tarifas o montos', regex: /S\/\.?\s*\d|\b\d[\d.,]*\s*(soles|nuevos soles)\b|\bUS?\$\s*\d|\$\s*\d|\bprecios?\b|\bcuesta(n)?\b|\btarifas?\b|\bpensi[oó]n\b|\bcuotas?\s+(de|desde)\b/i },
  DESCUENTO: { descripcion: 'descuentos, promociones o cupones', regex: /descuentos?|dscto|rebajas?|cup[oó]n(es)?|2\s*x\s*1|promoci[oó]n(es)?|oferta especial|en oferta|\b\d{1,3}\s*%\s*(de\s*)?(dto|desc)/i },
  BECA: { descripcion: 'becas o semibecas', regex: /\bbecas?\b|semibecas?|\bbecad[oa]s?\b|media beca|exonera/i },
  PROMESA_INGRESO: { descripcion: 'promesas de ingreso a la universidad', regex: /(garantiz\w*|asegur\w*|certific\w*)\s+(tu\s+|su\s+|el\s+)?(ingreso|vacante|admisi[oó]n)|ingreso\s+(garantizado|asegurado|seguro)|(vacante|ingreso)\s+seguro|ingresar[áa]s?\s+(seguro|s[ií] o s[ií]|con certeza)|ingresas\s+s[ií]\s+o\s+s[ií]|100\s*%\s*(de\s*)?(ingreso|ingresantes|garant|efectiv)|te aseguramos|le aseguramos|sin duda ingres|aprobar[áa]s?\s+(seguro|el examen)|garant\w+\s+(el\s+)?(ingreso|[eé]xito)/i },
  RESULTADO_INVENTADO: { descripcion: 'resultados, cifras de ingresantes o rankings inventados', regex: /\b\d[\d.,]*\s+(ingresantes|alumnos ingresaron|estudiantes ingresaron)|\b\d{1,3}\s*%\s*de\s+(nuestros\s+)?(alumnos|estudiantes|ingresantes|postulantes)|miles de ingresantes|n[°º.]\s*1\b|primer lugar|el mejor del per[uú]/i }
} as const;
export type Integrado = keyof typeof INTEGRADOS;
const CLAVES_INTEGRADOS = Object.keys(INTEGRADOS) as [Integrado, ...Integrado[]];

export type Termino = { etiqueta: string; patron: string; integrado?: Integrado; soloPublicable?: boolean };
export type Pilar = { nombre: string; palabrasClave: string[] };

/** Sin tildes ni mayúsculas. */
export const normalizar = (valor: string) => valor.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const escaparRegex = (valor: string) => valor.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const SEPARADORES = /[|,;\n\r]+/;
/** Lista de literales de un `patron` (separados por `|`, coma, punto y coma o salto de línea), ya normalizados. */
export function literales(patron: string): string[] {
  return [...new Set(String(patron || '').split(SEPARADORES).map(parte => normalizar(parte).replace(/\s+/g, ' ').trim()).filter(parte => parte.length >= 2))];
}

const cacheLiterales = new Map<string, RegExp>();
/** Coincide con el inicio de palabra (así «beca» alcanza «becas»), sin tildes ni mayúsculas, con espacios flexibles. */
function regexLiteral(literal: string) {
  let regex = cacheLiterales.get(literal);
  if (!regex) {
    regex = new RegExp(`(?<![\\p{L}\\p{N}])${escaparRegex(literal).replace(/ /g, '\\s+')}`, 'u');
    if (cacheLiterales.size > 800) cacheLiterales.clear();
    cacheLiterales.set(literal, regex);
  }
  return regex;
}
/** Verdadero si el texto contiene alguno de los literales (comparación sin tildes ni mayúsculas). */
export const contieneLiteral = (contenido: string, lista: string[]) => { const t = normalizar(contenido); return lista.some(literal => regexLiteral(literal).test(t)); };

/** Motivos (etiquetas) por los que un texto no puede publicarse. Las recomendaciones internas pueden citar costos de los KPI (`soloPublicable`). */
export function detectarProhibidosCon(prohibidos: { activo: boolean; terminos: Termino[] }, contenido: string, kind: string = 'PUBLICACION'): string[] {
  if (!prohibidos.activo) return [];
  const motivos = new Set<string>();
  for (const termino of prohibidos.terminos) {
    if (termino.soloPublicable && kind === 'RECOMENDACION') continue;
    if ((termino.integrado && INTEGRADOS[termino.integrado]?.regex.test(contenido)) || contieneLiteral(contenido, literales(termino.patron))) motivos.add(termino.etiqueta);
  }
  return [...motivos];
}

/** Pilares presentes en un texto (por nombre o palabra clave, al inicio de palabra, sin tildes ni mayúsculas). */
export function pilaresEnCon(pilares: Pilar[], contenido: string): string[] {
  return pilares.filter(pilar => contieneLiteral(contenido, [...new Set([normalizar(pilar.nombre).trim(), ...pilar.palabrasClave.map(k => normalizar(k).trim())].filter(k => k.length >= 2))])).map(pilar => pilar.nombre);
}

const unirLista = (valores: string[]) => (valores.length <= 1 ? valores.join('') : `${valores.slice(0, -1).join(', ')} y ${valores[valores.length - 1]}`);
const NOMBRES_PILARES_FABRICA = ['Preparación flexible', 'Ruta de estudio', 'Seguimiento académico'];
/** Frase de respaldo que nombra todos los pilares (se añade a una publicación que no llega al mínimo). */
export function frasePilares(pilares: Pilar[]): string {
  const nombres = pilares.map(p => p.nombre);
  if (nombres.length === NOMBRES_PILARES_FABRICA.length && nombres.every((n, i) => n === NOMBRES_PILARES_FABRICA[i])) return FRASE_PILARES;
  return `Con LaPreDigital tienes ${unirLista(nombres.map(n => n.trim().toLowerCase()))}.`;
}

// ---------------------------------------------------------------------------
// Esquemas zod por categoría
// ---------------------------------------------------------------------------

const texto = (campo: string, min: number, max: number) => z.string(`${campo} debe ser texto`).trim().min(min, `${campo}: mínimo ${min} caracteres`).max(max, `${campo}: máximo ${max} caracteres`);
const entero = (campo: string, min: number, max: number) => z.number(`${campo} debe ser un número`).int(`${campo} debe ser un entero`).min(min, `${campo} debe ser como mínimo ${min}`).max(max, `${campo} debe ser como máximo ${max}`);
const unicos = (valores: unknown[]) => new Set(valores).size === valores.length;

export const KPI_O_GRUPO = [...KPI_CODES, 'B1', 'B2'] as unknown as [string, ...string[]];

const semaforoSchema = (code: KpiCode) => z.strictObject({
  direction: z.enum(['HIGHER_BETTER', 'LOWER_BETTER'], 'direction debe ser HIGHER_BETTER o LOWER_BETTER'),
  yellow: z.number('yellow debe ser un número'),
  green: z.number('green debe ser un número')
}).superRefine((valor, ctx) => {
  const def = KPI_DEFS.find(item => item.code === code)!;
  if (valor.direction !== def.thresholds.direction) ctx.addIssue({ code: 'custom', path: ['direction'], message: `direction de ${code} debe ser ${def.thresholds.direction} (no se puede invertir el sentido del KPI)` });
  const max = def.unit === '%' ? 100 : 10000;
  for (const campo of ['yellow', 'green'] as const) if (valor[campo] < 0 || valor[campo] > max) ctx.addIssue({ code: 'custom', path: [campo], message: `${campo} debe estar entre 0 y ${max}${def.unit === '%' ? ' %' : ''}` });
  if (valor.direction === 'HIGHER_BETTER' && !(valor.yellow < valor.green)) ctx.addIssue({ code: 'custom', path: ['yellow'], message: 'En este KPI mayor es mejor: yellow debe ser menor que green' });
  if (valor.direction === 'LOWER_BETTER' && !(valor.green < valor.yellow)) ctx.addIssue({ code: 'custom', path: ['green'], message: 'En este KPI menor es mejor: green debe ser menor que yellow' });
});

const terminoSchema = z.strictObject({
  etiqueta: texto('etiqueta', 2, 40),
  patron: z.string('patron debe ser texto').trim().max(300, 'patron: máximo 300 caracteres').default(''),
  integrado: z.enum(CLAVES_INTEGRADOS, 'integrado desconocido').optional(),
  soloPublicable: z.boolean('soloPublicable debe ser verdadero o falso').optional()
}).superRefine((valor, ctx) => {
  const lista = literales(valor.patron);
  if (!valor.integrado && !lista.length) ctx.addIssue({ code: 'custom', path: ['patron'], message: 'Indica al menos una palabra o frase literal (separadas por | , ; o salto de línea)' });
  if (lista.length > 20) ctx.addIssue({ code: 'custom', path: ['patron'], message: 'Máximo 20 palabras o frases por término' });
  if (lista.some(item => item.length > 60)) ctx.addIssue({ code: 'custom', path: ['patron'], message: 'Cada palabra o frase admite hasta 60 caracteres' });
});
const prohibidosSchema = z.strictObject({ terminos: z.array(terminoSchema, 'terminos debe ser una lista').max(40, 'Máximo 40 términos') });

const pilarSchema = z.strictObject({
  nombre: texto('nombre', 2, 60),
  palabrasClave: z.array(texto('palabra clave', 2, 40), 'palabrasClave debe ser una lista').min(1, 'Cada pilar necesita al menos una palabra clave').max(10, 'Máximo 10 palabras clave por pilar')
});
const pilaresSchema = z.strictObject({
  pilares: z.array(pilarSchema, 'pilares debe ser una lista').min(1, 'Define al menos un pilar').max(8, 'Máximo 8 pilares'),
  minimo: entero('minimo', 1, 8)
}).superRefine((valor, ctx) => {
  if (valor.minimo > valor.pilares.length) ctx.addIssue({ code: 'custom', path: ['minimo'], message: 'minimo no puede superar la cantidad de pilares' });
  if (new Set(valor.pilares.map(p => normalizar(p.nombre).trim())).size !== valor.pilares.length) ctx.addIssue({ code: 'custom', path: ['pilares'], message: 'Los nombres de los pilares no pueden repetirse' });
});

const llamadoSchema = z.strictObject({ fraseDeRespaldo: texto('fraseDeRespaldo', 10, 300) });
const vacioSchema = z.strictObject({});
const cobB1Schema = z.strictObject({
  publicos: z.array(z.enum(PUBLICOS, 'Público desconocido'), 'publicos debe ser una lista').min(1, 'Elige al menos un público').refine(unicos, { error: 'publicos no admite elementos repetidos' }),
  canales: z.array(z.enum(CANALES, 'Canal desconocido'), 'canales debe ser una lista').min(1, 'Elige al menos un canal').refine(unicos, { error: 'canales no admite elementos repetidos' })
});
const cobB2Schema = z.strictObject({
  guiones: entero('guiones', 0, 5), llamados: entero('llamados', 0, 6),
  recomendaciones: z.array(z.enum(RECOMENDACIONES_B2, 'Tipo de recomendación desconocido'), 'recomendaciones debe ser una lista').refine(unicos, { error: 'recomendaciones no admite elementos repetidos' }),
  maxVideos: entero('maxVideos', 1, 10)
}).superRefine((valor, ctx) => {
  if (valor.guiones + valor.llamados + valor.recomendaciones.length < 1) ctx.addIssue({ code: 'custom', path: ['guiones'], message: 'B2 debe producir al menos un guion, un llamado o una recomendación' });
});
const cobAtribucionSchema = z.strictObject({ cuando: z.enum(['ROJO', 'NO_VERDE'], 'cuando debe ser ROJO o NO_VERDE') });
const semanalSchema = z.strictObject({ diaSemana: entero('diaSemana', 1, 7), hora: entero('hora', 0, 23) });
const enfriamientoSchema = z.strictObject({ dias: entero('dias', 0, 90) });
const alertaSchema = z.strictObject({
  kpi: z.enum(KPI_O_GRUPO, 'kpi debe ser un código de KPI (B-1.1…) o la actividad B1 / B2'),
  estado: z.enum(['ROJO', 'AMARILLO'], 'estado debe ser ROJO o AMARILLO').optional(),
  operador: z.enum(['<', '<=', '>', '>='], 'operador debe ser <, <=, > o >=').optional(),
  valor: z.number('valor debe ser un número').min(0, 'valor no puede ser negativo').max(100000, 'valor demasiado grande').optional(),
  canal: z.string('canal debe ser texto').regex(/^[A-Za-z_]{1,20}$/, 'canal inválido').transform(v => v.toUpperCase()).optional(),
  accion: z.enum(['AVISAR', 'EJECUTAR_B1', 'EJECUTAR_B2'], 'accion debe ser AVISAR, EJECUTAR_B1 o EJECUTAR_B2')
}).superRefine((valor, ctx) => {
  const conOperador = valor.operador !== undefined || valor.valor !== undefined;
  if (valor.estado && conOperador) ctx.addIssue({ code: 'custom', path: ['estado'], message: 'Usa estado o bien operador y valor, no ambos' });
  if (!valor.estado && !conOperador) ctx.addIssue({ code: 'custom', path: ['estado'], message: 'Indica una condición: estado (ROJO/AMARILLO) u operador y valor' });
  if (conOperador && (valor.operador === undefined || valor.valor === undefined)) ctx.addIssue({ code: 'custom', path: ['operador'], message: 'operador y valor van juntos' });
  if (conOperador && (valor.kpi === 'B1' || valor.kpi === 'B2')) ctx.addIssue({ code: 'custom', path: ['kpi'], message: 'Una condición con operador y valor requiere un KPI concreto (no una actividad)' });
});
const directrizSchema = z.strictObject({
  texto: texto('texto', 3, 300),
  aplicaA: z.enum(['B1', 'B2', 'AMBAS'], 'aplicaA debe ser B1, B2 o AMBAS')
});
export type ParamsAlerta = z.infer<typeof alertaSchema>;
export type ParamsDirectriz = z.infer<typeof directrizSchema>;

/** Esquema de los parámetros de una regla; null si no admite cambios (bloqueada). */
export function esquemaDeParametros(category: Categoria, code: string): z.ZodType | null {
  switch (category) {
    case 'SEMAFORO': return KPI_CODES.includes(code.replace(/^SEM_/, '') as KpiCode) ? semaforoSchema(code.replace(/^SEM_/, '') as KpiCode) : null;
    case 'CONTENIDO': return code === 'CON_PROHIBIDOS' ? prohibidosSchema : code === 'CON_PILARES' ? pilaresSchema : code === 'CON_LLAMADO_LANDING' ? llamadoSchema : code === 'CON_EVIDENCIA' ? vacioSchema : null;
    case 'COBERTURA': return code === 'COB_B1' ? cobB1Schema : code === 'COB_B2' ? cobB2Schema : code === 'COB_ATRIBUCION' ? cobAtribucionSchema : null;
    case 'AUTOMATIZACION': return code === 'AUT_ENFRIAMIENTO' ? enfriamientoSchema : code.startsWith('AUT_SEMANAL_') ? semanalSchema : null;
    case 'ALERTA': return alertaSchema;
    case 'DIRECTRIZ': return directrizSchema;
    default: return null;
  }
}
const mensajeIssue = (issue: z.core.$ZodIssue) => `${issue.path.length ? `${issue.path.join('.')}: ` : ''}${issue.message}`;

// ---------------------------------------------------------------------------
// Reglas de fábrica
// ---------------------------------------------------------------------------

export type ReglaFabrica = { code: string; category: Categoria; name: string; description: string; params: Record<string, unknown>; enabled: boolean; locked: boolean; origin: 'SISTEMA' };
const medicion = (code: string, name: string, description: string, valor: unknown): ReglaFabrica => ({ code, category: 'MEDICION', name, description, params: { valor }, enabled: true, locked: true, origin: 'SISTEMA' });

export const REGLAS_DE_FABRICA: readonly ReglaFabrica[] = [
  ...KPI_DEFS.map((def): ReglaFabrica => ({
    code: `SEM_${def.code}`, category: 'SEMAFORO', name: `Semáforo ${def.code}`, enabled: true, locked: false, origin: 'SISTEMA', params: { ...def.thresholds },
    description: `Niveles de «${def.name}». ${def.thresholds.direction === 'HIGHER_BETTER' ? 'Mayor es mejor: rojo por debajo de yellow, verde desde green.' : 'Menor es mejor: rojo por encima de yellow, verde hasta green.'}`
  })),
  medicion('MED_ZONA_HORARIA', 'Zona horaria', 'Todas las fechas y horas se miden en la hora de Lima (UTC−5, sin horario de verano).', 'America/Lima (UTC−5)'),
  medicion('MED_MITAD_VIDEO', 'Mitad del video', 'Una reproducción llegó a la mitad cuando alcanza al menos el 50 % de la duración del video.', 50),
  medicion('MED_UN_VISITANTE_POR_DISPOSITIVO', 'Un visitante por dispositivo', 'Un BUYER es un visitante anónimo: se cuenta un visitante por dispositivo, no por persona ni por contacto.', 'dispositivo'),
  medicion('MED_ELEGIBLE', 'Reproducción elegible', 'Una reproducción es elegible para B-2.3 si el dispositivo no tenía un formulario previo y el contacto aún no estaba registrado.', 'dispositivo sin formulario previo y contacto no registrado'),
  medicion('MED_MISMA_VISITA_MISMO_DIA', 'Misma visita, mismo día', 'La conversión de B-2.3 solo cuenta el formulario enviado en la misma visita y el mismo día (hora de Lima) de la reproducción.', 'misma visita y mismo día de Lima'),
  medicion('MED_B12_FORMULA', 'Fórmula de B-1.2', 'B-1.2 = costo del periodo / leads nuevos de campañas pagadas del periodo (dos agregaciones separadas del DataMart, sin cruzar hechos).', 'costo del periodo / leads nuevos de campañas pagadas del periodo'),
  {
    code: 'CON_PROHIBIDOS', category: 'CONTENIDO', name: 'Términos prohibidos', enabled: true, locked: false, origin: 'SISTEMA',
    description: 'Una propuesta no puede contener estos términos. Cada término es texto literal (sin expresiones regulares); se compara sin tildes ni mayúsculas y alcanza plurales y derivados. Los detectores integrados cubren las formas habituales de precios, descuentos, becas y promesas de ingreso.',
    params: {
      terminos: [
        { etiqueta: 'precio', patron: '', integrado: 'PRECIO', soloPublicable: true },
        { etiqueta: 'descuento', patron: '', integrado: 'DESCUENTO' },
        { etiqueta: 'beca', patron: '', integrado: 'BECA' },
        { etiqueta: 'promesa de ingreso', patron: '', integrado: 'PROMESA_INGRESO' },
        { etiqueta: 'resultado inventado', patron: '', integrado: 'RESULTADO_INVENTADO', soloPublicable: true }
      ]
    }
  },
  {
    code: 'CON_PILARES', category: 'CONTENIDO', name: 'Pilares del servicio', enabled: true, locked: false, origin: 'SISTEMA',
    description: 'Pilares que debe destacar una publicación: cada una nombra al menos `minimo` de ellos (por su nombre o sus palabras clave).',
    params: {
      pilares: [
        { nombre: 'Preparación flexible', palabrasClave: ['preparación flexible', 'flexib', 'a tu ritmo', 'a su ritmo', 'a su propio ritmo', 'a tu propio ritmo'] },
        { nombre: 'Ruta de estudio', palabrasClave: ['ruta de estudio', 'ruta de preparación', 'ruta'] },
        { nombre: 'Seguimiento académico', palabrasClave: ['seguimiento académico', 'seguimiento'] }
      ],
      minimo: 1
    }
  },
  { code: 'CON_LLAMADO_LANDING', category: 'CONTENIDO', name: 'Llamado a la landing', enabled: true, locked: false, origin: 'SISTEMA', description: 'Toda publicación lleva un llamado a entrar a la landing y completar el formulario. Si falta, se añade la frase de respaldo.', params: { fraseDeRespaldo: FRASE_LLAMADO } },
  { code: 'CON_EVIDENCIA', category: 'CONTENIDO', name: 'Evidencia numérica', enabled: true, locked: false, origin: 'SISTEMA', description: 'Toda recomendación cita cifras que existen en el contexto del periodo; si no, se reemplaza por la evidencia de la plantilla.', params: {} },
  { code: 'COB_B1', category: 'COBERTURA', name: 'Cobertura de B1', enabled: true, locked: false, origin: 'SISTEMA', description: 'Públicos y canales para los que se genera una publicación (una por combinación).', params: { publicos: [...PUBLICOS], canales: [...CANALES] } },
  { code: 'COB_B2', category: 'COBERTURA', name: 'Salida por video (B2)', enabled: true, locked: false, origin: 'SISTEMA', description: 'Por cada video vigente: variantes de guion, variantes del llamado y recomendaciones; máximo de videos por ejecución.', params: { guiones: 2, llamados: 3, recomendaciones: [...RECOMENDACIONES_B2], maxVideos: 6 } },
  { code: 'COB_ATRIBUCION', category: 'COBERTURA', name: 'Mejoras de atribución', enabled: true, locked: false, origin: 'SISTEMA', description: 'Recomienda mejorar la atribución a campañas cuando B-1.1 no alcanza el nivel indicado (NO_VERDE = rojo o amarillo).', params: { cuando: 'NO_VERDE' } },
  { code: 'AUT_SEMANAL_B1', category: 'AUTOMATIZACION', name: 'Ejecución semanal de B-1', enabled: true, locked: false, origin: 'SISTEMA', description: 'Indica el día y la hora de Lima en que el agente debe ejecutar B-1. En modo Automático (cada semana), trabaja según este horario.', params: { diaSemana: 1, hora: 8 } },
  { code: 'AUT_SEMANAL_B2', category: 'AUTOMATIZACION', name: 'Ejecución semanal de B-2', enabled: true, locked: false, origin: 'SISTEMA', description: 'Indica el día y la hora de Lima en que el agente debe ejecutar B-2. En modo Automático (cada semana), trabaja según este horario.', params: { diaSemana: 1, hora: 8 } },
  { code: 'AUT_ENFRIAMIENTO', category: 'AUTOMATIZACION', name: 'Enfriamiento entre ejecuciones', enabled: true, locked: false, origin: 'SISTEMA', description: 'Días mínimos que deben pasar entre ejecuciones de una actividad iniciadas por una alerta cuando está activo Automático (cada semana).', params: { dias: 7 } },
  { code: 'APR_HUMANA', category: 'APROBACION', name: 'Aprobación humana', enabled: true, locked: true, origin: 'SISTEMA', description: 'Ninguna propuesta se publica sin la aprobación de una persona: el agente solo crea borradores.', params: { valor: 'toda propuesta nace como borrador y la decide una persona' } },
  { code: 'ALR_B1_ROJO', category: 'ALERTA', name: 'KPI de B-1 en rojo → ejecutar B1', enabled: true, locked: false, origin: 'SISTEMA', description: 'Si algún KPI de B-1 está en rojo en el periodo por defecto, avisa. Si está activo Automático (cada semana), también ejecuta B-1.', params: { kpi: 'B1', estado: 'ROJO', accion: 'EJECUTAR_B1' } },
  { code: 'ALR_B2_ROJO', category: 'ALERTA', name: 'KPI de B-2 en rojo → ejecutar B2', enabled: true, locked: false, origin: 'SISTEMA', description: 'Si algún KPI de B-2 está en rojo en el periodo por defecto, avisa. Si está activo Automático (cada semana), también ejecuta B-2.', params: { kpi: 'B2', estado: 'ROJO', accion: 'EJECUTAR_B2' } }
];
const FABRICA_POR_CODIGO = new Map(REGLAS_DE_FABRICA.map(regla => [regla.code, regla]));

// ---------------------------------------------------------------------------
// Reglas vigentes (lo que consume el resto del código)
// ---------------------------------------------------------------------------

export type ReglaFila = {
  id: number; code: string; category: Categoria; name: string; description: string | null; params: Record<string, any>; enabled: boolean;
  origin: 'SISTEMA' | 'USUARIO'; locked: boolean; updatedBy: string | null; updatedAt: Date | string | null; createdAt: Date | string | null;
};
export type AlertaVigente = { id: number; code: string; name: string; params: ParamsAlerta };
export type DirectrizVigente = { id: number; texto: string; aplicaA: 'B1' | 'B2' | 'AMBAS' };
export type ReglasVigentes = {
  version: string; semVersion: string;
  semaforos: Record<KpiCode, Umbral>;
  prohibidos: { activo: boolean; terminos: Termino[] };
  pilares: { activo: boolean; pilares: Pilar[]; minimo: number };
  llamado: { activo: boolean; frase: string };
  evidencia: { activo: boolean };
  b1: { publicos: Publico[]; canales: CanalBuyer[] };
  b2: { guiones: number; llamados: number; recomendaciones: RecomendacionB2[]; maxVideos: number };
  atribucion: { activo: boolean; cuando: 'ROJO' | 'NO_VERDE' };
  automatizacion: { B1: { activo: boolean; diaSemana: number; hora: number }; B2: { activo: boolean; diaSemana: number; hora: number }; enfriamientoDias: number };
  alertas: AlertaVigente[];
  directrices: DirectrizVigente[];
};

const hash = (valor: unknown) => createHash('sha1').update(JSON.stringify(valor)).digest('hex').slice(0, 10);

/** Parámetros válidos de la fila, o los de fábrica si la fila falta o está corrupta (nunca lanza). */
function paramsDe(fila: ReglaFila | undefined, code: string): any {
  const fabrica = FABRICA_POR_CODIGO.get(code);
  const esquema = esquemaDeParametros((fila?.category ?? fabrica?.category) as Categoria, code);
  if (fila && esquema) { const r = esquema.safeParse(fila.params); if (r.success) return r.data; }
  return fabrica?.params;
}

/** Construye las reglas vigentes desde las filas de la tabla (función pura). Una regla de sistema ausente o inválida usa su valor de fábrica. */
export function construirVigentes(filas: ReglaFila[]): ReglasVigentes {
  const porCodigo = new Map(filas.map(fila => [fila.code, fila]));
  const activa = (code: string) => porCodigo.get(code)?.enabled ?? FABRICA_POR_CODIGO.get(code)?.enabled ?? true;
  const semaforos = Object.fromEntries(KPI_DEFS.map(def => [def.code, { ...(paramsDe(porCodigo.get(`SEM_${def.code}`), `SEM_${def.code}`) as Umbral) }])) as Record<KpiCode, Umbral>;
  const alertas: AlertaVigente[] = [];
  const directrices: DirectrizVigente[] = [];
  for (const fila of filas) {
    if (!fila.enabled) continue;
    if (fila.category === 'ALERTA') { const r = alertaSchema.safeParse(fila.params); if (r.success) alertas.push({ id: fila.id, code: fila.code, name: fila.name, params: r.data }); }
    if (fila.category === 'DIRECTRIZ') { const r = directrizSchema.safeParse(fila.params); if (r.success) directrices.push({ id: fila.id, texto: r.data.texto, aplicaA: r.data.aplicaA }); }
  }
  const prohibidos = paramsDe(porCodigo.get('CON_PROHIBIDOS'), 'CON_PROHIBIDOS') as { terminos: Termino[] };
  const pilares = paramsDe(porCodigo.get('CON_PILARES'), 'CON_PILARES') as { pilares: Pilar[]; minimo: number };
  const semanal = (actividad: 'B1' | 'B2') => { const p = paramsDe(porCodigo.get(`AUT_SEMANAL_${actividad}`), `AUT_SEMANAL_${actividad}`); return { activo: activa(`AUT_SEMANAL_${actividad}`), diaSemana: p.diaSemana as number, hora: p.hora as number }; };
  const cobB2 = paramsDe(porCodigo.get('COB_B2'), 'COB_B2');
  const vigentes: Omit<ReglasVigentes, 'version' | 'semVersion'> = {
    semaforos,
    prohibidos: { activo: activa('CON_PROHIBIDOS'), terminos: prohibidos.terminos.map(t => ({ ...t })) },
    pilares: { activo: activa('CON_PILARES'), pilares: pilares.pilares.map(p => ({ ...p, palabrasClave: [...p.palabrasClave] })), minimo: pilares.minimo },
    llamado: { activo: activa('CON_LLAMADO_LANDING'), frase: paramsDe(porCodigo.get('CON_LLAMADO_LANDING'), 'CON_LLAMADO_LANDING').fraseDeRespaldo },
    evidencia: { activo: activa('CON_EVIDENCIA') },
    b1: { ...(paramsDe(porCodigo.get('COB_B1'), 'COB_B1') as { publicos: Publico[]; canales: CanalBuyer[] }) },
    b2: { ...cobB2, recomendaciones: [...cobB2.recomendaciones] },
    atribucion: { activo: activa('COB_ATRIBUCION'), cuando: paramsDe(porCodigo.get('COB_ATRIBUCION'), 'COB_ATRIBUCION').cuando },
    automatizacion: { B1: semanal('B1'), B2: semanal('B2'), enfriamientoDias: paramsDe(porCodigo.get('AUT_ENFRIAMIENTO'), 'AUT_ENFRIAMIENTO').dias },
    alertas, directrices
  };
  return { ...vigentes, semVersion: hash(semaforos), version: hash(vigentes) };
}

const filaDeFabrica = (regla: ReglaFabrica, id: number): ReglaFila => ({ id, ...regla, params: structuredClone(regla.params), updatedBy: null, updatedAt: null, createdAt: null });
/** Reglas de fábrica como valor por defecto de todas las funciones puras. */
export const REGLAS_FABRICA: ReglasVigentes = construirVigentes(REGLAS_DE_FABRICA.map((regla, i) => filaDeFabrica(regla, i + 1)));

// ---------------------------------------------------------------------------
// Funciones puras que aplican las reglas
// ---------------------------------------------------------------------------

/** Semáforo de un KPI. `null`/no finito → SIN_DATOS. Los bordes pertenecen al estado mejor (60 % → AMARILLO, 80 % → VERDE; S/ 8 → VERDE, S/ 15 → AMARILLO). */
export function semaforo(code: KpiCode | string, value: number | null | undefined, reglas: ReglasVigentes = REGLAS_FABRICA): Estado {
  const umbral = reglas.semaforos[code as KpiCode];
  if (!umbral) throw new Error(`KPI desconocido: ${code}`);
  if (value == null || !Number.isFinite(value)) return 'SIN_DATOS';
  const { direction, yellow, green } = umbral;
  if (direction === 'HIGHER_BETTER') return value < yellow ? 'ROJO' : value >= green ? 'VERDE' : 'AMARILLO';
  return value > yellow ? 'ROJO' : value <= green ? 'VERDE' : 'AMARILLO';
}

/** Directrices activas que aplican a la actividad. */
export const directricesPara = (reglas: ReglasVigentes, actividad: ActividadBuyer) => reglas.directrices.filter(d => d.aplicaA === 'AMBAS' || d.aplicaA === actividad);

/** Instantánea compacta de las reglas usadas por una ejecución (se guarda en `context.reglas` para auditoría). */
export function instantaneaReglas(reglas: ReglasVigentes, actividad: ActividadBuyer) {
  return {
    version: reglas.version,
    semaforos: Object.fromEntries(KPI_DEFS.filter(def => def.activity === actividad).map(def => [def.code, reglas.semaforos[def.code]])),
    prohibidos: { activo: reglas.prohibidos.activo, terminos: reglas.prohibidos.terminos.map(t => ({ etiqueta: t.etiqueta, patron: t.patron, ...(t.integrado ? { integrado: t.integrado } : {}) })) },
    pilares: reglas.pilares, llamado: reglas.llamado, evidencia: reglas.evidencia,
    cobertura: actividad === 'B1' ? { ...reglas.b1, atribucion: reglas.atribucion } : reglas.b2,
    directrices: directricesPara(reglas, actividad).map(d => ({ id: d.id, texto: d.texto, aplicaA: d.aplicaA }))
  };
}

// ---------------------------------------------------------------------------
// Errores y caché
// ---------------------------------------------------------------------------

export class ReglaError extends Error {
  constructor(public readonly status: 400 | 403 | 404 | 409 | 422, message: string, public readonly issues: string[] = []) { super(message); this.name = 'ReglaError'; }
}

type Memo = { en: number; estado: { filas: ReglaFila[]; vigentes: ReglasVigentes } | null; promesa: Promise<{ filas: ReglaFila[]; vigentes: ReglasVigentes }> | null };
const globalReglas = globalThis as unknown as { ampBuyerRules?: Memo; ampBuyerRulesInvalidadores?: Set<(categoria: string) => void> };
const memo: Memo = (globalReglas.ampBuyerRules ||= { en: 0, estado: null, promesa: null });
const invalidadores = (globalReglas.ampBuyerRulesInvalidadores ||= new Set());
export const TTL_REGLAS_MS = 5000;

/** Registra una función que se llama al cambiar reglas (buyer-kpis vacía su caché cuando cambia un semáforo). */
export function alCambiarReglas(callback: (categoria: string) => void) { invalidadores.add(callback); }
export function invalidarCacheReglas(categoria = '*') {
  memo.en = 0; memo.estado = null; memo.promesa = null;
  for (const callback of invalidadores) { try { callback(categoria); } catch { /* un invalidador no debe romper la escritura */ } }
}

const analizar = (valor: unknown) => { if (valor == null || valor === '') return {}; try { const r = JSON.parse(String(valor)); return r && typeof r === 'object' ? r : {}; } catch { return {}; } };
async function cargarFilas(): Promise<ReglaFila[]> {
  const filas = plainMany<any>(await tables().amp_buyer_rules.findAll({ order: [['id', 'ASC']] }));
  return filas.map(f => ({ ...f, enabled: !!f.enabled, locked: !!f.locked, params: analizar(f.params) }));
}
async function cargarEstado() {
  const filas = await cargarFilas();
  return { filas, vigentes: construirVigentes(filas) };
}
/** Filas y reglas vigentes con caché de unos segundos (se invalida al escribir en este proceso). */
export async function estadoReglas() {
  if (memo.estado && Date.now() - memo.en < TTL_REGLAS_MS) return memo.estado;
  if (memo.promesa) return memo.promesa;
  const promesa = cargarEstado().then(estado => { if (memo.promesa === promesa) { memo.estado = estado; memo.en = Date.now(); } return estado; }).finally(() => { if (memo.promesa === promesa) memo.promesa = null; });
  memo.promesa = promesa;
  return promesa;
}
/** Reglas vigentes (caché corta). */
export async function reglasVigentes(): Promise<ReglasVigentes> { return (await estadoReglas()).vigentes; }

// ---------------------------------------------------------------------------
// Lectura para la API
// ---------------------------------------------------------------------------

const ordenado = (valor: unknown): unknown => Array.isArray(valor) ? valor.map(ordenado) : valor && typeof valor === 'object' ? Object.fromEntries(Object.keys(valor).sort().map(k => [k, ordenado((valor as any)[k])])) : valor;
const igual = (a: unknown, b: unknown) => JSON.stringify(ordenado(a)) === JSON.stringify(ordenado(b));
const iso = (valor: unknown) => (valor instanceof Date ? valor.toISOString() : valor == null ? null : String(valor));

export type ReglaApi = {
  id: number; code: string; category: Categoria; name: string; description: string | null; params: Record<string, any>; enabled: boolean; origin: 'SISTEMA' | 'USUARIO'; locked: boolean;
  isDefault: boolean; defaultParams: Record<string, any> | null; updatedBy: string | null; updatedByName: string | null; updatedAt: string | null; createdAt: string | null;
};
async function nombresDeUsuarios(): Promise<Map<string, string>> {
  const filas = plainMany<any>(await tables().amp_users.findAll({ attributes: ['id', 'name'] }));
  return new Map(filas.map(f => [String(f.id), String(f.name)]));
}
function aApi(fila: ReglaFila, nombres: Map<string, string>): ReglaApi {
  const fabrica = fila.origin === 'SISTEMA' ? FABRICA_POR_CODIGO.get(fila.code) : undefined;
  return {
    id: fila.id, code: fila.code, category: fila.category, name: fila.name, description: fila.description, params: fila.params, enabled: fila.enabled, origin: fila.origin, locked: fila.locked,
    isDefault: fabrica ? igual(fila.params, fabrica.params) && fila.enabled === fabrica.enabled : false,
    defaultParams: fabrica ? fabrica.params : null,
    updatedBy: fila.updatedBy, updatedByName: fila.updatedBy ? nombres.get(fila.updatedBy) ?? null : null, updatedAt: iso(fila.updatedAt), createdAt: iso(fila.createdAt)
  };
}

/** `GET buyer/rules` (sin `canEdit`, que lo añade la ruta según el rol). */
export async function listarReglas() {
  const [{ filas }, nombres] = await Promise.all([estadoReglas(), nombresDeUsuarios()]);
  return {
    categories: CATEGORIAS.map(category => ({ category, label: INFO_CATEGORIAS[category].label, description: INFO_CATEGORIAS[category].description })),
    rules: filas.map(fila => aApi(fila, nombres)),
    history: await historialReglas(30)
  };
}

/** Últimos cambios de reglas (de `amp_events`, tipo `BUYER_RULE_CHANGE`). */
export async function historialReglas(limite = 50) {
  const filas = plainMany<any>(await tables().amp_events.findAll({ where: { type: 'BUYER_RULE_CHANGE' }, order: [['id', 'DESC']], limit: limite }));
  const nombres = await nombresDeUsuarios();
  return filas.map(f => ({ id: f.id, at: iso(f.createdAt), actorId: f.actorId ?? null, actorName: f.actorId ? nombres.get(String(f.actorId)) ?? null : null, summary: f.summary, detail: analizar(f.detail) }));
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

export const guardarReglaSchema = z.object({
  id: z.number().int().positive().optional(),
  category: z.enum(CATEGORIAS),
  name: z.string().trim().min(3, 'name: mínimo 3 caracteres').max(150, 'name: máximo 150 caracteres').optional(),
  description: z.preprocess(v => (v === '' ? null : v), z.string().trim().max(500, 'description: máximo 500 caracteres').nullish()),
  params: z.record(z.string(), z.unknown()),
  enabled: z.boolean().optional()
});
export const eliminarReglaSchema = z.object({ id: z.number().int().positive() });
export const restaurarReglaSchema = z.union([z.object({ id: z.number().int().positive() }), z.object({ all: z.literal(true) })]);

export const MAX_ALERTAS = 30;
export const MAX_DIRECTRICES = 20;
/** Reglas que no se pueden desactivar. */
const SIEMPRE_ACTIVAS = (fila: Pick<ReglaFila, 'category' | 'code'>) => fila.category === 'SEMAFORO' || fila.code === 'COB_B1' || fila.code === 'COB_B2';

function validarParams(category: Categoria, code: string, params: unknown) {
  const esquema = esquemaDeParametros(category, code);
  if (!esquema) throw new ReglaError(409, 'Esta regla es informativa: la define el DataMart o el sistema y no admite cambios');
  const r = esquema.safeParse(params);
  if (!r.success) throw new ReglaError(422, 'Los parámetros de la regla no son válidos', r.error.issues.map(mensajeIssue));
  return r.data as Record<string, any>;
}

/** Coherencia entre reglas: las frases de respaldo no pueden contener términos prohibidos vigentes. */
function validarCoherencia(filas: ReglaFila[], cambiada: ReglaFila) {
  if (!['CON_PROHIBIDOS', 'CON_PILARES', 'CON_LLAMADO_LANDING'].includes(cambiada.code)) return;
  const vigentes = construirVigentes(filas);
  const issues: string[] = [];
  const pilares = detectarProhibidosCon(vigentes.prohibidos, frasePilares(vigentes.pilares.pilares), 'PUBLICACION');
  if (vigentes.pilares.activo && pilares.length) issues.push(`La frase de respaldo de los pilares («${frasePilares(vigentes.pilares.pilares)}») contiene términos prohibidos: ${pilares.join(', ')}`);
  const llamado = detectarProhibidosCon(vigentes.prohibidos, vigentes.llamado.frase, 'PUBLICACION');
  if (vigentes.llamado.activo && llamado.length) issues.push(`La frase de respaldo del llamado a la landing contiene términos prohibidos: ${llamado.join(', ')}`);
  if (issues.length) throw new ReglaError(422, 'La regla entra en conflicto con otras reglas vigentes', issues);
}

const instantanea = (fila: Pick<ReglaFila, 'name' | 'description' | 'params' | 'enabled'> | null) => (fila ? { name: fila.name, description: fila.description, params: fila.params, enabled: fila.enabled } : null);
async function auditar(accion: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE', fila: ReglaFila, antes: ReturnType<typeof instantanea>, despues: ReturnType<typeof instantanea>, usuarioId: string) {
  const verbo = { CREATE: 'creada', UPDATE: 'modificada', DELETE: 'eliminada', RESTORE: 'restaurada a fábrica' }[accion];
  await event(null, 'BUYER_RULE_CHANGE', `Regla ${fila.code} (${fila.name}) ${verbo}.`, 'OPERATOR', usuarioId, { action: accion, ruleId: fila.id, code: fila.code, category: fila.category, before: antes, after: despues });
}
async function leerFila(id: number): Promise<ReglaFila | null> {
  const fila = plain<any>(await tables().amp_buyer_rules.findByPk(id));
  return fila ? { ...fila, enabled: !!fila.enabled, locked: !!fila.locked, params: analizar(fila.params) } : null;
}
const codigoNuevo = (category: 'ALERTA' | 'DIRECTRIZ') => `${category === 'ALERTA' ? 'ALR' : 'DIR'}_${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

/** Crea (solo ALERTA y DIRECTRIZ) o modifica una regla. Lanza `ReglaError` (404, 409, 422). */
export async function guardarRegla(datos: z.infer<typeof guardarReglaSchema>, usuarioId: string): Promise<ReglaApi> {
  const { filas } = await cargarEstado();
  const actual = datos.id ? filas.find(f => f.id === datos.id) : undefined;
  if (datos.id && !actual) throw new ReglaError(404, 'Regla no encontrada');
  const nombres = await nombresDeUsuarios();
  const db = tables().amp_buyer_rules;
  if (actual) {
    if (actual.category !== datos.category) throw new ReglaError(422, 'La categoría no coincide con la de la regla', ['category: no se puede cambiar la categoría de una regla']);
    if (actual.locked) throw new ReglaError(409, 'Regla bloqueada: la define el DataMart o el sistema y no admite cambios');
    const params = validarParams(actual.category, actual.code, datos.params);
    const enabled = datos.enabled ?? actual.enabled;
    if (!enabled && SIEMPRE_ACTIVAS(actual)) throw new ReglaError(422, 'Esta regla no se puede desactivar', [actual.category === 'SEMAFORO' ? 'Los semáforos siempre están activos' : 'La cobertura de B1 y B2 siempre está activa']);
    const usuarioRegla = actual.origin === 'USUARIO' || actual.category === 'ALERTA';
    const siguiente: ReglaFila = { ...actual, params, enabled, name: usuarioRegla ? datos.name ?? actual.name : actual.name, description: usuarioRegla ? (datos.description === undefined ? actual.description : datos.description) : actual.description, updatedBy: usuarioId, updatedAt: new Date() };
    validarCoherencia(filas.map(f => (f.id === actual.id ? siguiente : f)), siguiente);
    await db.update({ name: siguiente.name, description: siguiente.description, params: JSON.stringify(params), enabled, updatedBy: usuarioId, updatedAt: siguiente.updatedAt }, { where: { id: actual.id } });
    invalidarCacheReglas(actual.category);
    await auditar('UPDATE', siguiente, instantanea(actual), instantanea(siguiente), usuarioId);
    return aApi((await leerFila(actual.id))!, nombres);
  }
  if (datos.category !== 'ALERTA' && datos.category !== 'DIRECTRIZ') throw new ReglaError(422, 'Solo se crean reglas de tipo ALERTA o DIRECTRIZ', ['category: solo ALERTA o DIRECTRIZ admiten reglas nuevas']);
  if (!datos.name) throw new ReglaError(422, 'Falta el nombre de la regla', ['name: obligatorio para reglas nuevas']);
  const limite = datos.category === 'ALERTA' ? MAX_ALERTAS : MAX_DIRECTRICES;
  if (filas.filter(f => f.category === datos.category).length >= limite) throw new ReglaError(422, `Se alcanzó el máximo de ${limite} reglas de este tipo`, [`Elimina alguna regla ${datos.category} antes de crear otra`]);
  const params = validarParams(datos.category, '', datos.params);
  const ahora = new Date();
  const code = codigoNuevo(datos.category);
  const creada = await db.create({ code, category: datos.category, name: datos.name, description: datos.description ?? null, params: JSON.stringify(params), enabled: datos.enabled ?? true, origin: 'USUARIO', locked: false, updatedBy: usuarioId, updatedAt: ahora, createdAt: ahora });
  invalidarCacheReglas(datos.category);
  const fila = (await leerFila(Number(creada.get('id'))))!;
  await auditar('CREATE', fila, null, instantanea(fila), usuarioId);
  return aApi(fila, nombres);
}

/** Elimina una regla de usuario (o una ALERTA de fábrica). Las demás reglas de sistema no se eliminan: se restauran. */
export async function eliminarRegla(id: number, usuarioId: string) {
  const fila = await leerFila(id);
  if (!fila) throw new ReglaError(404, 'Regla no encontrada');
  if (fila.locked) throw new ReglaError(409, 'Regla bloqueada: no se puede eliminar');
  if (fila.origin === 'SISTEMA' && fila.category !== 'ALERTA') throw new ReglaError(409, 'Las reglas de sistema no se eliminan: modifícalas o restáuralas a su valor de fábrica');
  await tables().amp_buyer_rules.destroy({ where: { id } });
  invalidarCacheReglas(fila.category);
  await auditar('DELETE', fila, instantanea(fila), null, usuarioId);
  return { ok: true as const, id, code: fila.code };
}

async function restaurarFila(fila: ReglaFila, fabrica: ReglaFabrica, usuarioId: string): Promise<boolean> {
  if (igual(fila.params, fabrica.params) && fila.enabled === fabrica.enabled && fila.name === fabrica.name && fila.description === fabrica.description) return false;
  const nueva = { ...fila, name: fabrica.name, description: fabrica.description, params: structuredClone(fabrica.params), enabled: fabrica.enabled };
  await tables().amp_buyer_rules.update({ name: nueva.name, description: nueva.description, params: JSON.stringify(nueva.params), enabled: nueva.enabled, updatedBy: usuarioId, updatedAt: new Date() }, { where: { id: fila.id } });
  await auditar('RESTORE', nueva, instantanea(fila), instantanea(nueva), usuarioId);
  return true;
}
async function recrearFila(fabrica: ReglaFabrica, usuarioId: string) {
  const ahora = new Date();
  const creada = await tables().amp_buyer_rules.create({ code: fabrica.code, category: fabrica.category, name: fabrica.name, description: fabrica.description, params: JSON.stringify(fabrica.params), enabled: fabrica.enabled, origin: 'SISTEMA', locked: fabrica.locked, updatedBy: usuarioId, updatedAt: ahora, createdAt: ahora });
  const fila = (await leerFila(Number(creada.get('id'))))!;
  await auditar('RESTORE', fila, null, instantanea(fila), usuarioId);
}

/** Restaura una regla de sistema a su valor de fábrica. */
export async function restaurarRegla(id: number, usuarioId: string) {
  const fila = await leerFila(id);
  if (!fila) throw new ReglaError(404, 'Regla no encontrada');
  const fabrica = fila.origin === 'SISTEMA' ? FABRICA_POR_CODIGO.get(fila.code) : undefined;
  if (!fabrica) throw new ReglaError(409, 'Solo se restauran reglas de sistema; las reglas creadas por el usuario se modifican o eliminan');
  if (fila.locked) throw new ReglaError(409, 'Regla bloqueada: no tiene cambios que restaurar');
  const cambio = await restaurarFila(fila, fabrica, usuarioId);
  invalidarCacheReglas(fila.category);
  return { rule: aApi((await leerFila(id))!, await nombresDeUsuarios()), restored: cambio ? 1 : 0 };
}
/** Restaura TODAS las reglas de sistema (y vuelve a crear las ALERTA de fábrica eliminadas). */
export async function restaurarTodas(usuarioId: string) {
  const filas = await cargarFilas();
  let restauradas = 0;
  for (const fabrica of REGLAS_DE_FABRICA) {
    const fila = filas.find(f => f.code === fabrica.code && f.origin === 'SISTEMA');
    if (fabrica.locked) { if (!filas.some(f => f.code === fabrica.code)) { await recrearFila(fabrica, usuarioId); restauradas++; } continue; }
    if (!fila) { if (!filas.some(f => f.code === fabrica.code)) { await recrearFila(fabrica, usuarioId); restauradas++; } continue; }
    if (await restaurarFila(fila, fabrica, usuarioId)) restauradas++;
  }
  invalidarCacheReglas('*');
  const nombres = await nombresDeUsuarios();
  return { restored: restauradas, rules: (await cargarFilas()).map(f => aApi(f, nombres)) };
}

/** Siembra idempotente (migración 010): crea las reglas de sistema que falten por código; no toca las existentes. */
export async function sembrarReglas(): Promise<number> {
  const db = tables().amp_buyer_rules;
  const existentes = new Set(plainMany<any>(await db.findAll({ attributes: ['code'] })).map(f => String(f.code)));
  let creadas = 0;
  for (const regla of REGLAS_DE_FABRICA) {
    if (existentes.has(regla.code)) continue;
    const ahora = new Date();
    await db.create({ code: regla.code, category: regla.category, name: regla.name, description: regla.description, params: JSON.stringify(regla.params), enabled: regla.enabled, origin: 'SISTEMA', locked: regla.locked, updatedBy: null, updatedAt: ahora, createdAt: ahora });
    creadas++;
  }
  return creadas;
}
