// Genera documentacion/Manual_de_Codigo_Fuente_LaPreDigital_AMP.docx
// Uso: node generar-manual-codigo.mjs   (luego actualizar-indice-word.ps1 para numerar páginas y exportar el PDF)
// Lee EN EL MOMENTO DE GENERAR: documentacion/_herramientas/contenido-manual.mjs, documentacion/capturas/*.png y el código del repositorio.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel, Footer, PageNumber,
  TableOfContents, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak, VerticalAlign
} from 'docx';
import { resolver, formatear, mismosTokens } from './extraer.mjs';
import { codigo } from './contenido-codigo.mjs';
import { buyersPorOpcion } from './contenido-codigo-buyers.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '..');
const capturas = path.join(raiz, 'capturas');
const FONT = 'Arial', MONO = 'Consolas';

// El contenido del Manual de Usuario se importa en el momento de generar (con parámetro para evitar la caché de módulos).
const { intro, modulos } = await import(pathToFileURL(path.join(raiz, '_herramientas', 'contenido-manual.mjs')).href + '?t=' + Date.now());

const pngSize = file => { const b = fs.readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), data: b }; };
const run = (text, o = {}) => new TextRun({ text, font: FONT, size: 22, ...o });
const body = (text, o = {}) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 140, line: 276 }, ...o, children: [run(text)] });
const h1 = text => new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, children: [new TextRun({ text, font: FONT })] });
const h2 = text => new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [new TextRun({ text, font: FONT })] });

// ---------------- Figuras (idénticas al Manual de Usuario) ----------------
let figNum = 0;
function figura(f) {
  let num;
  if (f.etiqueta) num = f.etiqueta; else { figNum += 1; num = String(figNum).padStart(2, '0'); }
  const img = pngSize(path.join(capturas, f.archivo));
  const escala = Math.min((15 * 96 / 2.54) / img.w, (15.5 * 96 / 2.54) / img.h, 0.9);
  const width = Math.round(img.w * escala), height = Math.round(img.h * escala);
  return {
    num,
    nodes: [
      new Paragraph({ keepNext: true, alignment: AlignmentType.CENTER, spacing: { before: 120, after: 0 }, children: [run(`Figura ${num}`, { bold: true, italics: true })] }),
      new Paragraph({ keepNext: true, alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [run(f.pie, { italics: true })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new ImageRun({ type: 'png', data: img.data, transformation: { width, height }, altText: { title: `Figura ${num}`, description: f.pie, name: f.archivo } })] })
    ]
  };
}

// ---------------- Código ----------------
const SECRETOS = /Demo1234|local-demo-only|admin@lapredigital|BEGIN [A-Z ]*PRIVATE|\bsk-[A-Za-z0-9]{12,}|AIza[0-9A-Za-z_-]{20,}/;
const GRIS = 'F4F5F7';
const lineaCodigo = (texto, ultima) => new Paragraph({
  spacing: { before: 0, after: ultima ? 160 : 0, line: 228, lineRule: 'auto' },
  shading: { type: ShadingType.CLEAR, fill: GRIS, color: 'auto' },
  border: { left: { style: BorderStyle.SINGLE, size: 12, color: '9DB2D6', space: 6 } },
  indent: { left: 120, right: 60 },
  alignment: AlignmentType.LEFT,
  widowControl: true,
  children: [new TextRun({ text: texto === '' ? ' ' : texto, font: MONO, size: 16 })]
});
const rotuloP = (t) => new Paragraph({ keepNext: true, spacing: { before: 140, after: 20 }, children: [new TextRun({ text: t, font: MONO, size: 17, bold: true })] });
const notaP = (t) => new Paragraph({ keepNext: true, spacing: { after: 50 }, children: [new TextRun({ text: t, font: FONT, size: 18 })] });

