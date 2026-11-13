// Código principal del módulo D (Buyers) por opción. La búsqueda se hace por el título de la opción del Manual de Usuario.
import { S, R } from './contenido-codigo.mjs';
const B = 'src/app/buyers/';
const KPI = 'src/lib/buyer-kpis.ts', BA = 'src/lib/buyer-agent.ts', WEB = 'src/lib/buyer-webhook.ts', EXT = 'src/lib/external.ts';
const RUL = 'src/lib/buyer-rules.ts', AUTO = 'src/lib/buyer-auto.ts', PRO = 'src/lib/buyer-profiles.ts', AI = 'src/lib/ai.ts', JOBS = 'src/lib/jobs.ts';

export const buyersPorOpcion = [
  {
    re: /barra del agente/i,
    fragmentos: [
      S(B + 'agent-bar.tsx', 'AgentBar', 'Cambio de modo y ejecución manual desde la barra; el aviso de worker detenido se muestra siempre.', { desde: 'async function cambiarModo', hasta: 'const pendientes' }),
      S(B + 'agent-meta.tsx', ['workerEstado', 'textoLatido', 'pasoActual'], 'Estado del worker según el latido y paso actual de la ejecución.'),
      R('GET', "path === 'buyer/agent'", 'Estado del agente por actividad (modo, estado, próxima ejecución) y permiso de cambio de modo.', { rotulo: 'GET /api/buyer/agent' }),
      S(AUTO, ['LATIDO_VIVO_MS', 'LATIDO_INTERVALO_MS', 'escribirLatido', 'latidoVivo', 'leerLatido'], 'Latido del worker en amp_settings: vivo si el último latido tiene menos de 45 s.'),
      S('scripts/worker.ts', ['buyerLoop', 'heartbeatLoop'], 'Bucles del worker: programación del agente Buyer y latido.'),
      S(AUTO, 'calcularEstado', 'Estado por actividad: EN_REPOSO, EN_COLA, EJECUTANDO o ERROR, con la próxima ejecución automática.'),
      S(AUTO, ['cambiarModoSchema', 'cambiarModo'], 'Cambio de modo AUTOMÁTICO/MANUAL con registro BUYER_AGENT_MODE.'),
      R('POST', "path === 'buyer/agent/mode'", 'Solo administración o alta dirección cambian el modo.', { rotulo: 'POST /api/buyer/agent/mode' })
    ]
  },
  {
    re: /^resumen/i,
    fragmentos: [
      S(RUL, 'KPI_DEFS', 'Constante de umbrales de fábrica de los seis KPI.'),
      S(RUL, ['Umbral', 'semaforo'], 'Función de semáforo: lee los umbrales de las reglas vigentes; los bordes pertenecen al estado mejor.'),
      S(KPI, 'sumasVisitas', 'Consulta SQL al DataMart (hecho.ComportamientoVisita), parametrizada y agrupada.'),
      S(KPI, 'costosPeriodo', 'B-1.2: costo del periodo (hecho.CostoCampana) de campañas pagadas, aparte de los leads nuevos.'),
      S(KPI, ['partes', 'construirKpi'], 'B-1.2 = costo del periodo / leads nuevos de campañas pagadas del periodo; denominador 0 da SIN_DATOS.'),
      S(KPI, 'kpisQuerySchema', 'Validación zod de los filtros globales.'),
      S(EXT, ['PALABRAS_PROHIBIDAS', 'assertSoloLectura'], 'Guardián de solo lectura: solo SELECT/WITH, una sentencia, sin palabras de escritura.'),
      S(EXT, 'queryExternal', 'Único punto de acceso al DataMart y al OLTP: valida, parametriza y limita el paralelismo.'),
      R('GET', "path === 'buyer/kpis'", 'Ruta GET de los KPI.', { rotulo: 'GET /api/buyer/kpis' }),
      S(KPI, 'buyerKpis', 'Respuesta de KPI con caché por filtros.'),
      S(B + 'tab-resumen.tsx', ['TabResumen', 'Kpis', 'variacion', 'KpiCard'], 'Vista Resumen: KPI agrupados por actividad con variación frente al periodo anterior.'),
      S(B + 'tab-resumen.tsx', 'AlertsSection', 'Avisos abiertos del agente.'),
      S(B + 'filters.tsx', 'FilterBar', 'Filtros globales que se conservan al cambiar de pestaña.', { desde: 'export default function FilterBar', hasta: 'return (' })
    ]
  },
  {
    re: /an[aá]lisis/i,
    fragmentos: [
      S(B + 'period-reading.ts', 'leerPeriodo', 'Lectura del periodo: textos derivados de los KPI y su comparación.'),
      S(KPI, 'buyerKpisSinCache', 'Tendencia mensual (12 meses) y desgloses por canal, campaña y video.', { desde: 'const tendenciaDesde', hasta: 'return {' }),
      S(KPI, ['condiciones', 'agregar'], 'Condiciones parametrizadas y combinación en memoria de los hechos de visitas y de costos.'),
      S(KPI, 'curvaAbandonoSinCache', 'Consulta al OLTP: tramos del 10 % de la duración y conversión por tramo.'),
      S(KPI, 'construirCurva', 'Función pura: curva de abandono y mayor caída.'),
      R('GET', "path === 'buyer/abandonment'", 'Ruta de la curva de abandono de un video.', { rotulo: 'GET /api/buyer/abandonment' }),
      S(B + 'tab-analisis.tsx', ['TabAnalisis', 'Trend'], 'Vista Análisis y gráfico de tendencia.'),
      S(B + 'tab-analisis.tsx', 'Abandonment', 'Selección de video y petición de la curva de abandono.', { desde: 'function Abandonment', hasta: 'return (' }),
      S(B + 'tab-analisis.tsx', 'PorCampana', 'Tabla ordenable de campañas con costo por lead.', { desde: 'function PorCampana', hasta: 'return (' })
    ]
  },
  {
    re: /tiempo real/i,
    fragmentos: [
      S(KPI, ['diaLima', 'actividadHoySinCache'], 'Actividad de hoy (hora de Lima) en el OLTP con consultas acotadas por fecha.'),
      R('GET', "path === 'buyer/realtime'", 'Ruta de tiempo real: actividad de hoy y últimas notificaciones.', { rotulo: 'GET /api/buyer/realtime' }),
      R('POST', "path === 'webhooks/inscripciones'", 'Webhook: valida el secreto compartido y el cuerpo antes de registrar.'),
      S(WEB, ['inscripcionSchema', 'secretoValido'], 'Esquema del cuerpo (se descartan datos personales) y comparación del secreto en tiempo constante.'),
      S(WEB, 'registrarInscripcion', 'Registro idempotente por idFormulario, verificación en el OLTP y manejo de carrera.'),
      S(B + 'tab-agente.tsx', 'Realtime', 'Panel de actividad de hoy y notificaciones, recargado por eventos en vivo.')
    ]
  },
  {
    re: /ejecuci[oó]n en vivo|ejecuciones/i,
    fragmentos: [
      S(B + 'tab-agente.tsx', 'Lanzar', 'Indicaciones opcionales y botones de ejecución.', { desde: 'function Lanzar', hasta: 'return (' }),
      R('POST', "path === 'buyer/run'", 'Solicita una ejecución manual (responde 202).', { rotulo: 'POST /api/buyer/run' }),
      S(BA, 'solicitudRunSchema', 'Validación de la solicitud: actividad, periodo e indicaciones de hasta 500 caracteres.'),
      S(BA, 'requestRun', 'Crea la ejecución PENDING y encola el trabajo BUYER_RUN con deduplicación.'),
      S(JOBS, 'processNextJob', 'Worker: reclamo atómico con arrendamiento de 20 minutos para BUYER_RUN.', { desde: 'export async function processNextJob', hasta: 'if (!claimed) return true;' }),
      S(JOBS, 'processNextJob', 'Despacho del trabajo BUYER_RUN.', { desde: "if (candidate.kind === 'BUYER_RUN')", hasta: "else if (candidate.kind === 'LIFECYCLE')" }),
      S(BA, ['buildContext', 'periodoAnteriorDe'], 'Contexto de la ejecución: consultas deterministas, sin IA.'),
      S(BA, ['reglasComunes', 'sistemaB1'], 'Prompts: reglas obligatorias leídas de las reglas vigentes y formato de salida de B-1.', { max: 60 }),
      S(BA, 'construirPrompt', 'Mensaje de usuario: contexto como datos y directrices activas.'),
      S(AI, 'generate', 'Llamada a la IA con el proveedor configurado (ramas de OpenAI y Anthropic).', { omitir: [["if (provider === 'GEMINI')", 'if (!process.env.ANTHROPIC_API_KEY']] }),
      S(BA, ['propuestaIaSchema', 'salidaIaSchema'], 'Esquemas zod de la salida de la IA.'),
      S(BA, 'procesarSalidaIa', 'JSON → zod → validadores → cobertura mínima.'),
      S(BA, ['PASOS', 'leerLog'], 'Pasos de la ejecución y lectura del registro.'),
      S(BA, 'executeRun', 'Seguimiento de la ejecución: cada paso (COLA, CONTEXTO, IA, REGLAS, GUARDADO, FIN) se anota en el registro de la ejecución.', { desde: 'const registro = leerLog', hasta: 'const fallar = async' }),
      S(BA, 'executeRun', 'Contexto, llamada a la IA con respaldo de plantillas y cierre atómico de la ejecución.', { desde: 'reglas = await reglasVigentes()', hasta: 'const escribio', max: 75 }),
      S(BA, ['contarPropuestasPorRun', 'listarEjecuciones'], 'Historial de ejecuciones con conteo de propuestas.'),
      R('GET', "path === 'buyer/runs'", 'Ruta del historial.', { rotulo: 'GET /api/buyer/runs' }),
      S(B + 'tab-agente.tsx', 'LiveRun', 'Línea de tiempo en vivo de la ejecución en curso.'),
      S(B + 'tab-agente.tsx', 'Run', 'Fila del historial con análisis y reglas aplicadas.')
    ]
  },
  {
    re: /^propuestas/i,
    fragmentos: [
      S('src/lib/buyer-rules.ts', 'detectarProhibidosCon', 'Detección de términos prohibidos con las reglas vigentes (sin tildes ni mayúsculas).'),
      S(BA, 'validarPropuestas', 'Valida cada propuesta: coherencia con la actividad, texto prohibido, pilares y evidencia.', { desde: 'export function validarPropuestas', hasta: 'const completada', omitir: [["if (actividad === 'B1') {", '// Texto prohibido']] }),
      S(BA, ['completarCobertura', 'propuestasDePlantilla'], 'Plantillas de respaldo y cobertura mínima.'),
      S(BA, ['filtroPropuestasSchema', 'listarPropuestas'], 'Lectura paginada y filtrada de la bandeja.'),
      R('GET', "path === 'buyer/proposals'", 'Ruta de la bandeja.', { rotulo: 'GET /api/buyer/proposals' }),
      S(BA, ['decisionSchema', 'decidirPropuesta'], 'Decisión individual: solo borradores y texto editado revalidado con los términos vigentes.'),
      R('POST', "path === 'buyer/proposal/decide'", 'Ruta de decisión: 404, 409 o 422 según el caso.', { rotulo: 'POST /api/buyer/proposal/decide' }),
      S(BA, ['decisionMultipleSchema', 'decidirVarias'], 'Decisión en bloque de hasta 50 propuestas.'),
      R('POST', "path === 'buyer/proposals/decide-many'", 'Ruta de decisión en bloque.', { rotulo: 'POST /api/buyer/proposals/decide-many' }),
      S(B + 'tab-propuestas.tsx', 'TabPropuestas', 'Bandeja: filtros, búsqueda, paginación y selección múltiple.'),
      S(B + 'tab-propuestas.tsx', 'Card', 'Tarjeta de propuesta: aprobar, editar y aprobar, descartar.')
    ]
  },
  {
    re: /sem[aá]foro/i,
    fragmentos: [
      S(RUL, 'semaforoSchema', 'Validación del nivel de un KPI: dirección fija y niveles coherentes.'),
      S(RUL, 'construirVigentes', 'Reglas vigentes: reglas de la base sobre los valores de fábrica.'),
      S(RUL, ['reglasVigentes', 'estadoReglas'], 'Lectura con caché corta, invalidada al escribir.'),
      R('GET', "path === 'buyer/rules'", 'Ruta de lectura de reglas.', { rotulo: 'GET /api/buyer/rules' }),
      R('POST', "path === 'buyer/rule/save' || path === 'buyer/rule/delete' || path === 'buyer/rule/restore'", 'Rutas de escritura de reglas: solo administración o alta dirección.', { rotulo: 'POST /api/buyer/rule/save | delete | restore' }),
      S(RUL, 'guardarRegla', 'Modificación de una regla: validación, coherencia, bloqueo y auditoría BUYER_RULE_CHANGE.', { desde: 'export async function guardarRegla', hasta: "if (datos.category !== 'ALERTA'" }),
      S(B + 'rule-forms.tsx', ['SemaforoForm', 'semaforoValido'], 'Formulario del semáforo con vista previa.'),
      S(B + 'tab-reglas.tsx', 'TabReglas', 'Vista Reglas por categoría.')
    ]
  },
  {
    re: /contenido y cobertura/i,
    fragmentos: [
      S(RUL, ['terminoSchema', 'prohibidosSchema', 'pilarSchema', 'pilaresSchema'], 'Esquemas de términos prohibidos y pilares.'),
      S(RUL, ['cobB1Schema', 'cobB2Schema', 'cobAtribucionSchema'], 'Esquemas de cobertura de B-1 y B-2.'),
      S(RUL, ['regexLiteral', 'contieneLiteral', 'detectarProhibidosCon', 'pilaresEnCon'], 'Coincidencia literal, al inicio de palabra, sin expresiones regulares del usuario.'),
      S(RUL, ['esquemaDeParametros', 'validarParams'], 'Esquema por categoría y validación de parámetros.'),
      S(BA, 'faltantesCobertura', 'Cobertura mínima de propuestas según las reglas.'),
      S(B + 'rule-forms.tsx', ['TerminosForm', 'PilaresForm'], 'Formularios de términos y pilares.'),
      S(B + 'rule-forms.tsx', ['CoberturaB1', 'CoberturaB2'], 'Formularios de cobertura.')
    ]
  },
  {
    re: /automatizaci[oó]n/i,
    fragmentos: [
      S(RUL, ['semanalSchema', 'enfriamientoSchema', 'alertaSchema', 'directrizSchema'], 'Esquemas de programación, enfriamiento, alertas y directrices.'),
      S(AUTO, ['proximaEjecucionSemanal', 'semanalVence', 'proximaEjecucionAutomatica'], 'Cálculo de la ejecución semanal (hora de Lima) y de la próxima ejecución.'),
      S(AUTO, ['evaluarAlerta', 'decidirEjecucionPorAlerta'], 'Evaluación de una alerta sobre el KPI y decisión de ejecutar.'),
      S(AUTO, 'revisarAlertas', 'Revisión de alertas: un aviso por regla y día, enfriamiento y ejecución solo en modo automático.'),
      S(AUTO, 'scanBuyerSchedules', 'Programación del worker: ejecución semanal y alertas, con claves de deduplicación.'),
      S(RUL, 'directricesPara', 'Directrices activas que se añaden al prompt de la IA.'),
      S(B + 'rule-forms.tsx', ['Programacion', 'AlertaForm', 'DirectrizForm'], 'Formularios de programación, alertas y directrices.'),
      S(B + 'rule-summary.ts', ['fraseAlerta', 'resumenRegla'], 'Texto legible de cada regla.')
    ]
  },
  {
    re: /restaurar|bloqueadas/i,
    fragmentos: [
      S(RUL, ['instantanea', 'auditar'], 'Auditoría BUYER_RULE_CHANGE con valor anterior y nuevo.'),
      S(RUL, ['restaurarFila', 'restaurarRegla'], 'Restauración de una regla de sistema a su valor de fábrica.'),
      S(RUL, 'restaurarTodas', 'Restauración de todas las reglas de sistema.'),
      S(RUL, 'historialReglas', 'Últimos cambios de reglas con quién, cuándo, antes y después.'),
      R('GET', "path === 'buyer/rules/history'", 'Ruta del historial de cambios.', { rotulo: 'GET /api/buyer/rules/history' }),
      S(RUL, 'sembrarReglas', 'Siembra idempotente de las reglas de fábrica (migración 010).'),
      S(B + 'tab-reglas.tsx', 'RuleCard', 'Tarjeta de regla: valor vigente y de fábrica, restaurar y bloqueo.')
    ]
  },
  {
    re: /perfiles.*listado|listado.*perfiles/i,
    fragmentos: [
      S(PRO, ['enmascararCorreo', 'enmascararTelefono'], 'Enmascarado de correo y teléfono en el listado.'),
      S(PRO, ['filtroPerfilesSchema', 'construirFiltro'], 'Filtros validados y condiciones parametrizadas.'),
      S(PRO, ['conteosPorEstado', 'listarPerfiles'], 'Lectura directa del OLTP (solo SELECT), paginada y con conteos por estado.'),
      R('GET', "path === 'buyer/profiles'", 'Ruta del listado de perfiles.', { rotulo: 'GET /api/buyer/profiles' }),
      S(B + 'tab-perfiles.tsx', 'TabPerfiles', 'Vista del listado: tarjetas por estado, búsqueda y filtros.')
    ]
  },
  {
    re: /perfiles.*detalle|detalle.*perfil/i,
    fragmentos: [
      S(PRO, 'perfilDeFormulario', 'Detalle de un formulario: persona, visita, reproducción y otras visitas (solo SELECT).'),
      S(PRO, ['calcularAvancePct', 'construirLineaDeTiempo'], 'Avance del video y línea de tiempo de la visita.'),
      R('GET', "path === 'buyer/profile'", 'Ruta del detalle con auditoría BUYER_PROFILE_VIEW sin datos personales.', { rotulo: 'GET /api/buyer/profile' }),
      S(B + 'perfil-detalle.tsx', 'PerfilDetalle', 'Vista del detalle del perfil.')
    ]
  }
];
