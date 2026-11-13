// Selección del código principal por figura (clave = nombre del archivo de la captura).
// Cada fragmento se extrae por programa del repositorio en el momento de generar; aquí solo se indican símbolos y marcadores.
export const API = 'src/app/api/[...path]/route.ts';
const CL = 'src/app/client.tsx', BP = 'src/app/buyer-panel.tsx', LPAN = 'src/app/lifecycle-panel.tsx';
const LG = 'src/app/login/ui.tsx', PAGE = 'src/app/[[...slug]]/page.tsx';
const AUTH = 'src/lib/auth.ts', LIVE = 'src/lib/live.ts', CON = 'src/lib/contacts.ts', RAD = 'src/lib/radar.ts';
const KPI = 'src/lib/buyer-kpis.ts', BA = 'src/lib/buyer-agent.ts', WEB = 'src/lib/buyer-webhook.ts', EXT = 'src/lib/external.ts';
const AI = 'src/lib/ai.ts', JOBS = 'src/lib/jobs.ts', MSG = 'src/lib/messaging.ts', PRI = 'src/lib/priorities.ts';
const SA = 'src/lib/stage-agents.ts', LIF = 'src/lib/lifecycle.ts', POL = 'src/lib/lifecycle-policy.ts', EXM = 'src/lib/exams.ts';
const AG = 'src/lib/agents.ts';

const S = (archivo, simbolos, nota, o = {}) => ({ tipo: 'simbolo', archivo, simbolos: [].concat(simbolos), nota, ...o });
const R = (fn, cond, nota, o = {}) => ({ tipo: 'rama', archivo: API, fn, cond, nota, ...o });
const A = (archivo, nota, o = {}) => ({ tipo: 'archivo', archivo, nota, ...o });