const estadistica = { fragmentos: 0, lineas: 0, porModulo: {} };
const numFig = {};
let _n = 0;
for (const m of modulos) for (const o of m.opciones) for (const f of o.figuras) numFig[f.archivo] = f.etiqueta ? f.etiqueta : String(++_n).padStart(2, '0');
const resolverVer = (s) => s.replace(/{([^}]+)}/g, (_, k) => { if (!numFig[k]) throw new Error('Referencia a figura inexistente: ' + k); return numFig[k]; });
const opcionYaConCodigo = new Map();
async function bloquesDeCodigo(clave, modLetra, opcionTitulo, figEtiqueta) {
  let def = codigo[clave];
  if (!def) {
    const o = buyersPorOpcion.find(x => x.re.test(opcionTitulo));
    if (o) {
      if (opcionYaConCodigo.has(opcionTitulo)) def = { fragmentos: [], ver: `El código de esta opción se muestra en la Figura ${opcionYaConCodigo.get(opcionTitulo)}.` };
      else { def = o; opcionYaConCodigo.set(opcionTitulo, figEtiqueta); }
    }
  }
  if (!def && process.env.BORRADOR) { console.warn(`[borrador] sin código para ${clave} (${opcionTitulo})`); def = { fragmentos: [] }; }
  if (!def) throw new Error(`Falta código para la captura ${clave} (opción «${opcionTitulo}»)`);
  const nodos = [];
  const archivos = [];
  const listaFrag = [];
  for (const f of def.fragmentos) {
    const r = await resolver(f);
    if (r.avisos.length) throw new Error(r.avisos.join('; '));
    const texto = r.lineas.join('\n');
    if (SECRETOS.test(texto)) throw new Error(`Posible secreto en el fragmento ${r.rotulo}`);
    if (!archivos.includes(r.archivo)) archivos.push(r.archivo);
    nodos.push(rotuloP(r.rotulo));
    if (r.nota) nodos.push(notaP(r.nota));
    r.lineas.forEach((l, i) => nodos.push(lineaCodigo(l, i === r.lineas.length - 1)));
    estadistica.fragmentos++; estadistica.lineas += r.lineas.length;
    listaFrag.push(r.rotulo + (r.lineas.length ? ` [${r.lineas.length} líneas]` : ''));
  }
  (estadistica.porModulo[modLetra] ||= []).push({ captura: clave, fragmentos: listaFrag });
  const archivosP = new Paragraph({
    spacing: { before: 60, after: 60 }, keepNext: true,
    children: [run('Archivos: ', { bold: true, size: 20 }), new TextRun({ text: archivos.join(' · '), font: MONO, size: 16 }),
      ...(def.ver ? [run(`  ${resolverVer(def.ver)}`, { italics: true, size: 18 })] : [])]
  });
  return [archivosP, ...nodos];
}

// ---------------- Tablas ----------------
const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
const borders = { top: border, bottom: border, left: border, right: border };
const cell = (text, w, { head = false, bold = false, mono = false } = {}) => new TableCell({
  width: { size: w, type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.CENTER,
  margins: { top: 50, bottom: 50, left: 90, right: 90 },
  shading: head ? { type: ShadingType.CLEAR, fill: 'D9E2F3', color: 'auto' } : undefined,
  children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text, font: mono ? MONO : FONT, size: mono ? 16 : 18, bold: head || bold })] })]
});
function tabla(anchos, cabecera, filas, monoPrimera = false) {
  const total = anchos.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: anchos,
    rows: [new TableRow({ tableHeader: true, cantSplit: true, children: cabecera.map((t, i) => cell(t, anchos[i], { head: true })) }),
      ...filas.map(f => new TableRow({ cantSplit: true, children: f.map((t, i) => cell(t, anchos[i], { mono: monoPrimera && i === 0 })) }))]
  });
}
const espacio = () => new Paragraph({ spacing: { after: 120 }, children: [] });

// ---------------- Carátula ----------------
const centro = (text, size, o = {}, after = 200) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after }, children: [new TextRun({ text, font: FONT, size, ...o })] });
const caratula = [
  centro('UNIVERSIDAD NACIONAL DE TRUJILLO', 28, { bold: true }, 120),
  centro('Curso: Inteligencia de Negocios', 24, {}, 1800),
  centro('MANUAL DE CÓDIGO FUENTE', 52, { bold: true }, 400),
  centro('LaPreDigital AMP – Plataforma de gestión de agentes', 30, { bold: true }, 80),
  centro('(Agents Management Platform)', 26, {}, 1800),
  centro('Trujillo, 2026', 24, {}, 0)
];
const indiceSeccion = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: 'ÍNDICE', font: FONT, size: 28, bold: true })] }),
  new TableOfContents('Índice', { hyperlink: true, headingStyleRange: '1-2' })
];

