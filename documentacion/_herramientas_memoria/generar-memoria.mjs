// Genera documentacion/Memoria_Descriptiva_LaPreDigital_AMP.docx
// Uso: node generar-diagramas.mjs && node generar-memoria.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, Footer, PageNumber,
  AlignmentType, WidthType, BorderStyle, PageBreak, VerticalAlign, TableLayoutType
} from 'docx';

const aqui = dirname(fileURLToPath(import.meta.url));
const img = n => readFileSync(join(aqui, 'img', n));
const salida = join(aqui, '..', 'Memoria_Descriptiva_LaPreDigital_AMP.docx');

const TITULO = 'LaPreDigital AMP: plataforma web de gestión de agentes de inteligencia artificial para la conversión y fidelización de estudiantes de una academia preuniversitaria digital';
const FONT = 'Arial';
const SZ = 22; // 11 pt

const run = (text, o = {}) => new TextRun({ text, font: FONT, size: SZ, ...o });
// Texto con **negrita** inline
function runs(texto, o = {}) {
  return texto.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(p =>
    p.startsWith('**') ? run(p.slice(2, -2), { bold: true, ...o }) : run(p, o));
}
const P = (texto, o = {}) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 140, line: 276 }, children: runs(texto), ...o });
const H = texto => new Paragraph({ spacing: { before: 280, after: 140 }, keepNext: true, children: [run(texto, { bold: true, size: 24 })] });
// Elemento de lista con letra (A), B)...) y nombre en negrita
const MOD = (letra, nombre, desc) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED, spacing: { after: 110, line: 270 },
  indent: { left: 567, hanging: 567 },
  children: [run(`${letra})\t`, { bold: true }), run(`${nombre}: `, { bold: true }), ...runs(desc)],
  tabStops: [{ type: 'left', position: 567 }]
});
const SUB = (letra, nombre) => new Paragraph({ spacing: { before: 200, after: 100 }, keepNext: true, children: [run(`${letra}) ${nombre}`, { bold: true })] });
const BUL = (nombre, desc) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED, spacing: { after: 90, line: 270 },
  indent: { left: 567, hanging: 283 },
  children: [run('•\t'), run(`${nombre}: `, { bold: true }), ...runs(desc)],
  tabStops: [{ type: 'left', position: 567 }]
});
const IMG = (nombre, ancho, alto) => new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, keepNext: true,
  children: [new ImageRun({ type: 'png', data: img(nombre), transformation: { width: ancho, height: alto },
    altText: { title: nombre, description: nombre, name: nombre } })]
});
const CAP = t => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run(t, { italics: true, size: 20 })] });

const dims = JSON.parse(readFileSync(join(aqui, 'img', 'dims.json'), 'utf8'));
const ANCHO_IMG = 610;
const f1 = dims['figura1-arquitectura'], f2 = dims['figura2-flujo-agente'];