export const codigo = {
  // ---------------- A) Login y seguridad ----------------
  '01-login.png': {
    ver: null,
    fragmentos: [
      S(LG, 'Login', 'Formulario de acceso: envía correo y contraseña a /api/login y redirige al inicio.', { desde: 'const [error, setError]', hasta: 'return (' }),
      R('POST', "path === 'login'", 'Valida el cuerpo con zod, compara el hash con bcrypt y entrega la cookie de sesión httpOnly.'),
      S(AUTH, ['sign', 'sessionToken', 'sessionCookie'], 'Token firmado con HMAC-SHA256 (carga útil id + expiración de 8 h) y atributos de la cookie.')
    ]
  },
  '02-login-error.png': {
    fragmentos: [
      S(API, ['fail', 'ok', 'requireSameOrigin', 'body'], 'Ayudantes de respuesta: el rechazo de credenciales devuelve 401 con el mensaje que muestra la pantalla; las acciones POST exigen mismo origen.'),
      S(AUTH, 'currentUser', 'Verifica firma (comparación en tiempo constante), caducidad y que el usuario siga activo.')
    ],
    ver: 'La rama POST login se muestra en la Figura {01-login.png}.'
  },
  '03a-menu-lateral.png': {
    fragmentos: [
      S(CL, 'Sidebar', 'Opciones de navegación del menú lateral y marca de la opción activa.', { desde: 'function Sidebar', hasta: '</nav>' }),
      S(CL, 'App', 'Determina la etapa y el título según la ruta (slug) y elige la página a mostrar.', { desde: 'export default function App', hasta: 'const subtitle' }),
      S(PAGE, 'Page', 'Página servidor: exige sesión (redirige a /login) y entrega usuario y ruta al cliente.')
    ]
  },
  '03b-encabezado.png': {
    fragmentos: [
      S(CL, 'Header', 'Encabezado: indicador EN VIVO, modo demo, nombre y rol del usuario.'),
      S(CL, 'App', 'Abre el canal SSE /api/live y emite el evento amp-live que refresca las vistas.', { desde: 'useEffect(() => {', hasta: '}, []);' }),
      R('GET', "path === 'live'", 'Flujo de eventos (Server-Sent Events) con latido y aviso de cambio de versión.'),
      S(LIVE, ['versionLive', 'suscribirLive'], 'Una consulta compartida por tick con el máximo id de las tablas que alimentan el panel.')
    ]
  },
  '17-sesion-cerrada.png': {
    fragmentos: [
      S(CL, 'Sidebar', 'Botón «Cerrar sesión»: llama a /api/logout y vuelve a /login.', { desde: '<button', hasta: '</button>' }),
      R('POST', "path === 'logout'", 'Elimina la cookie de sesión.')
    ],
    ver: 'La verificación de sesión (currentUser) se muestra en la Figura {02-login-error.png}.'
  },

  // ---------------- B) Dashboard ----------------
  '04-dashboard.png': {
    fragmentos: [
      S(CL, 'Dashboard', 'Carga /api/dashboard y arma la serie del embudo.', { desde: 'function Dashboard', hasta: 'const cards = [' }),
      S(CL, 'Dashboard', 'Gráfico de barras del embudo de conversión.', { desde: '<section className="panel chart-panel">', hasta: '</section>' }),
      S('src/app/buyers/dashboard-card.tsx', 'BuyerDashboardCard', 'Tarjeta del KPI B-3.1 que enlaza con el panel de Buyers.'),
      R('GET', "path === 'dashboard'", 'Última instantánea del embudo, conteo actual por etapa, pendientes y alertas.')
    ]
  },
  '04b-dashboard-actividad.png': {
    fragmentos: [
      S(CL, 'Dashboard', 'Lista de la actividad reciente.', { desde: '<section className="panel activity-panel">', hasta: '</section>' }),
      R('GET', "path === 'dashboard'", 'Últimos 8 eventos de trazabilidad.', { desde: 'const latest', hasta: 'latest,' }),
      S(CON, 'event', 'Registro de un evento de trazabilidad (usado por todas las acciones del sistema).')
    ]
  },

  // ---------------- C) Radar ----------------
  '05-radar.png': {
    fragmentos: [
      S(CL, 'RadarPage', 'Vista del Radar: totales, filtro «requieren atención / todas» y tarjetas por conversación.', { desde: 'function RadarPage', hasta: 'return (' }),
      S(CL, 'InsightCard', 'Acciones de la tarjeta: enviar el borrador o descartar la sugerencia.', { desde: 'function InsightCard', hasta: 'return (' }),
      R('GET', "path === 'radar'", 'Sugerencias abiertas con el nombre del contacto y el plazo de seguimiento.'),
      S(RAD, 'assessConversation', 'Regla de negocio: fase REPLY / FOLLOWUP_n / STOP según los días sin respuesta.'),
      S(RAD, 'scanRadar', 'Barrido del worker: encola un trabajo ANALYZE por conversación con clave de deduplicación.', { omitir: [['const messages = plainMany', 'const key = insightKey']] }),
      S(RAD, 'runRadar', 'Trabajo ANALYZE: estrategia, borrador (IA con respaldo por reglas) y creación de la sugerencia.', { desde: 'const advice = strategy', hasta: 'const latestNow' }),
      S(RAD, 'sendInsight', 'Envío por el operador con comprobaciones de estado y reclamo atómico.', { omitir: [['const c = await contact(row.contactId)', 'const [claimed]']] }),
      R('POST', "path === 'radar/send'", 'Ruta que envía el borrador sugerido.')
    ]
  },

  // ---------------- E–H) Etapas ----------------
  '07-leads.png': {
    fragmentos: [
      S(CL, 'StagePage', 'Carga de contactos de la etapa y envío de la sugerencia del Radar.', { desde: 'function StagePage', hasta: 'const description' }),
      S(CL, 'StagePage', 'Envío de sugerencia.', { desde: 'async function sendSuggestion', hasta: 'const showImpulse' }),
      R('GET', "path === 'contacts'", 'Lista priorizada de contactos con el resumen del perfil de negociación.', { omitir: [['const ids = rows.map', 'const prioritized = rows']] }),
      S(PRI, 'prioritize', 'Regla de prioridad operativa: puntaje y etiqueta según alertas, renovación y aprobaciones.', { desde: 'let score', hasta: 'if (c.contactPaused' }),
      S(SA, 'buildLeadProfile', 'Perfil progresivo del Lead construido solo con datos y evidencias explícitas.', { omitir: [['gratuita|explora)', 'const priorityEvidence']] }),
      S(SA, ['stageProposalSchema', 'promptForStage'], 'Esquema estricto de la propuesta del agente y prompt por etapa.')
    ]
  },
  '08-payers.png': {
    fragmentos: [
      S(CL, 'StageTable', 'Filas de la tabla con prioridad, evaluación IMPULSE y acciones.', { desde: '<tbody>', hasta: '</tbody>' }),
      R('GET', "path === 'contacts'", 'Resumen de onboarding calculado para los Payers.', { desde: "if (c.stage === 'PAYER')", hasta: 'return item;' }),
      S(SA, 'assessPayerOnboarding', 'Evaluación del onboarding: activación, acceso, diagnóstico, ruta y primera actividad.', { omitir: [['for (const message of messages', 'return {']] }),
      S(SA, 'shouldSendRenewalNotice', 'Un aviso de renovación solo se envía si la vigencia y el pago siguen vigentes.'),
      S(JOBS, 'scanSchedules', 'Programación de avisos de renovación a 7, 3 y 1 días.', { desde: 'const days = daysUntil(c.renewalAt, now);', hasta: 'scheduled++;' })
    ]
  },
  '09-customers.png': {
    fragmentos: [
      R('GET', "path === 'contacts'", 'Los contactos de ciclo de vida se enriquecen con su evaluación.', { desde: 'const baseRows', hasta: 'const ids' }),
      S(POL, ['CUSTOMER_INACTIVITY_DAYS', 'TURNED_CONTACT_WINDOW_DAYS', 'REACTIVATION_ATTRIBUTION_WINDOW_DAYS', 'activityAssessment'], 'Umbrales del ciclo de vida y evaluación de actividad del Customer.'),
      S(LIF, 'lifecycleContext', 'Reúne reportes, mensajes y eventos y evalúa el ciclo de vida.', { desde: 'export async function lifecycleContext', hasta: 'if (c.stage ===' }),
      S(LIF, 'prepareLifecycle', 'Trabajo LIFECYCLE: prepara la recomendación del agente de Fidelización.', { desde: 'export async function prepareLifecycle', hasta: 'if (pendingContact)' })
    ]
  },
  '10-turned.png': {
    fragmentos: [
      S(POL, 'recoveryWindow', 'Plazo de recuperación posterior a la baja; se detiene por pausa o ingreso confirmado.'),
      S(POL, ['declaredExitReason', 'classifyTurnedReason'], 'Clasificación del motivo de salida declarado.'),
      S(POL, ['reactivationAttributionWindow', 'reactivated'], 'Atribución de una reactivación (TURNED → PAYER) al agente.'),
      S(LIF, 'lifecycleContext', 'Para Turned, el plazo del Radar acota la ventana de contacto.', { desde: "if (c.stage === 'TURNED')", hasta: 'const sourceMessageId' }),
      S(JOBS, 'syncStage', 'Detección del cambio de etapa y de la reactivación desde el datamart.', { desde: 'if (previous.stage !== c.stage)', hasta: 'const lifecycleEvents' })
    ]
  },

  // ---------------- I) Perfil del contacto ----------------
  '11a-perfil-datos.png': {
    fragmentos: [
      S(CL, 'ContactPage', 'Carga del perfil y ejecución del agente desde la vista.', { desde: 'function ContactPage', hasta: 'if (error) return' }),
      S(CL, 'ContactPage', 'Panel de datos del datamart.', { desde: '<section className="panel profile-panel">', hasta: '</section>' }),
      R('GET', "path === 'contact'", 'Perfil con historial, sugerencias, reportes semanales y evaluación del ciclo de vida.'),
      S(CON, ['contact', 'recommend'], 'Contacto con las correcciones auditadas aplicadas y recomendaciones por etapa.', { omitir: [["export async function recommend", 'if (c.stage === \'PAYER\')']] }),
      R('POST', "path === 'agent/run'", 'Encola el trabajo AGENT (los Buyers no tienen agente conversacional).'),
      S(AG, 'runAgent', 'Trabajo AGENT: según la etapa prepara el ciclo de vida o ejecuta el agente IMPULSE.', { desde: 'if (isLifecycle(c.stage)) return prepareLifecycle', hasta: 'const recs = await recommend(c)' })
    ],
    ver: 'La función enqueue se muestra en la Figura {06f-buyers-agente-ejecucion-vivo.png}.'
  },
  '11b-perfil-conversacion.png': {
    fragmentos: [
      S(CL, 'ContactPage', 'Compositor: simular respuesta (demo) y enviar.', { desde: '<div className="composer-actions">', hasta: 'Enviar <ArrowRight' }),
      R('POST', "path === 'message/send'", 'Ruta de envío por el operador con restricciones por etapa y plan.'),
      S(MSG, ['messagePermission', 'withinSendHours'], 'Consentimiento, dirección disponible y horario de envío (07:00–23:00, Lima).'),
      S(MSG, 'sendMessage', 'Validaciones previas y envío (simulado en demo; conector real en producción).', { desde: 'export async function sendMessage', hasta: "let status = 'SIMULATED'" }),
      R('POST', "path === 'message/inbound'", 'Simulación de un mensaje entrante (solo modo demo).')
    ]
  },
  '11c-perfil-correccion-revision.png': {
    fragmentos: [
      S(CL, 'ContactPage', 'Formulario de corrección auditada.', { desde: '<p className="eyebrow">CORRECCIÓN AUDITADA</p>', hasta: 'Guardar cambio' }),
      R('POST', "path === 'contact/override'", 'Guarda la corrección como override con actor, motivo y evento.'),
      R('POST', "path === 'priority/manual'", 'Crea la solicitud de revisión de beca o semibeca para aprobación.')
    ]
  },
  '11d-perfil-ciclo-customer.png': {
    fragmentos: [
      S(LPAN, 'LifecyclePanel', 'Panel del agente de Fidelización: riesgo, acción y borradores para revisión.', { desde: 'export default function LifecyclePanel', hasta: '<ul>' }),
      S(POL, 'lifecycleRisk', 'Riesgo del Customer a partir de evidencias confirmadas.', { desde: 'export function lifecycleRisk', hasta: 'const inbound' }),
      S(POL, 'pendingServiceReview', 'Detecta revisiones de servicio pendientes de resolución humana.'),
      R('POST', "path === 'lifecycle/resolve'", 'Registra la resolución humana y habilita de nuevo la programación automática.')
    ]
  },
  '11e-perfil-reportes-semanales.png': {
    fragmentos: [
      S(CL, 'ContactPage', 'Sección de reportes semanales.', { desde: "{c.stage === 'CUSTOMER' && (", hasta: '</section>' }),
      R('GET', "path === 'contact'", 'Últimos 12 reportes de dm_academic_weekly.', { desde: 'weekly: plainMany', hasta: 'limit: 12' }),
      S(POL, ['academicVariationPercent', 'academicAssessment'], 'Variación académica solo entre evaluaciones comparables.')
    ]
  },
  '11f-perfil-ciclo-turned.png': {
    fragmentos: [
      S(LPAN, 'LifecyclePanel', 'Textos del panel según la propuesta de reactivación.', { desde: '<section className="panel">', hasta: '<ul>' }),
      S(POL, 'lifecycleAssessment', 'Evaluación del ciclo de vida (evidencias y límites de los datos).', { desde: 'export function lifecycleAssessment', hasta: 'let summary' }),
      S(POL, 'lifecycleAssessment', 'Propuesta de recuperación para Turned.', { desde: "if (c.stage === 'TURNED') {", hasta: 'const action =' })
    ]
  },
  '11g-perfil-historial.png': {
    fragmentos: [
      S(CL, 'ContactPage', 'Línea de tiempo del historial de acciones.', { desde: '<p className="eyebrow">TRAZABILIDAD COMPLETA</p>', hasta: '</section>' }),
      S(CON, 'contactHistory', 'Eventos, mensajes y aprobaciones del contacto.'),
      S(CON, 'event', 'Registro de eventos con actor y detalle.')
    ]
  },

  // ---------------- J–M) ----------------
  '12-aprobaciones.png': {
    fragmentos: [
      S(CL, 'ApprovalsPage', 'Decisión sobre una aprobación desde la vista.', { desde: 'function ApprovalsPage', hasta: 'return (' }),
      R('GET', "path === 'approvals'", 'Últimas 200 aprobaciones.'),
      R('POST', "path === 'approval/decide'", 'Decisión con control humano: reclamo atómico, un solo cupón por usuario y descuento máximo 30 %.', { omitir: [['const payload = JSON.parse(row.payload)', 'const [updated]']] }),
      S(JOBS, 'processNextJob', 'Trabajo OFFER: solo se envía la oferta si la aprobación está APPROVED.', { desde: "else if (candidate.kind === 'OFFER')", hasta: 'const offer = JSON.parse(approval.payload)' })
    ]
  },
  '13-campanas.png': {
    fragmentos: [
      S(CL, 'CampaignsPage', 'Creación y acciones sobre campañas.', { desde: 'function CampaignsPage', hasta: 'return (' }),
      R('POST', "path === 'campaign/create'", 'Reglas de la campaña: tope de 30 % y declaración del tipo de oferta.'),
      R('POST', "path === 'campaign/approve'", 'Solo alta dirección o administración aprueban.'),
      R('POST', "path === 'campaign/run'", 'Encola un trabajo CAMPAIGN por contacto de la etapa.'),
      S(JOBS, 'processNextJob', 'Trabajo CAMPAIGN: vigencia, cupón único y plantilla con {nombre} y {carrera}.', { desde: "else if (candidate.kind === 'CAMPAIGN')", hasta: 'await db.amp_jobs.update(' })
    ]
  },
  '14-examenes.png': {
    fragmentos: [
      S(CL, 'ExamsPage', 'Carga del TXT del examen.', { desde: 'function ExamsPage', hasta: 'return (' }),
      R('POST', "path === 'exam/upload'", 'Valida rol, nombre, fecha y TXT de hasta 5 MB.'),
      S(EXM, ['normalizeName', 'parseExamFile'], 'Lectura del TXT de resultados y ranking de no ingresantes por carrera.'),
      S(EXM, 'importExam', 'Coincidencia conservadora (número, nombre exacto o difusa) y prioridad de buyers.', { desde: 'const fuse = new Fuse', hasta: 'if (!contactId) continue;' }),
      R('POST', "path === 'exam/match'", 'Confirmación manual de coincidencias dudosas.'),
      S(EXM, 'confirmExamMatch', 'Aplica la coincidencia confirmada con reclamo atómico.', { desde: 'export async function confirmExamMatch', hasta: "const result = String" })
    ]
  },
  '15-trabajos.png': {
    fragmentos: [
      S(CL, 'JobsPage', 'Tabla de la cola de trabajos.', { desde: '<tbody>', hasta: '</tbody>' }),
      R('GET', "path === 'jobs'", 'Últimos 100 trabajos.'),
      A('scripts/worker.ts', 'Proceso worker: un planificador cada 60 s y tres bucles de trabajo.'),
      S(JOBS, ['nextSendWindow'], 'Próxima ventana de envío (07:00 de Lima).'),
      S(JOBS, 'processNextJob', 'Selección, reclamo con arrendamiento y reintentos con espera creciente.', { desde: 'export async function processNextJob', hasta: 'if (!claimed) return true;' }),
      S(JOBS, 'processNextJob', 'Gestión del error: tras tres intentos el trabajo pasa a FAILED.', { desde: '} catch (error) {', hasta: 'if (candidate.kind' })
    ]
  },
  '16-configuracion.png': {
    fragmentos: [
      S(CL, 'SettingsPage', 'Carga de la configuración y estado de los formularios.', { desde: 'function SettingsPage', hasta: 'async function save()' }),
      R('GET', "path === 'settings'", 'Devuelve proveedor activo, plazo y solo si existen llaves (nunca su valor).'),
      S(AUTH, ['canApprove', 'canConfigure'], 'Permisos por rol.')
    ]
  },
  '16a-configuracion-proveedor-ia.png': {
    fragmentos: [
      S(CL, 'SettingsPage', 'Guardado del proveedor y modelo.', { desde: 'async function save()', hasta: 'async function saveFollowup' }),
      R('POST', "path === 'settings'", 'Solo administración cambia el proveedor; queda un evento.'),
      S(AI, ['DEFAULT_OPENAI_MODEL', 'aiConfig'], 'Lectura de la configuración de IA (valor por defecto si no hay registro).')
    ],
    ver: 'La función generate, que usa esta configuración, se muestra en la Figura {06f-buyers-agente-ejecucion-vivo.png}.'
  },
  '16b-configuracion-conexiones-seguimiento.png': {
    fragmentos: [
      S(CL, 'SettingsPage', 'Guardado del plazo de seguimiento.', { desde: 'async function saveFollowup', hasta: 'return (' }),
      R('POST', "path === 'settings/followup'", 'Solo administración; valida de 1 a 90 días.'),
      S(RAD, 'radarConfig', 'Lectura del plazo máximo de seguimiento (30 días por defecto).')
    ]
  }
};
export { S, R, A };