// ---------------- Estructura del proyecto ----------------
const arbol = [
  'LaPreDigitalAMP/',
  '├── src/',
  '│   ├── app/                       Interfaz y rutas (Next.js App Router)',
  '│   │   ├── layout.tsx, globals.css   Estructura HTML y estilos',
  '│   │   ├── [[...slug]]/page.tsx      Página servidor: exige sesión y monta <App>',
  '│   │   ├── client.tsx                Vistas cliente: menú, Dashboard, Radar, etapas,',
  '│   │   │                             perfil, aprobaciones, campañas, exámenes, trabajos',
  '│   │   ├── buyers/                   Panel de Buyers: barra del agente y pestañas Resumen,',
  '│   │   │                             Análisis, Agente, Propuestas, Reglas y Perfiles',
  '│   │   ├── lifecycle-panel.tsx       Panel del ciclo de vida (Customer y Turned)',
  '│   │   ├── login/page.tsx, ui.tsx    Pantalla de inicio de sesión',
  '│   │   └── api/[...path]/route.ts    API única (GET y POST) con despacho por ruta',
  '│   └── lib/                       Lógica de negocio y acceso a datos (ver tabla)',
  '├── scripts/                       Migraciones, semilla, usuarios y worker',
  '├── tests/                         Pruebas (tsx --test)',
  '├── docs/                          Contratos y notas de diseño',
  '└── documentacion/                 Manuales (usuario, código fuente, memoria)'
];
const libs = [
  ['agents.ts', 'Agente IMPULSE de Leads y Payers: contexto, propuesta con IA (con respaldo por plantilla) y aprobaciones.'],
  ['ai.ts', 'Cliente único de IA (OpenAI, Gemini, Grok, Anthropic): aiConfig y generate.'],
  ['auth.ts', 'Sesión firmada con HMAC, cookie httpOnly, usuario actual y permisos por rol.'],
  ['buyer-agent.ts', 'Agente Buyer → Lead: contexto, prompts, esquemas zod, validadores, plantillas, ejecución con pasos y registro, y decisión de propuestas.'],
  ['buyer-auto.ts', 'Modo automático/manual, latido del worker, estado del agente, ejecución semanal y alertas.'],
  ['buyer-profiles.ts', 'Perfiles de los buyers capturados por el formulario (lectura del OLTP, enmascarado y detalle).'],
  ['buyer-rules.ts', 'Reglas de negocio variables: semáforos, contenido, cobertura, automatización, alertas y directrices.'],
  ['buyer-kpis.ts', 'KPI B-1.1 a B-3.1 con los semáforos vigentes; consultas al DataMart y al OLTP; caché.'],
  ['buyer-webhook.ts', 'Webhook de nuevas inscripciones: secreto, esquema e idempotencia.'],
  ['catalog.ts', 'Capacidades de cada plan de servicio.'],
  ['contacts.ts', 'Lectura de contactos con correcciones auditadas, historial y eventos de trazabilidad.'],
  ['db.ts', 'Conexiones Sequelize (SQL Server o SQLite en modo demo) y acceso a las tablas.'],
  ['exams.ts', 'Importación del TXT de exámenes y coincidencias con los contactos.'],
  ['external.ts', 'Conexiones de solo lectura al OLTP y al DataMart y guardián SELECT (queryExternal).'],
  ['inbound.ts', 'Triaje y respuesta de los mensajes entrantes.'],
  ['jobs.ts', 'Cola de trabajos, planificador (scanSchedules) y procesador (processNextJob).'],
  ['lifecycle-policy.ts', 'Reglas puras del ciclo de vida de Customer y Turned.'],
  ['lifecycle.ts', 'Contexto y preparación de recomendaciones del ciclo de vida.'],
  ['live.ts', 'Sondeo compartido que alimenta el canal SSE «en vivo».'],
  ['messaging.ts', 'Envío y recepción de mensajes con consentimiento y horario permitido.'],
  ['priorities.ts', 'Prioridad operativa de cada contacto.'],
  ['radar.ts', 'Radar de conversaciones: evaluación, sugerencias y envío.'],
  ['schema.ts', 'Definición de tablas dm_* y amp_*.'],
  ['stage-agents.ts', 'Prompts, esquemas y reglas de los agentes de Lead y Payer.'],
  ['types.ts', 'Tipos y etiquetas compartidos (etapas, roles, canales).']
];
const scripts = [
  ['scripts/migrate.ts', 'Crea la base propia si no existe y aplica las migraciones 001–012 (npm run db:migrate).'],
  ['scripts/seed.ts', 'Datos de demostración (npm run db:seed).'],
  ['scripts/create-user.ts', 'Alta de usuarios con correo, rol y nombre (npm run user:create).'],
  ['scripts/worker.ts', 'Proceso en segundo plano: latido, planificador, programación del agente Buyer y tres bucles de trabajo (npm run worker).']
];
const bases = [
  ['LaPreDigitalAMP (propia)', 'Lectura y escritura. Tablas amp_* (usuarios, eventos, mensajes, trabajos, aprobaciones, campañas, exámenes, Buyers) y proyecciones dm_* del datamart. Variables DB_*.'],
  ['LaPreDigitalDatamart', 'Solo lectura (external.ts → datamart()). Esquemas dim, hecho y etl: KPI por periodo, tendencia y comparaciones. Variables DATAMART_DB_*.'],
  ['LaPreDigitalOLTP', 'Solo lectura (external.ts → oltp()). Esquemas mkt y cat: visitas, reproducciones y formularios del día. Variables OLTP_DB_*.']
];
const estructura = () => [
  h1('ESTRUCTURA DEL PROYECTO'),
  h2('Árbol de carpetas'),
  body('LaPreDigital AMP es una aplicación Next.js 16 con React 19, TypeScript y Sequelize. La interfaz y la API viven en un mismo proyecto; el trabajo pesado (IA, envíos, barridos) lo ejecuta un proceso aparte, el worker, mediante una cola de trabajos.'),
  ...arbol.map((l, i) => lineaCodigo(l, i === arbol.length - 1)),
  h2('Archivos principales'),
  body('Carpeta src/lib: lógica de negocio y acceso a datos.', { spacing: { after: 80 } }),
  tabla([2300, 6700], ['Archivo', 'Función'], libs, true),
  espacio(),
  body('Carpeta scripts: tareas de administración y el worker.', { spacing: { after: 80 } }),
  tabla([2300, 6700], ['Archivo', 'Función'], scripts, true),
  espacio(),
  h2('Bases de datos'),
  body('El sistema usa tres bases de SQL Server. El AMP escribe únicamente en la propia; las otras dos se consultan solo con sentencias SELECT parametrizadas a través de queryExternal. En modo demo la base propia es SQLite y el agente Buyer no está disponible. Los valores de conexión y las llaves se leen de variables de entorno del servidor (.env.local) y no forman parte de este manual; el archivo .env.example solo documenta sus nombres: DEMO_MODE, DB_DIALECT, SQLITE_STORAGE, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_ENCRYPT, SESSION_SECRET, SESSION_COOKIE_SECURE, OPENAI_API_KEY, GEMINI_API_KEY, XAI_API_KEY, ANTHROPIC_API_KEY, EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE, EVOLUTION_WEBHOOK_SECRET, GMAIL_ACCESS_TOKEN, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN y GMAIL_SENDER.'),
  tabla([2300, 6700], ['Base', 'Uso'], bases),
  espacio(),
  h2('Convenciones de este manual'),
  body('El código se muestra reformateado para impresión: se aplicó prettier (solo saltos de línea y sangría, sin cambiar ningún símbolo) porque varios archivos del repositorio tienen líneas de cientos de caracteres. Cada fragmento es una copia literal del código vigente, extraída por programa por nombre de función; una línea «// …» indica que se omitió una parte intermedia. Cada rótulo indica archivo y función, y la línea «Archivos:» de cada opción lista los archivos que la implementan. Las figuras y su numeración son las mismas del Manual de Usuario.')
];