// ---------- Carátula ----------
const caratula = [
  new Paragraph({ spacing: { before: 2600 }, alignment: AlignmentType.CENTER, children: [run('MEMORIA DESCRIPTIVA', { bold: true, size: 44 })] }),
  new Paragraph({ spacing: { before: 700, after: 300 }, alignment: AlignmentType.CENTER, children: [run('LaPreDigital AMP', { bold: true, size: 36 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200, line: 300 }, children: [run('Agents Management Platform', { size: 26 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400, line: 320 }, indent: { left: 700, right: 700 },
    children: [run('Plataforma web de gestión de agentes de inteligencia artificial para la conversión y fidelización de estudiantes de una academia preuniversitaria digital', { size: 28 })] }),
  new Paragraph({ children: [new PageBreak()] })
];

// ---------- Cuerpo ----------
const cuerpo = [
  new Paragraph({ spacing: { after: 160 }, children: [run('TÍTULO DEL SOFTWARE', { bold: true, size: 24 })] }),
  new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 200 }, children: [run(TITULO, { bold: true })] }),

  H('1. Problema que resuelve'),
  P('LaPreDigital es una academia preuniversitaria 100 % digital que prepara a los postulantes al ingreso a la Universidad Nacional de Trujillo (UNT). Su recorrido comercial y académico atraviesa varias etapas: un visitante anónimo llega a la página de aterrizaje (Buyer), deja sus datos en un formulario (Lead), paga su plan (Payer), estudia y se mantiene activo (Customer) y, en algunos casos, se da de baja (Turned) para luego ser recuperado. Gestionar ese embudo de forma manual y dispersa, entre hojas de cálculo, chats y bases de datos separadas, provoca que el seguimiento llegue tarde: los leads se enfrían sin respuesta, las renovaciones se avisan cuando el plan ya venció y las bajas se detectan cuando el estudiante ya no responde.'),
  P('A esto se suma la falta de medición de la captación. Sin un tablero que integre las visitas, las campañas y el comportamiento del video de la página, la academia no puede saber qué porcentaje de las visitas se atribuye a una campaña, cuánto cuesta cada lead nuevo, en qué segundo abandonan los visitantes el video ni qué proporción de quienes ven la mitad del video termina completando el formulario. En consecuencia, las decisiones sobre qué contenido publicar, en qué canal y con qué guion se toman por intuición y no con evidencia, y el esfuerzo del equipo se reparte sin saber qué acciones producen resultados.'),
  P('LaPreDigital AMP resuelve estos problemas al centralizar la operación en una sola plataforma: mide la captación con indicadores y semáforos construidos a partir del DataMart, consulta en tiempo real la base operativa, asigna agentes de inteligencia artificial a cada etapa del embudo para detectar a tiempo silencios, renovaciones y bajas, y deja todas las propuestas como borradores que una persona revisa antes de que se publiquen o se envíen.'),

  H('2. Funcionalidad (Para qué sirve)'),
  P('LaPreDigital AMP actúa como un centro de mando que orquesta agentes de inteligencia artificial a lo largo del embudo IMPULSE (Buyer, Lead, Payer, Customer y Turned). Cada agente analiza el contexto de su etapa, con datos reales de la academia, y prepara acciones concretas: borradores de mensajes, estrategias de seguimiento, avisos de renovación, propuestas de publicaciones o recomendaciones sobre el video de la página. El equipo de operaciones y la alta dirección ven el estado del embudo en un solo lugar, atienden primero lo que requiere atención y cuentan con un historial auditable de cada decisión.'),
  P('La plataforma incorpora además controles de negocio: los envíos automáticos se realizan solo entre las 07:00 y las 23:00 (hora de Lima) y únicamente por canales con consentimiento; los descuentos tienen un tope de 30 %, un cupón por usuario y de un solo uso; las becas, las semibecas y las ofertas individuales exigen la aprobación de una persona, y la plataforma no procesa pagos. La aplicación abarca los siguientes módulos:'),
  MOD('A', 'Acceso y seguridad', 'Inicio de sesión con credenciales protegidas y sesión firmada de ocho horas. Define tres roles: administrador (configuración de IA, exámenes, campañas y operaciones), alta dirección (carga de resultados, aprobación y lanzamiento de campañas) y operador (atención de contactos y revisión de propuestas individuales).'),
  MOD('B', 'Dashboard', 'Resumen del embudo por etapa, aprobaciones pendientes, alertas del Radar, trabajos fallidos y actividad reciente, con actualización automática.'),
  MOD('C', 'Radar de conversaciones', 'Analizador transversal que revisa las conversaciones cada minuto desde el servidor, alerta por silencio a los 3, 7, 14 y 21 días y deja borradores de seguimiento que el operador edita, envía o marca como revisados.'),
  MOD('D', 'Buyers: Agente de conversión Buyer → Lead', 'Panel con seis indicadores de captación (B-1.1 a B-3.1) con semáforo, filtros, tendencia mensual, desgloses por canal, campaña y video, curva de abandono del video, actividad del día, notificaciones de inscripciones en vivo y bandeja de propuestas generadas por IA para aprobar, editar o descartar.'),
  MOD('E', 'Leads (Negociación)', 'Perfil de negociación de cada lead, prioridad de atención y borradores del agente Negociador para avanzar hacia el pago.'),
  MOD('F', 'Payers (Cobranza y onboarding)', 'Seguimiento de pagos y de la incorporación del estudiante, con avisos de renovación a 7, 3 y 1 días que se verifican contra el estado vigente antes de enviarse.'),
  MOD('G', 'Customers (Fidelización)', 'Acompañamiento académico del estudiante activo: seguimiento semanal, recordatorios de simulacros, detección de riesgo de inactividad y reportes al apoderado según el plan.'),
  MOD('H', 'Turned (Reactivación y postventa)', 'Gestión de estudiantes dados de baja: propuestas de reactivación y postventa con evidencia del perfil; una reactivación confirmada devuelve al contacto a la etapa Payer.'),
  MOD('I', 'Aprobaciones', 'Bandeja de decisiones humanas sobre becas, semibecas y descuentos propuestos por los agentes, con motivo auditado y generación de cupones.'),
  MOD('J', 'Campañas', 'Creación, aprobación por la alta dirección y lanzamiento de campañas de mensajes por etapa, con declaración obligatoria del tipo de oferta.'),
  MOD('K', 'Exámenes de admisión', 'Carga del listado de resultados en TXT, cálculo de los diez mejores puntajes de no ingresantes por carrera, cotejo con los contactos (carnet, nombre normalizado y comparación difusa) y revisión de coincidencias dudosas.'),
  MOD('L', 'Trabajos del servidor', 'Consulta de la cola de trabajos: estado, intentos y errores de las ejecuciones del servidor en segundo plano.'),
  MOD('M', 'Configuración', 'Selección del proveedor y del modelo de IA, y ajuste del plazo máximo de seguimiento del Radar (de 1 a 90 días); disponible para el administrador.'),
  P('Como elemento distintivo, LaPreDigital AMP combina inteligencia artificial con evidencia de datos y aprobación humana: cada propuesta se genera a partir de cifras calculadas de forma determinista, cita la evidencia que la respalda, pasa por reglas que descartan precios, descuentos o promesas de ingreso inventados y permanece como borrador hasta que un operador la aprueba. Para ello separa dos fuentes: el DataMart, que aporta los indicadores históricos, y la base operativa (OLTP), que aporta la información en tiempo real. Ambas se consultan solo en lectura.', { spacing: { before: 140, after: 140, line: 276 } }),

  H('3. Arquitectura del Software'),
  P('LaPreDigital AMP es una aplicación web de tres capas: un cliente en el navegador, un servidor de aplicación con un proceso trabajador independiente y una capa de datos sobre tres bases de SQL Server. La Figura 1 muestra los componentes y el sentido de sus comunicaciones; a continuación se describe cada uno.'),
  IMG('figura1-arquitectura.png', ANCHO_IMG, Math.round(ANCHO_IMG * f1.H / f1.W)),
  CAP('Figura 1. Arquitectura de LaPreDigital AMP'),

  SUB('A', 'Lenguajes de programación'),
  BUL('TypeScript', 'Lenguaje principal del cliente, del servidor, del worker y de los scripts de migración, con tipado estático en toda la aplicación.'),
  BUL('SQL (Transact-SQL)', 'Definición del OLTP, del modelo dimensional del DataMart y de su carga mediante sentencias MERGE, y consultas de solo lectura de los indicadores.'),
  BUL('HTML y CSS', 'Estructura y estilo de la interfaz, generada mediante componentes React (JSX/TSX).'),

  SUB('B', 'Bases de datos'),
  P('El sistema usa tres bases de datos en SQL Server 2025, con responsabilidades separadas:'),
  BUL('LaPreDigitalAMP', 'Base propia del AMP, la única en la que la aplicación escribe. Contiene las tablas amp_* de contactos, conversaciones, eventos, aprobaciones, cupones, campañas, exámenes, usuarios y ajustes; la cola de trabajos amp_jobs; y las tablas del agente Buyer → Lead (notificaciones, ejecuciones y propuestas).'),
  BUL('LaPreDigitalDatamart', 'Base de solo lectura con modelo dimensional: dimensiones Tiempo, Canal, Campaña, Video y Dispositivo, y los hechos ComportamientoVisita y CostoCampana. De ella se calculan los indicadores, sus tendencias y las comparaciones. La carga diaria desde el OLTP, mediante MERGE, la realiza un proceso externo al AMP.'),
  BUL('LaPreDigitalOLTP', 'Base operativa de solo lectura, que alimenta la información en tiempo real: actividad del día, catálogo vigente de campañas y videos, curva de abandono del video y verificación de inscripciones notificadas.'),
  P('Las conexiones externas rechazan toda sentencia que no sea SELECT o WITH. Para demostraciones locales existe además un modo Demo con una base SQLite aislada y datos sintéticos.'),

  SUB('C', 'Backend'),
  BUL('API de Next.js', 'Servidor Next.js 16 con una ruta única bajo /api que atiende la lectura de datos, las decisiones del operador y el acceso. Valida las entradas con zod, comprueba la sesión y los permisos por rol y contrasta las contraseñas con bcrypt.'),
  BUL('Worker y cola de trabajos', 'Proceso Node independiente (scripts/worker.ts) con un planificador que revisa cada minuto y tres bucles concurrentes que toman trabajos de la tabla amp_jobs. Ejecuta el Radar, los agentes de cada etapa, los avisos de renovación, las campañas y las ejecuciones del agente Buyer → Lead. Usa arrendamientos, reintentos y claves de deduplicación para evitar trabajos repetidos.'),
  BUL('Capa de datos', 'Sequelize 6 como acceso a datos y migraciones versionadas. Se conecta con msnodesqlv8 (autenticación de Windows) o con tedious (usuario y contraseña). Las conexiones al DataMart y al OLTP tienen un guardián de solo lectura.'),
  BUL('Integración de IA', 'Módulo único que invoca al proveedor configurado: OpenAI (gpt-5-mini por defecto), Gemini, Grok o Anthropic. La salida se pide en JSON y se valida con zod; luego reglas deterministas corrigen o descartan contenido no permitido. Sin llave o ante un fallo se usan plantillas y se registra el motivo.'),
  BUL('Webhooks', 'El sistema que gestiona el OLTP notifica cada nueva inscripción a /api/webhooks/inscripciones con un secreto compartido; el servicio es idempotente, verifica el dato en el OLTP y no guarda datos personales. Existe una ruta análoga para los mensajes entrantes de Evolution API.'),
  BUL('Tiempo real (SSE)', 'La ruta /api/live mantiene un canal de eventos enviados por el servidor (Server-Sent Events). El servidor compara cada 2,5 segundos una versión del estado y avisa al navegador cuando hay cambios, de modo que los paneles se actualizan solos.'),

  SUB('D', 'Frontend'),
  BUL('Next.js 16, React 19 y TypeScript', 'Interfaz de una sola aplicación con navegación lateral por módulos, protegida por inicio de sesión.'),
  BUL('Paneles de agentes', 'Panel del agente Buyer → Lead (tarjetas de indicadores con semáforo, filtros, tendencia, desgloses y bandeja de propuestas) y panel de ciclo de vida para Customer y Turned.'),
  BUL('Recharts y lucide-react', 'Gráficos de tendencias, desgloses y curva de abandono, e iconografía de la interfaz.'),
  BUL('Cliente de tiempo real', 'Suscripción a la ruta de eventos para recargar los datos al instante, con recarga periódica de respaldo.'),

  SUB('E', 'Integraciones externas'),
  BUL('Proveedores de IA', 'OpenAI (por defecto), Gemini, Grok y Anthropic; el administrador elige el proveedor y el modelo, y las llaves se guardan en variables de entorno, nunca en el código.'),
  BUL('Evolution API y Gmail API', 'Canales opcionales de envío por WhatsApp y correo; con Evolution API también se reciben mensajes entrantes. Están desactivados en el modo Demo y se usan solo con credenciales configuradas.'),
  P('La Figura 2 resume el flujo de una ejecución del agente Buyer → Lead, desde su disparo hasta los borradores que revisa el operador.', { spacing: { before: 140, after: 100, line: 276 }, keepNext: true }),
  IMG('figura2-flujo-agente.png', ANCHO_IMG, Math.round(ANCHO_IMG * f2.H / f2.W)),
  CAP('Figura 2. Flujo de una ejecución del agente de conversión Buyer → Lead')
];

// ---------- Integrantes ----------
const borde = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
const bordes = { top: borde, bottom: borde, left: borde, right: borde };
const anchos = [520, 2000, 1000, 2600, 1100, 2192]; // suma 9412
const celda = (texto, i, o = {}) => new TableCell({
  borders: bordes, width: { size: anchos[i], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
  margins: { top: 60, bottom: 60, left: 80, right: 80 },
  shading: o.head ? { fill: 'D9E2F3', type: 'clear', color: 'auto' } : undefined,
  children: [new Paragraph({ alignment: o.head ? AlignmentType.CENTER : AlignmentType.LEFT, children: texto ? [run(texto, { bold: !!o.head, size: 19 })] : [] })]
});
const cab = ['N.º', 'Apellidos y nombres', 'DNI', 'Dirección (incluir distrito y provincia)', 'Teléfono', 'Correo institucional (@unitru.edu.pe)'];
const tabla = new Table({
  width: { size: 9412, type: WidthType.DXA }, columnWidths: anchos, layout: TableLayoutType.FIXED,
  rows: [
    new TableRow({ tableHeader: true, cantSplit: true, children: cab.map((t, i) => celda(t, i, { head: true })) }),
    ...[1, 2, 3, 4, 5].map(n => new TableRow({ height: { value: 900, rule: 'atLeast' }, cantSplit: true, children: [celda(String(n), 0), ...[1, 2, 3, 4, 5].map(i => celda('', i))] }))
  ]
});
const integrantes = [
  H('4. Integrantes'),
  P('Complete la siguiente tabla con los datos de cada integrante del equipo. En la dirección indique también el distrito y la provincia, y use el correo institucional de la universidad (@unitru.edu.pe).', { keepNext: true }),
  tabla
];

const pie = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 20 })] })] });

const doc = new Document({
  creator: 'Equipo LaPreDigital AMP', title: 'Memoria Descriptiva - LaPreDigital AMP',
  styles: { default: { document: { run: { font: FONT, size: SZ } } } },
  sections: [{
    properties: { titlePage: true, page: { size: { width: 11906, height: 16838 }, margin: { top: 1247, bottom: 1247, left: 1247, right: 1247 } } },
    footers: { default: pie, first: new Footer({ children: [new Paragraph({ children: [] })] }) },
    children: [...caratula, ...cuerpo, ...integrantes]
  }]
});
writeFileSync(salida, await Packer.toBuffer(doc));
console.log('Generado', salida);