// ---------------- Anexo ----------------
function tramo(rel, desde, hastaExcl) {
  const texto = fs.readFileSync(path.join(raiz, '..', rel), 'utf8').replace(/\r\n/g, '\n');
  const i = texto.indexOf(desde); if (i < 0) throw new Error('Anexo: no se encontró ' + desde);
  const j = texto.indexOf(hastaExcl, i); if (j < 0) throw new Error('Anexo: no se encontró ' + hastaExcl);
  return texto.slice(texto.lastIndexOf('\n', i) + 1, texto.lastIndexOf('\n', j)).split('\n');
}
async function anexo() {
  const esquemaCrudo = tramo('src/lib/schema.ts', '// Agente de conversión Buyer → Lead', '\n};');
  // el esquema termina en "  }\n};": se recorta al cierre de amp_buyer_proposals
  const migracionCruda = [...tramo('scripts/migrate.ts', "const eighth = '008_buyer_lead_agent';", "const ninth ="), ...tramo('scripts/migrate.ts', "const tenth = '010_buyer_rules';", "const twelfth =")];
  const NL = String.fromCharCode(10);
  const envuelto = ['const specs = {', ...esquemaCrudo, '};'].join(NL);
  const fe = (await formatear(envuelto)).split(NL);
  const esquema = fe.slice(1, -1).map(l => l.replace(/^  /, ''));
  const fm = await formatear(migracionCruda.join(NL));
  if (!mismosTokens(envuelto, fe.join(NL)) || !mismosTokens(migracionCruda.join(NL), fm)) throw new Error('Anexo: formateo cambió tokens');
  const migracion = fm.split(NL);
  for (const l of [...esquema, ...migracion]) if (SECRETOS.test(l)) throw new Error('Secreto en el anexo');
  const bloque = (rot, nota, lineas) => [rotuloP(rot), notaP(nota), ...lineas.map((l, i) => lineaCodigo(l, i === lineas.length - 1))];
  return [
    h1('ANEXO: ESQUEMA DE LAS TABLAS amp_buyer_*'),
    body('Las cinco tablas del agente Buyer → Lead se declaran en src/lib/schema.ts y las crean las migraciones 008, 010 y 011 de scripts/migrate.ts. No almacenan datos personales de los inscritos: los perfiles del formulario se leen directamente del OLTP.'),
    ...bloque('src/lib/schema.ts — specs (amp_buyer_notifications, amp_buyer_runs, amp_buyer_proposals, amp_buyer_rules, amp_buyer_alerts)', 'Notificaciones del webhook, ejecuciones (con paso y registro), propuestas, reglas de negocio y avisos de alertas.', esquema),
    ...bloque('scripts/migrate.ts — migraciones 008_buyer_lead_agent, 010_buyer_rules y 011_buyer_run_progress', 'Crean las tablas desde el esquema, sus índices, la siembra de reglas y las columnas de progreso; cada una queda registrada en amp_migrations.', migracion)
  ];
}

// ---------------- Cuerpo ----------------
const cuerpo = [new Paragraph({ children: [new PageBreak()] }), ...estructura()];
const salidaIndice = { estructura: ['ESTRUCTURA DEL PROYECTO'], modulos: [] };
for (const m of modulos) {
  const t1 = `${m.letra}) ${m.titulo}`;
  cuerpo.push(h1(t1));
  const sec = { h1: t1, h2: [] };
  for (const o of m.opciones) {
    cuerpo.push(h2(o.titulo)); sec.h2.push(o.titulo);
    for (const f of o.figuras) {
      const fig = figura(f);
      cuerpo.push(...fig.nodes);
      cuerpo.push(...await bloquesDeCodigo(f.archivo, m.letra, o.titulo, fig.num));
    }
  }
  salidaIndice.modulos.push(sec);
}
cuerpo.push(...await anexo());

const pie = new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 20 })] })] });
const pagina = { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } };
const doc = new Document({
  creator: 'LaPreDigital AMP', title: 'Manual de Código Fuente – LaPreDigital AMP',
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, bold: true, color: '000000' }, paragraph: { spacing: { before: 360, after: 160 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 22, bold: true, color: '000000' }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, outlineLevel: 1 } }
    ]
  },
  sections: [
    { properties: { page: pagina, verticalAlign: 'center' }, children: caratula },
    { properties: { page: pagina }, footers: { default: pie }, children: [...indiceSeccion, ...cuerpo] }
  ]
});

const salida = process.env.SALIDA_DOCX || path.join(raiz, 'Manual_de_Codigo_Fuente_LaPreDigital_AMP.docx');
fs.writeFileSync(salida, await Packer.toBuffer(doc));
fs.writeFileSync(path.join(aqui, 'resumen-fragmentos.json'), JSON.stringify({ generado: new Date().toISOString(), figuras: figNum, fragmentos: estadistica.fragmentos, lineas: estadistica.lineas, indice: salidaIndice, porModulo: estadistica.porModulo }, null, 2));
console.log('Generado', salida, `(${figNum} figuras, ${estadistica.fragmentos} fragmentos, ${estadistica.lineas} líneas de código)`);
