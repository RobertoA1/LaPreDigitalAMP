// Contenido del Manual de Usuario y del índice de pantallas (compartido con el Manual de Código Fuente).
const CL = 'src/app/client.tsx';
const BP = 'src/app/buyer-panel.tsx';
const LP = 'src/app/lifecycle-panel.tsx';
const LG = 'src/app/login/ui.tsx';
const API = 'src/app/api/[...path]/route.ts';

export const intro = {
  titulo: 'INTRODUCCIÓN',
  opciones: [
    {
      titulo: 'Qué es LaPreDigital AMP',
      parrafos: [
        'LaPreDigital AMP (Agents Management Platform) es una aplicación web que orquesta agentes de inteligencia artificial según la etapa del embudo IMPULSE: Buyer, Lead, Payer, Customer y Turned. Cada etapa cuenta con un agente que prepara borradores, estrategias y recomendaciones para que una persona las revise: el Agente de conversión Buyer → Lead (Buyers), el Negociador (Leads), el agente de Cobranza (Payers), el de Fidelización y Acompañamiento (Customers) y el de Reactivación y Postventa (Turned). El Radar de conversaciones es un analizador transversal que vigila los chats de todas las etapas.',
        'El AMP lee las proyecciones del datamart (contactos, embudo diario y reportes académicos semanales) y escribe únicamente en sus propias tablas (prefijo amp_). No confirma pagos ni cambia planes o suscripciones: consume esa información cuando aparece en el datamart. Las tareas de IA se ejecutan en un proceso aparte (el worker) mediante una cola de trabajos; la interfaz solo las solicita y muestra el resultado.',
        'Las capturas de este manual se tomaron del sistema en funcionamiento. Los datos de los módulos Buyers (KPI, tendencia, curva de abandono, tiempo real y propuestas) provienen de las bases de LaPreDigital; los contactos de las etapas Leads, Payers, Customers y Turned, con sus mensajes, la aprobación y la campaña de ejemplo, son registros sintéticos (nombres ficticios, correos @ejemplo.test y teléfonos ficticios) cargados solo para ilustrar las pantallas.'
      ]
    },
    {
      titulo: 'Roles y permisos',
      parrafos: [
        'Cada usuario tiene un único rol, que se muestra debajo de su nombre en el encabezado de la aplicación. Los roles determinan qué botones están disponibles. El servidor vuelve a comprobar el rol en cada acción sensible, de modo que ocultar un botón no es la única protección.'
      ],
      tablaRoles: true
    },
    {
      titulo: 'Requisitos para ingresar',
      parrafos: [
        'Para usar el sistema se necesita un navegador web actual con JavaScript habilitado, la dirección (URL) en la que la organización haya publicado el AMP y una cuenta activa. Las cuentas no se registran desde la pantalla de acceso: las crea un administrador del servidor mediante el comando de creación de usuarios (npm run user:create), indicando correo, rol y nombre. El correo se compara sin distinguir mayúsculas y las cuentas desactivadas no pueden ingresar.',
        'La sesión dura 8 horas desde el ingreso; al vencer, el sistema pide iniciar sesión de nuevo. Para que los paneles se actualicen en vivo y las tareas de IA se procesen, el servidor y el worker deben estar en ejecución; el panel Buyers además requiere que el servidor use SQL Server, porque lee el DataMart y la base OLTP.'
      ]
    },
    {
      titulo: 'Cómo leer este manual',
      parrafos: [
        'El manual se organiza por módulos, identificados con una letra (A, B, C, …), que corresponden a las opciones del menú lateral del sistema. Dentro de cada módulo, cada opción se describe con su pantalla (Figura), qué muestra, cómo funciona, qué se activa internamente y qué reglas previas se aplican. Una propuesta o un borrador del agente nunca equivale a un envío ni a una publicación: solo las acciones que un usuario confirma se ejecutan.'
      ]
    }
  ]
};

export const roles = [
  ['Administrador (ADMIN)', 'Acceso a todas las pantallas. Es el único que puede cambiar el proveedor y modelo de IA y el plazo máximo de seguimiento (Configuración). Además puede aprobar y lanzar campañas, cargar resultados de exámenes y confirmar coincidencias dudosas.'],
  ['Alta dirección (DIRECCION)', 'Aprueba y lanza campañas, carga resultados de exámenes de admisión y confirma coincidencias dudosas. No puede cambiar la configuración de IA.'],
  ['Operador (OPERADOR)', 'Atiende contactos (perfil, mensajes, correcciones auditadas), usa el Radar, ejecuta los agentes, resuelve aprobaciones individuales y aprueba, edita o descarta propuestas del agente Buyer → Lead. Puede redactar borradores de campañas, pero no aprobarlas ni lanzarlas, ni cargar exámenes ni cambiar la configuración.']
];

export const kpis = [
  ['B-1.1', 'Cobertura de atribución a campañas', 'Visitas con campaña / Visitas', '< 60 %', '60 % a < 80 %', '≥ 80 %'],
  ['B-1.2', 'Costo por LEADs nuevos por campaña (S/)', 'Costo de campañas (S/) del periodo / Suma de nuevos LEADS atraídos por campañas (pagadas) en el periodo', '> S/ 15', '> S/ 8 y ≤ S/ 15', '≤ S/ 8'],
  ['B-2.1', 'Tasa de visualización completa', 'Reproducciones al final / Reproducciones totales', '< 30 %', '30 % a < 60 %', '≥ 60 %'],
  ['B-2.2', 'Tasa de avance al 50 %', 'Reproducciones a la mitad / Reproducciones totales', '< 50 %', '50 % a < 75 %', '≥ 75 %'],
  ['B-2.3', 'Conversión a LEAD tras el 50 %', 'Reproducciones elegibles que llegaron a la mitad y enviaron el formulario / Reproducciones elegibles que llegaron a la mitad', '< 5 %', '5 % a < 12 %', '≥ 12 %'],
  ['B-3.1', 'Tasa de conversión a LEADS', 'Registros de formulario / Visitas', '< 3 %', '3 % a < 8 %', '≥ 8 %']
];

// Cada figura: archivo, pie, ruta y fuentes (archivo + funciones) para el índice.
export const modulos = [
  {
    letra: 'A', titulo: 'PANTALLA DE LOGIN Y SEGURIDAD',
    opciones: [
      {
        titulo: 'Pantalla de inicio de sesión', ruta: '/login',
        parrafos: [
          'Es la primera pantalla del sistema y la única accesible sin sesión: cualquier otra dirección redirige a /login. A la izquierda muestra el mensaje institucional y a la derecha el formulario con los campos Correo electrónico y Contraseña y el botón Ingresar. Los campos aparecen vacíos y el usuario escribe sus propias credenciales; solo cuando el servidor corre en modo Demo la pantalla muestra además las cuentas de demostración de la base Demo local.',
          'Al pulsar Ingresar (o Enter), el botón cambia a «Ingresando…» y el navegador envía las credenciales al servidor (POST /api/login). El servidor valida el formato del correo, busca un usuario activo con ese correo (en minúsculas), compara la contraseña con su hash bcrypt y, si coincide, crea la cookie de sesión amp_session (firmada con HMAC, httpOnly, sameSite estricta y vigente 8 horas). Luego la aplicación redirige al Dashboard. No hay pantalla de registro: las cuentas las crea un administrador.'
        ],
        figuras: [{ archivo: '01-login.png', pie: 'Pantalla de Inicio de Sesión' }],
        fuente: [{ archivo: LG, funciones: ['Login', 'submit'] }, { archivo: API, funciones: ['POST (rama path === "login")'] }, { archivo: 'src/lib/auth.ts', funciones: ['sessionToken', 'sessionCookie', 'currentUser'] }, { archivo: 'src/app/login/page.tsx', funciones: ['LoginPage'] }]
      },
      {
        titulo: 'Validación de credenciales', ruta: '/login',
        parrafos: [
          'Cuando el correo o la contraseña no corresponden a un usuario activo, el formulario muestra debajo de los campos el mensaje «Credenciales incorrectas». El sistema no indica cuál de los dos datos falló, ni distingue entre un usuario inexistente y una cuenta desactivada. Tras el error, el botón vuelve a habilitarse para reintentar.',
          'Regla previa: el correo debe tener formato válido y la contraseña no puede estar vacía; en caso contrario el servidor rechaza la solicitud antes de consultar la base. Si el usuario ya tiene una sesión vigente y abre /login, el sistema lo envía directamente al Dashboard.'
        ],
        figuras: [{ archivo: '02-login-error.png', pie: 'Mensaje de credenciales incorrectas' }],
        fuente: [{ archivo: LG, funciones: ['Login', 'submit'] }, { archivo: API, funciones: ['POST (rama path === "login")'] }]
      },
      {
        titulo: 'Menú lateral de navegación', ruta: '/',
        parrafos: [
          'Tras ingresar, la barra lateral izquierda está siempre visible y lista los doce destinos del sistema: Dashboard, Radar de chats, Buyers, Leads, Payers, Customers, Turned, Aprobaciones, Campañas, Exámenes, Trabajos y Configuración. El destino actual se resalta. En la parte inferior, un recuadro resume los agentes disponibles y se encuentra el botón Cerrar sesión.',
          'Cada ítem es un enlace a su ruta (/radar, /buyers, /leads, etc.). Si se abre una dirección inexistente, el área de contenido muestra «No se encontró la página». Si la sesión vence mientras se navega, las peticiones a la API responden «Sesión requerida» y es necesario volver a ingresar.'
        ],
        figuras: [{ archivo: '03a-menu-lateral.png', pie: 'Menú lateral de navegación' }],
        fuente: [{ archivo: CL, funciones: ['Sidebar', 'App'] }, { archivo: 'src/app/[[...slug]]/page.tsx', funciones: ['Page'] }]
      },
      {
        titulo: 'Encabezado, estado en vivo y rol del usuario', ruta: '/',
        parrafos: [
          'La barra superior muestra la ruta de la página (migas de pan), su título y subtítulo, y a la derecha tres elementos: el indicador de conexión («EN VIVO» o «CONECTANDO»), la etiqueta «MODO DEMO» cuando el servidor corre en modo demostración, y el nombre del usuario con su rol (Administrador, Alta dirección u Operador).',
          'Internamente, al abrir cualquier página el navegador se suscribe al canal de eventos del servidor (GET /api/live, eventos enviados por el servidor). Cuando el servidor detecta cambios en los datos, avisa y las pantallas recargan su información sin que el usuario deba actualizar; si la conexión se pierde, el indicador vuelve a «CONECTANDO» y cada pantalla conserva además una recarga periódica de respaldo.'
        ],
        figuras: [{ archivo: '03b-encabezado.png', pie: 'Encabezado con estado en vivo y rol del usuario' }],
        fuente: [{ archivo: CL, funciones: ['Header', 'App'] }, { archivo: API, funciones: ['GET (rama path === "live")', 'GET (rama path === "me")'] }, { archivo: 'src/lib/live.ts', funciones: ['versionLive', 'suscribirLive'] }]
      },
      {
        titulo: 'Cierre de sesión', ruta: '/login',
        parrafos: [
          'El botón Cerrar sesión, al pie del menú lateral (ver la Figura 03), termina la sesión del usuario. El navegador solicita POST /api/logout, el servidor elimina la cookie amp_session y la aplicación redirige a la pantalla de inicio de sesión, que se muestra a continuación. Desde ese momento ninguna ruta del sistema responde sin volver a autenticarse.',
          'Se recomienda cerrar la sesión al terminar, sobre todo en equipos compartidos; de todos modos la sesión caduca sola a las 8 horas.'
        ],
        figuras: [{ archivo: '17-sesion-cerrada.png', pie: 'Pantalla de inicio de sesión tras cerrar la sesión' }],
        fuente: [{ archivo: CL, funciones: ['Sidebar (botón Cerrar sesión)'] }, { archivo: API, funciones: ['POST (rama path === "logout")'] }]
      }
    ]
  },
  {
    letra: 'B', titulo: 'DASHBOARD',
    opciones: [
      {
        titulo: 'Indicadores y embudo de conversión', ruta: '/',
        parrafos: [
          'El Dashboard resume el estado del embudo IMPULSE. Arriba hay cuatro tarjetas: Universo alcanzado (visitantes de la cohorte), Primeros pagos (con su porcentaje respecto de los leads), Aprobaciones pendientes (solicitudes que esperan una decisión humana) y Conversión a LEADS (B-3.1) con su semáforo, que enlaza al panel del agente Buyers. Si hay conversaciones con alerta, aparece debajo una franja naranja «N conversaciones requieren atención» que lleva al Radar.',
          'El gráfico de barras «Embudo de conversión» muestra Universo, Buyers, Leads, Payers y Customers del último registro de dm_funnel_daily (el día se indica en la etiqueta «Snapshot») y, debajo, el porcentaje de paso entre etapas. El panel «Contactos por etapa» cuenta los contactos de dm_contacts en cada etapa (Buyers muestra «Panel», porque un buyer es un visitante anónimo y no un contacto) y enlaza a cada etapa; también muestra los ingresos del snapshot y los reactivados. La tarjeta B-3.1 se lee del DataMart; si el servidor no usa SQL Server o el DataMart no responde, muestra el motivo en lugar de la cifra.'
        ],
        figuras: [{ archivo: '04-dashboard.png', pie: 'Dashboard: tarjetas, embudo y contactos por etapa' }],
        fuente: [{ archivo: CL, funciones: ['Dashboard', 'useData', 'pct'] }, { archivo: BP, funciones: ['BuyerDashboardCard'] }, { archivo: API, funciones: ['GET (rama path === "dashboard")'] }]
      },
      {
        titulo: 'Actividad reciente', ruta: '/',
        parrafos: [
          'La sección «Actividad reciente» lista los ocho últimos eventos registrados por el sistema en su bitácora (amp_events): cambios de etapa, ejecuciones de agentes, errores de trabajos, decisiones de operadores, etc. Cada línea muestra el resumen, el tipo de evento y la fecha; si el evento pertenece a un contacto, la flecha de la derecha abre su perfil. El enlace «Ver trabajos» lleva a la cola de trabajos del servidor.',
          'Es una vista de solo lectura que sirve de trazabilidad: permite detectar de un vistazo, por ejemplo, que un trabajo falló porque un conector (WhatsApp o correo) no está configurado.'
        ],
        figuras: [{ archivo: '04b-dashboard-actividad.png', pie: 'Actividad reciente del sistema' }],
        fuente: [{ archivo: CL, funciones: ['Dashboard (sección Actividad reciente)'] }, { archivo: API, funciones: ['GET (rama path === "dashboard")'] }, { archivo: 'src/lib/contacts.ts', funciones: ['event'] }]
      }
    ]
  },
  {
    letra: 'C', titulo: 'RADAR DE CONVERSACIONES',
    opciones: [
      {
        titulo: 'Radar de conversaciones', ruta: '/radar',
        parrafos: [
          'El Radar reúne las sugerencias abiertas que el servidor genera al analizar los chats de todos los contactos. Arriba muestra tres contadores (sugerencias abiertas, alertas activas y el plazo máximo de seguimiento) y dos botones de filtro: «Requieren atención» (alertas y respuestas por atender) y «Todas». Cada tarjeta indica el contacto (con enlace a su perfil), la fase («Respuesta sugerida», «Sin respuesta: estrategia sugerida», «Requiere respuesta manual», «Límite de seguimiento alcanzado», «Recomendación pendiente de revisión»), los días de silencio, la estrategia, un borrador con su canal y el origen (reglas del Radar o proveedor y modelo de IA).',
          'Internamente, el worker revisa los chats cada minuto sin depender de que alguien abra el perfil. Cuando el contacto escribió y nadie respondió, la fase es «Respuesta sugerida»; cuando fue la plataforma quien escribió y el contacto no responde, se emiten alertas a los 3, 7, 14 y 21 días de silencio y el seguimiento se detiene al llegar al plazo máximo (30 días por defecto, entre 1 y 90, que solo el administrador cambia en Configuración). La respuesta del contacto reinicia el ciclo. «Enviar sugerencia» envía el borrador por el canal indicado a través del mismo mecanismo que el chat del perfil y lo registra; «Marcar revisada» descarta la sugerencia sin enviar nada. Los borradores nunca se envían solos.',
          'Reglas previas del envío: el contacto debe tener consentimiento y dirección para el canal, no estar pausado, y si es TURNED no debe haber ingresado a la universidad ni haber vencido su ventana de recuperación de 30 días; además, si llegaron mensajes nuevos después de generada la sugerencia, el sistema la rechaza para evitar responder con información desactualizada. Fuera del modo Demo, el envío usa Evolution API (WhatsApp) o Gmail; si el conector no está configurado, se registra el error.'
        ],
        figuras: [{ archivo: '05-radar.png', pie: 'Radar de conversaciones' }],
        fuente: [{ archivo: CL, funciones: ['RadarPage', 'InsightCard'] }, { archivo: 'src/lib/radar.ts', funciones: ['assessConversation', 'scanRadar', 'runRadar', 'openInsights', 'dismissInsight', 'sendInsight', 'radarConfig'] }, { archivo: 'src/lib/messaging.ts', funciones: ['sendMessage', 'messagePermission'] }, { archivo: API, funciones: ['GET (rama path === "radar")', 'POST radar/send', 'POST radar/dismiss'] }]
      }
    ]
  },
  {
    letra: 'D', titulo: 'BUYERS · AGENTE DE CONVERSIÓN BUYER → LEAD',
    intro: 'Un buyer es un visitante anónimo de la landing (un dispositivo), no un contacto: por eso esta pestaña no lista personas ni envía mensajes. Muestra los KPI de adquisición y el trabajo del Agente de conversión Buyer → Lead, que solo prepara borradores y recomendaciones. Los KPI, tendencias, desgloses y la curva de abandono se leen de las bases de LaPreDigital (DataMart para KPI por periodo; OLTP para el tiempo real, el catálogo vigente y la curva de abandono) con consultas de solo lectura; el AMP nunca escribe en ellas. Requiere un servidor con SQL Server: en modo Demo responde «requiere SQL Server». Cada bloque carga de forma independiente, de modo que un fallo en uno no oculta los demás.',
    opciones: [
      {
        titulo: 'Filtros globales y KPI del periodo', ruta: '/buyers',
        parrafos: [
          'La parte superior ofrece los filtros globales: Desde y Hasta (periodo), Canal, Campaña y Video, además del botón Restablecer. Por defecto se usa el último mes con datos del DataMart, y una leyenda indica la fecha del último dato cargado («Datos del DataMart al…»). Si la fecha inicial es posterior a la final, el panel avisa del error. Debajo se agrupan las seis tarjetas de KPI por actividad: B-1 (difusión en TikTok, Instagram y WhatsApp), B-2 (video breve de la landing) y B-3 (formulario breve). Cada tarjeta muestra el código, el semáforo, el valor, el numerador sobre el denominador y los umbrales aplicados.',
          'Cada cambio de filtro vuelve a consultar el DataMart (GET /api/buyer/kpis); los resultados se guardan unos minutos en memoria. El semáforo se calcula con una única tabla de umbrales: Requiere atención (rojo), En seguimiento (amarillo), Favorable (verde) o Sin datos cuando el denominador es 0. El KPI B-1.2 se calcula con los valores del periodo filtrado: el costo de las campañas (S/) del periodo dividido entre la suma de nuevos LEADS atraídos por campañas pagadas en ese mismo periodo, y por eso cambia al ampliar o reducir las fechas. En la Figura 09 (octubre de 2026) vale S/ 0.00 sobre 553 LEADS nuevos y se muestra Favorable; en la Figura 09-B, con el periodo completo del 01/06/2025 al 31/10/2026, vale S/ 1.77 (S/ 67,700.00 sobre 38,288 LEADS nuevos). La tabla siguiente resume los seis KPI.'
        ],
        tablaKpi: true,
        figuras: [{ archivo: '06a-buyers-filtros-kpi.png', pie: 'Filtros globales y tarjetas de KPI con semáforo (octubre de 2026)' }, { archivo: '06a-buyers-filtros-kpi-periodo-completo.png', pie: 'KPI con el periodo completo del 01/06/2025 al 31/10/2026', etiqueta: '09-B' }],
        fuente: [{ archivo: BP, funciones: ['BuyerPanel', 'KpiCards', 'useBlock', 'estadoDe', 'thresholdText'] }, { archivo: 'src/lib/buyer-kpis.ts', funciones: ['KPI_DEFS', 'semaforo', 'kpisQuerySchema', 'buyerKpis', 'kpisPeriodo', 'listasFiltros', 'periodoPorDefecto', 'ultimaCarga', 'construirKpi'] }, { archivo: API, funciones: ['GET buyer/kpis'] }]
      },
      {
        titulo: 'Tendencia mensual y curva de abandono', ruta: '/buyers',
        parrafos: [
          'A la izquierda, «Evolución de un KPI» dibuja la tendencia mensual del KPI elegido en la lista desplegable (por defecto B-3.1) con los filtros vigentes. A la derecha, «Curva de abandono» se calcula para un video (por defecto el más visto del periodo, o el filtrado) y combina el porcentaje de reproducciones que alcanzan cada tramo del video (área) con el porcentaje de conversión en ese tramo (línea). Bajo el gráfico, un texto destaca la mayor caída: entre qué porcentajes (y segundos) se pierden más reproducciones.',
          'La tendencia sale del DataMart junto con los KPI; la curva se consulta aparte al OLTP (GET /api/buyer/abandonment) porque el DataMart no guarda el segundo alcanzado. Reglas: la curva exige un video y un periodo con datos; si el video no tiene reproducciones en el periodo, el panel lo indica en lugar de dibujar el gráfico.'
        ],
        figuras: [{ archivo: '06b-buyers-tendencia-abandono.png', pie: 'Tendencia mensual de un KPI y curva de abandono del video' }],
        fuente: [{ archivo: BP, funciones: ['TrendSection', 'AbandonmentSection'] }, { archivo: 'src/lib/buyer-kpis.ts', funciones: ['abandonmentQuerySchema', 'curvaAbandono', 'construirCurva', 'buyerKpis'] }, { archivo: API, funciones: ['GET buyer/kpis', 'GET buyer/abandonment'] }]
      },
      {
        titulo: 'Desgloses por canal, campaña y video', ruta: '/buyers',
        parrafos: [
          'Tres tablas descomponen los KPI. «Por canal» muestra las visitas y los seis KPI de cada canal; «Por campaña» lista tipo, visitas, leads nuevos, costo y costo por lead; «Por video» indica duración, reproducciones y los KPI B-2.1, B-2.2 y B-2.3. Cada celda lleva el semáforo (punto de color y texto accesible) calculado con los mismos umbrales que las tarjetas; un guion indica que no hay dato. En «Por campaña», el costo y el costo por lead corresponden al periodo filtrado.',
          'Los desgloses respetan los filtros globales y se obtienen en la misma consulta de KPI al DataMart. Una campaña sin visitas en el periodo no aparece en la tabla.'
        ],
        figuras: [{ archivo: '06c-buyers-desgloses.png', pie: 'Desgloses por canal, campaña y video' }],
        fuente: [{ archivo: BP, funciones: ['BreakdownTables', 'KpiCell', 'estadoDe'] }, { archivo: 'src/lib/buyer-kpis.ts', funciones: ['buyerKpis', 'semaforo'] }, { archivo: API, funciones: ['GET buyer/kpis'] }]
      },
      {
        titulo: 'Hoy en tiempo real y notificaciones', ruta: '/buyers',
        parrafos: [
          'Este bloque muestra la actividad del día (hora de Lima): visitas (y cuántas llegaron con campaña), reproducciones, conversión (formularios válidos y duplicados sobre visitas) y los formularios por estado (Válido, Duplicado, Inválido, En revisión), junto con la hora de la última actividad. Debajo, «Notificaciones de inscripciones en vivo» lista las últimas inscripciones recibidas: número de formulario, estado, canal, campaña, hora y si fue «Verificada en el OLTP».',
          'Las cifras de hoy se leen del OLTP (no del DataMart, que se carga una vez al día). Las notificaciones llegan cuando el sistema que gestiona el OLTP llama al webhook POST /api/webhooks/inscripciones con la cabecera secreta x-amp-webhook-secret: el AMP valida el cuerpo, es idempotente por idFormulario, verifica la inscripción en el OLTP y la guarda en amp_buyer_notifications sin datos personales; no contacta al lead. El bloque se actualiza al recibir eventos en vivo (con un retraso de 2 segundos para agrupar cambios) y cada 30 segundos.'
        ],
        figuras: [{ archivo: '06d-buyers-tiempo-real.png', pie: 'Actividad de hoy en tiempo real y notificaciones' }],
        fuente: [{ archivo: BP, funciones: ['RealtimeSection'] }, { archivo: 'src/lib/buyer-kpis.ts', funciones: ['actividadHoy', 'diaLima'] }, { archivo: 'src/lib/buyer-webhook.ts', funciones: ['registrarInscripcion', 'ultimasNotificaciones', 'inscripcionSchema', 'secretoValido'] }, { archivo: API, funciones: ['GET buyer/realtime', 'POST webhooks/inscripciones'] }]
      },
      {
        titulo: 'Agente: generar propuestas B-1 y B-2', ruta: '/buyers',
        parrafos: [
          'La sección «Agente de conversión Buyer → Lead» contiene un cuadro de indicaciones opcionales (hasta 500 caracteres) y dos botones: «Generar propuestas de publicaciones (B-1)» y «Analizar video y guion (B-2)». B-1 pide propuestas de publicaciones orgánicas y anuncios pagados para estudiantes postulantes y para padres o apoderados en TikTok, Instagram y WhatsApp, destacando preparación flexible, ruta de estudio y seguimiento académico. B-2 pide variantes de guion y del llamado al formulario del video de la landing, y recomendaciones de duración, orden de los beneficios y mensaje final a partir de la curva de abandono. B-3 (formulario) no tiene IA: solo se muestra su KPI.',
          'Al pulsar un botón, el panel envía POST /api/buyer/run: el servidor crea una ejecución (amp_buyer_runs, estado En cola) y encola el trabajo BUYER_RUN en amp_jobs; el panel avisa «Ejecución … en cola». El worker toma el trabajo, reúne el contexto con consultas deterministas (KPI del periodo y del anterior, desgloses, catálogo vigente y, en B-2, la curva de abandono), llama a la IA configurada y valida su respuesta con reglas: elimina o corrige precios, descuentos, becas y promesas de ingreso, exige pilar y llamado a la landing en cada publicación y completa la cobertura mínima con plantillas. Sin llave de IA, o si la IA falla, guarda propuestas de plantilla y registra el motivo. Todo queda como borrador. Además, el worker lanza B-1 y B-2 cada lunes (hora de Lima) y una ejecución por alerta si algún KPI de la actividad está en rojo y no hubo ejecución en los últimos 7 días. El trabajo BUYER_RUN no contacta a nadie y está exento del horario de envíos.'
        ],
        figuras: [{ archivo: '06e-buyers-agente.png', pie: 'Agente de conversión: indicaciones y botones de generación' }],
        fuente: [{ archivo: BP, funciones: ['AgentSection', 'launch'] }, { archivo: 'src/lib/buyer-agent.ts', funciones: ['solicitudRunSchema', 'requestRun', 'executeRun', 'buildContext', 'procesarSalidaIa', 'validarPropuestas', 'completarCobertura', 'scanBuyerSchedules'] }, { archivo: 'src/lib/jobs.ts', funciones: ['enqueue', 'processNextJob'] }, { archivo: API, funciones: ['POST buyer/run'] }]
      },
      {
        titulo: 'Ejecuciones recientes y análisis', ruta: '/buyers',
        parrafos: [
          'Bajo los botones, «Ejecuciones recientes» lista las últimas ejecuciones con su número, actividad (B-1 Publicaciones o B-2 Video y guion), estado (En cola, En proceso, Terminada, Fallida), disparador (Manual, Programada o Alerta de KPI), proveedor y modelo, y fecha. El enlace «Ver análisis» despliega el texto con el que el agente interpretó los KPI del periodo (en la figura, el análisis de una ejecución B-2 ya desplegado). El botón Actualizar recarga la lista, que además se refresca sola por eventos en vivo.',
          'Si la ejecución usó plantillas porque la IA no estaba disponible, la tarjeta lo advierte («Generado con plantilla») y muestra el motivo; si falló, muestra el error. Un trabajo con el estado En cola o En proceso muestra «Procesando…» hasta que el worker termine; al terminar, la ejecución y sus propuestas se guardan en una sola transacción.'
        ],
        figuras: [{ archivo: '06f-buyers-ejecucion-analisis.png', pie: 'Ejecuciones del agente con el análisis desplegado' }],
        fuente: [{ archivo: BP, funciones: ['AgentSection', 'RUN_STATUS', 'TRIGGER'] }, { archivo: 'src/lib/buyer-agent.ts', funciones: ['executeRun', 'listarEjecuciones', 'ejecucionAPlano', 'analisisPlantilla'] }, { archivo: API, funciones: ['GET buyer/runs'] }]
      },
      {
        titulo: 'Bandeja de propuestas', ruta: '/buyers',
        parrafos: [
          'La «Bandeja» reúne las propuestas del agente. Tres filtros permiten acotarla por Actividad (B-1 o B-2), Tipo (Publicación, Guion, Llamado al formulario, Recomendación) y Estado (por defecto Borrador). Cada tarjeta muestra etiquetas (estado, tipo, actividad, público, canal, orgánica o pagada, tipo de recomendación), el título, el texto, la justificación y la evidencia numérica tomada del contexto. Para los borradores se ofrecen los botones Aprobar, Editar y aprobar, Descartar y Copiar texto; las propuestas ya decididas muestran quién y cuándo las decidió y el motivo.',
          'Aprobar (POST /api/buyer/proposal/decide) cambia el estado a Aprobada, registra al usuario y un evento BUYER_PROPOSAL_DECISION. Aprobar no publica nada: el aviso lo recuerda («Recuerda publicarla manualmente»). Copiar texto solo copia el contenido al portapapeles. Reglas previas: solo se pueden decidir propuestas en borrador (de lo contrario el servidor responde 409) y la bandeja se actualiza sola al llegar nuevas propuestas.'
        ],
        figuras: [{ archivo: '06g-buyers-propuestas.png', pie: 'Bandeja de propuestas del agente' }],
        fuente: [{ archivo: BP, funciones: ['ProposalsSection', 'Proposal', 'evidenceLines', 'copyText'] }, { archivo: 'src/lib/buyer-agent.ts', funciones: ['listarPropuestas', 'filtroPropuestasSchema', 'decisionSchema', 'decidirPropuesta', 'propuestaAPlano'] }, { archivo: API, funciones: ['GET buyer/proposals', 'POST buyer/proposal/decide'] }]
      },
      {
        titulo: 'Editar y aprobar una propuesta', ruta: '/buyers',
        parrafos: [
          'El botón «Editar y aprobar» abre bajo la propuesta un editor con el campo «Texto final» (precargado con el contenido vigente) y los botones «Guardar y aprobar» y Cancelar. La figura muestra el editor abierto sin guardar. Guardar y aprobar solo se habilita cuando el texto no está vacío; Cancelar cierra el editor sin cambios.',
          'Al guardar, el servidor aprueba la propuesta y almacena el texto como editedContent solo si difiere del original; la tarjeta pasa a mostrar la etiqueta «Editada». Regla previa: el texto editado se revisa con las mismas reglas que el del agente; si contiene precios, descuentos, becas o promesas de ingreso, el servidor lo rechaza (422) y muestra el motivo, sin aprobar.'
        ],
        figuras: [{ archivo: '06h-buyers-editar-propuesta.png', pie: 'Edición de una propuesta con «Editar y aprobar» (sin guardar)' }],
        fuente: [{ archivo: BP, funciones: ['Proposal (modo edit)', 'decide'] }, { archivo: 'src/lib/buyer-agent.ts', funciones: ['decidirPropuesta', 'detectarProhibidos', 'decisionSchema'] }, { archivo: API, funciones: ['POST buyer/proposal/decide'] }]
      },
      {
        titulo: 'Descartar una propuesta', ruta: '/buyers',
        parrafos: [
          'El botón Descartar abre un campo «Motivo del descarte (opcional)», de hasta 300 caracteres, y los botones «Confirmar descarte» y Cancelar. La figura muestra el formulario con un motivo escrito, todavía sin confirmar. Al confirmar, la propuesta pasa a Descartada, se guarda quién la descartó, cuándo y el motivo, y se registra el evento correspondiente; deja de aparecer en el filtro Borrador pero puede consultarse con el filtro Estado = Descartada.',
          'Regla previa: solo se descartan propuestas en estado Borrador. Descartar no elimina el registro: se conserva para trazabilidad.'
        ],
        figuras: [{ archivo: '06i-buyers-descartar-propuesta.png', pie: 'Descarte de una propuesta con su motivo (sin confirmar)' }],
        fuente: [{ archivo: BP, funciones: ['Proposal (modo discard)', 'decide'] }, { archivo: 'src/lib/buyer-agent.ts', funciones: ['decidirPropuesta', 'decisionSchema'] }, { archivo: API, funciones: ['POST buyer/proposal/decide'] }]
      }
    ]
  },
  {
    letra: 'E', titulo: 'LEADS · AGENTE NEGOCIADOR',
    opciones: [
      {
        titulo: 'Listado de leads', ruta: '/leads',
        parrafos: [
          'Una etapa se presenta con un encabezado de color con el nombre del agente y el número de contactos, una recomendación del funnel pirata (para Leads, «Activation»: responder dudas, demostrar valor durante la prueba y priorizar a quienes consultan cómo contratar), un buscador por nombre y dos tablas: «Requieren atención» (respuesta manual, sugerencia del agente o aprobación pendiente) y «Esperando contacto» (seguimiento en curso sin acción inmediata). Cada fila muestra contacto y carrera, prioridad operativa, la «Evaluación IMPULSE» del agente, el motivo, el MCE (medio de contacto de preferencia), la renovación y las acciones: «Enviar sugerencia» (solo si hay un borrador y canal) y «Ver perfil».',
          'El servidor calcula la prioridad de cada contacto (Crítica, Alta, Media, En espera, Pausado) a partir de las sugerencias abiertas del Radar, las aprobaciones pendientes y, según la etapa, la inactividad o la renovación. La evaluación IMPULSE es el último perfil de negociación del agente (prioridad, campos faltantes y siguiente acción); si aún no hay interacción entrante, indica que el perfil está pendiente. «Enviar sugerencia» usa el mismo mecanismo del Radar y mueve al contacto a espera de respuesta. Un mensaje entrante activa un triaje en el servidor: saludos y hechos institucionales verificados pueden recibir respuesta automática en el mismo canal; las dudas comerciales, académicas o no verificadas generan alerta manual. Las ofertas individuales (descuentos, becas) siempre pasan por Aprobaciones.'
        ],
        figuras: [{ archivo: '07-leads.png', pie: 'Listado de Leads por prioridad' }],
        fuente: [{ archivo: CL, funciones: ['StagePage', 'StageTable', 'useData'] }, { archivo: 'src/lib/priorities.ts', funciones: ['prioritize'] }, { archivo: 'src/lib/stage-agents.ts', funciones: ['buildLeadProfile', 'stageAgentInstructions'] }, { archivo: API, funciones: ['GET (rama path === "contacts")', 'POST radar/send'] }]
      }
    ]
  },
  {
    letra: 'F', titulo: 'PAYERS · AGENTE DE COBRANZA',
    opciones: [
      {
        titulo: 'Listado de payers', ruta: '/payers',
        parrafos: [
          'Usa la misma estructura que Leads. Para Payers el funnel pirata es «Revenue»: proteger el primer ingreso, confirmar la adopción del servicio y preparar la renovación antes del vencimiento. La columna «Evaluación IMPULSE» resume el onboarding del payer (activación, acceso, diagnóstico, ruta de estudio y primera actividad) y marca prioridad ALTA cuando detecta inactividad temprana; la columna Renovación muestra la fecha de vencimiento.',
          'Reglas de renovación: el worker programa avisos a 7, 3 y 1 días del vencimiento; antes de enviar cada aviso vuelve a leer el datamart y, si el contacto se renovó, canceló o cambió la fecha, el aviso se cancela. Una renovación a 1 día o menos sube la prioridad a Alta («Renovación inminente») y a 3 días o menos a Media. Los envíos automáticos solo se hacen entre las 07:00 y las 23:00 (hora de Lima) y únicamente por canales con consentimiento; también se recuerda la revisión de simulacros los viernes.'
        ],
        figuras: [{ archivo: '08-payers.png', pie: 'Listado de Payers por prioridad' }],
        fuente: [{ archivo: CL, funciones: ['StagePage', 'StageTable'] }, { archivo: 'src/lib/priorities.ts', funciones: ['prioritize'] }, { archivo: 'src/lib/stage-agents.ts', funciones: ['assessPayerOnboarding', 'shouldSendRenewalNotice'] }, { archivo: 'src/lib/jobs.ts', funciones: ['scanSchedules', 'processNextJob'] }, { archivo: API, funciones: ['GET (rama path === "contacts")'] }]
      }
    ]
  },
  {
    letra: 'G', titulo: 'CUSTOMERS · AGENTE DE FIDELIZACIÓN Y ACOMPAÑAMIENTO',
    opciones: [
      {
        titulo: 'Listado de customers', ruta: '/customers',
        parrafos: [
          'Para Customers el encabezado indica «Agente de Fidelización y Acompañamiento» y la recomendación corresponde a «Retention · Referrals»: reconocer el progreso, atender las señales de abandono y pedir recomendaciones cuando la satisfacción sea alta. La tabla omite la columna «Evaluación IMPULSE»; el motivo de prioridad incluye, por ejemplo, «Cinco o más días sin actividad registrada» y la renovación próxima.',
          'Internamente, el worker prepara el ciclo de vida de cada customer (consultar contexto, analizar evidencia, seleccionar acción, derivar o ejecutar, registrar). La actividad se considera inactiva a los 5 días con fecha válida; el riesgo se clasifica como bajo, medio o alto (dos señales producen riesgo alto). Los customers reciben seguimiento semanal y un recordatorio de revisión de simulacros los viernes. Una acción solo se ejecuta cuando un operador la autoriza, y la pantalla de perfil (módulo I) muestra la evidencia detrás de cada recomendación.'
        ],
        figuras: [{ archivo: '09-customers.png', pie: 'Listado de Customers por prioridad' }],
        fuente: [{ archivo: CL, funciones: ['StagePage', 'StageTable'] }, { archivo: 'src/lib/priorities.ts', funciones: ['prioritize'] }, { archivo: 'src/lib/lifecycle.ts', funciones: ['lifecycleContext', 'prepareLifecycle'] }, { archivo: 'src/lib/lifecycle-policy.ts', funciones: ['lifecycleRisk', 'activityAssessment', 'CUSTOMER_INACTIVITY_DAYS'] }, { archivo: API, funciones: ['GET (rama path === "contacts")'] }]
      }
    ]
  },
  {
    letra: 'H', titulo: 'TURNED · AGENTE DE REACTIVACIÓN Y POSTVENTA',
    opciones: [
      {
        titulo: 'Listado de turned', ruta: '/turned',
        parrafos: [
          'Turned agrupa a quienes se dieron de baja. Su recomendación («Retention · Reactivation») es entender el motivo de salida, ofrecer una mejora pertinente y detener la recuperación si el contacto ingresó a la universidad. La estructura de la pantalla es la misma que en las demás etapas.',
          'Reglas: la baja no se borra de la historia; el contacto solo vuelve a Payer cuando el datamart confirma el pago, iniciando un ciclo nuevo. La ventana de contacto es de 30 días desde la baja válida; fuera de ella no se envía seguimiento automático. Un ingreso confirmado a la universidad o un contacto pausado bloquean el envío. El motivo de la baja solo se clasifica a partir de lo que el propio contacto declaró; si es desconocido, el agente pregunta en lugar de suponer. Problemas técnicos, reclamos, cancelaciones y valoraciones individuales de 0 a 6 exigen revisión humana.'
        ],
        figuras: [{ archivo: '10-turned.png', pie: 'Listado de Turned por prioridad' }],
        fuente: [{ archivo: CL, funciones: ['StagePage', 'StageTable'] }, { archivo: 'src/lib/lifecycle-policy.ts', funciones: ['recoveryWindow', 'classifyTurnedReason', 'declaredExitReason', 'reactivated', 'TURNED_CONTACT_WINDOW_DAYS'] }, { archivo: 'src/lib/lifecycle.ts', funciones: ['lifecycleContext', 'prepareLifecycle'] }, { archivo: API, funciones: ['GET (rama path === "contacts")'] }]
      }
    ]
  },
  {
    letra: 'I', titulo: 'PERFIL DEL CONTACTO',
    intro: 'El perfil se abre desde el botón «Ver perfil» de cualquier etapa o desde el Radar (ruta /contact/{id}). Los contactos en etapa BUYER no tienen perfil de conversación: no tienen agente conversacional ni reciben mensajes.',
    opciones: [
      {
        titulo: 'Datos del contacto y ejecución del agente', ruta: '/contact/{id}',
        parrafos: [
          'La cabecera del perfil muestra el nombre, la etapa, la carrera y la universidad (y una etiqueta si ya ingresó a la universidad), un enlace «Volver a…» a la etapa y el botón «Ejecutar agente». Debajo, el panel «Información del contacto» presenta los datos del datamart: correo, teléfono, MCE, canal de origen, plan, estado de pago, renovación, última actividad, racha, progreso, cursos pendientes y apoderado. Si el Radar tiene una sugerencia abierta, aparece una tarjeta con su estrategia y borrador.',
          '«Ejecutar agente» envía POST /api/agent/run: el servidor registra el evento AGENT_QUEUED, encola un trabajo AGENT para ese contacto y avisa «Agente en cola: trabajo #n»; lo procesa el worker (no el navegador). Regla previa: no está disponible para buyers. Los datos mostrados incorporan las correcciones auditadas del operador sobre la carga externa, sin sobrescribirla.'
        ],
        figuras: [{ archivo: '11a-perfil-datos.png', pie: 'Perfil del contacto: cabecera y datos del datamart' }],
        fuente: [{ archivo: CL, funciones: ['ContactPage', 'InsightCard', 'Tag'] }, { archivo: 'src/lib/contacts.ts', funciones: ['contact', 'recommend'] }, { archivo: 'src/lib/jobs.ts', funciones: ['enqueue', 'processNextJob'] }, { archivo: API, funciones: ['GET (rama path === "contact")', 'POST agent/run'] }]
      },
      {
        titulo: 'Conversación y envío de mensajes', ruta: '/contact/{id}',
        parrafos: [
          'El panel «Chat y correo» muestra el hilo de mensajes (entrantes a la izquierda, salientes a la derecha) con canal, destinatario (estudiante o apoderado), estado y fecha. Abajo, el compositor permite elegir canal (WhatsApp o correo) y destinatario (Estudiante o Apoderado), escribir el texto y pulsar «Enviar». El botón «Simular respuesta» solo se habilita en modo Demo y registra un mensaje entrante ficticio.',
          'Enviar (POST /api/message/send) pasa por las reglas previas del servidor: el contacto no puede ser buyer, estar pausado ni, siendo Turned, haber ingresado a la universidad; debe existir consentimiento y dirección para el canal elegido (el apoderado requiere su propia autorización y dirección); los reportes al apoderado de un Customer solo aplican al plan Meta UNT Plus; y a un Turned fuera de su ventana de 30 días solo se le responde si él escribió último. El horario de 07:00 a 23:00 (Lima) rige para los envíos automáticos, no para el envío manual de un operador. En modo Demo el mensaje queda como «Simulado»; fuera de Demo se envía por Evolution API (WhatsApp) o Gmail y un fallo del conector queda registrado.'
        ],
        figuras: [{ archivo: '11b-perfil-conversacion.png', pie: 'Conversación del contacto y compositor de mensajes' }],
        fuente: [{ archivo: CL, funciones: ['ContactPage (panel Chat y correo)'] }, { archivo: 'src/lib/messaging.ts', funciones: ['sendMessage', 'messagePermission', 'withinSendHours', 'receiveMessage'] }, { archivo: API, funciones: ['POST message/send', 'POST message/inbound'] }]
      },
      {
        titulo: 'Corrección auditada y revisión humana', ruta: '/contact/{id}',
        parrafos: [
          'En la columna derecha, «Actualizar dato» permite corregir un campo del contacto (MCE, correo, teléfono, carrera, notas, correo o teléfono del apoderado, o pausar el contacto con true/false) indicando el nuevo valor y el motivo, y pulsando «Guardar cambio». El panel «Prioridad o beca» permite solicitar la revisión de una beca o semibeca cuando no hubo coincidencia automática con un examen: se indica el nombre del examen, el puesto entre no ingresantes y la justificación. La columna incluye además «Próximos pasos» (recomendaciones de la etapa) y el agente responsable.',
          'La corrección no modifica la carga del datamart: se guarda como un registro en amp_overrides, con el usuario, el motivo (mínimo 3 caracteres) y la fecha, y deja un evento DATA_CHANGE; el valor corregido prevalece al mostrar el perfil. Pausar un contacto bloquea sus envíos. «Solicitar revisión» crea una aprobación pendiente de tipo SCHOLARSHIP_REVIEW que aparece en el módulo Aprobaciones; fuera de los diez primeros no ingresantes se exige justificación.'
        ],
        figuras: [{ archivo: '11c-perfil-correccion-revision.png', pie: 'Corrección auditada y revisión humana de prioridad o beca' }],
        fuente: [{ archivo: CL, funciones: ['ContactPage (columna lateral)'] }, { archivo: API, funciones: ['POST contact/override', 'POST priority/manual'] }, { archivo: 'src/lib/contacts.ts', funciones: ['contact', 'event'] }]
      },
      {
        titulo: 'Panel de ciclo de vida de Customer', ruta: '/contact/{id}',
        parrafos: [
          'Para un Customer, el perfil incluye el panel del «Agente de Fidelización y Acompañamiento». Muestra la recomendación, el nivel de riesgo (bajo, medio o alto) con el número de señales observadas, la acción propuesta con su estado y si requiere intervención humana, la evidencia de cada señal (con estado y fecha), los datos de apoyo y un desplegable «Datos que aún no permiten una conclusión». Los botones «Revisar borrador para estudiante» y «Revisar reporte para apoderado» copian el texto al compositor de mensajes, sin enviarlo.',
          'Cuando existe una revisión humana pendiente, aparece el campo «Resultado de la atención humana» y el botón «Registrar resolución humana», habilitado con al menos 10 caracteres: registra el evento SERVICE_REVIEW_RESOLVED, cierra la incidencia abierta y vuelve a habilitar la programación automática; no levanta pausas ni cambia pagos o etapas. Reglas previas: el reporte para el apoderado solo se ofrece con el plan Meta UNT Plus, con autorización del apoderado y una dirección; la IA solo elige una redacción entre opciones verificadas y no decide pagos, etapas ni riesgo; los textos son borradores y el historial indica cuáles se enviaron.'
        ],
        figuras: [{ archivo: '11d-perfil-ciclo-customer.png', pie: 'Panel del Agente de Fidelización y Acompañamiento (Customer)' }],
        fuente: [{ archivo: LP, funciones: ['LifecyclePanel'] }, { archivo: CL, funciones: ['ContactPage'] }, { archivo: 'src/lib/lifecycle-policy.ts', funciones: ['lifecycleAssessment', 'lifecycleRisk', 'activityAssessment', 'academicAssessment', 'pendingServiceReview'] }, { archivo: 'src/lib/lifecycle.ts', funciones: ['lifecycleContext', 'prepareLifecycle'] }, { archivo: API, funciones: ['POST lifecycle/resolve'] }]
      },
      {
        titulo: 'Reportes semanales (Customer)', ruta: '/contact/{id}',
        parrafos: [
          'Solo para Customers, «Reportes semanales» lista hasta 12 semanas del datamart (dm_academic_weekly): actividades completadas sobre programadas, simulacros, puntaje y cursos por reforzar. Si no hay reportes, la sección lo indica.',
          'Estos reportes alimentan la evaluación académica del agente: la variación de puntaje se calcula como (actual − anterior) / |anterior| × 100 y solo se afirma mejora o descenso porcentual cuando los puntajes provienen de evaluaciones equivalentes; sin esa equivalencia no se concluye. Un descenso de 10 % o dos evaluaciones equivalentes consecutivas sin mejora activan refuerzo.'
        ],
        figuras: [{ archivo: '11e-perfil-reportes-semanales.png', pie: 'Reportes semanales de seguimiento académico' }],
        fuente: [{ archivo: CL, funciones: ['ContactPage (sección Reportes semanales)'] }, { archivo: 'src/lib/lifecycle-policy.ts', funciones: ['academicAssessment', 'academicVariationPercent'] }, { archivo: API, funciones: ['GET (rama path === "contact")'] }]
      },
      {
        titulo: 'Panel de ciclo de vida de Turned', ruta: '/contact/{id}',
        parrafos: [
          'Para un Turned, el mismo panel se presenta como «Agente de Reactivación y Postventa»: «Comprender la baja y acompañar el retorno». Muestra la recomendación, el riesgo, la acción (por ejemplo, una propuesta de recuperación), las evidencias (motivo declarado, ventana de contacto, última actividad) y los límites de lo que aún no se puede afirmar. El botón «Revisar borrador para estudiante» copia el texto al compositor.',
          'Reglas: el motivo de la baja se conserva como el contacto lo declaró y, si es desconocido, el agente pregunta; la ventana de contacto es de 30 días desde la baja válida; un ingreso confirmado detiene la recuperación; el panel no ofrece reporte para apoderado. La reactivación solo se confirma cuando el datamart muestra el paso de Turned a Payer, y se atribuye al agente únicamente si ocurre dentro de 30 días de un contacto ejecutado por él; un retorno espontáneo no se atribuye.'
        ],
        figuras: [{ archivo: '11f-perfil-ciclo-turned.png', pie: 'Panel del Agente de Reactivación y Postventa (Turned)' }],
        fuente: [{ archivo: LP, funciones: ['LifecyclePanel'] }, { archivo: 'src/lib/lifecycle-policy.ts', funciones: ['lifecycleAssessment', 'recoveryWindow', 'reactivationAttributionWindow', 'classifyTurnedReason'] }, { archivo: 'src/lib/lifecycle.ts', funciones: ['lifecycleContext', 'prepareLifecycle'] }]
      },
      {
        titulo: 'Historial de acciones', ruta: '/contact/{id}',
        parrafos: [
          'La sección «Historial de acciones» es la línea de tiempo del contacto: cada evento muestra su resumen, el tipo de actor (sistema, agente u operador), su identificador y la fecha. Incluye los ingresos a cada etapa, ejecuciones de agentes, mensajes enviados, correcciones de datos, aprobaciones y revisiones.',
          'Es de solo lectura y se alimenta de la bitácora amp_events; sirve de auditoría para saber quién hizo qué sobre un contacto y cuándo.'
        ],
        figuras: [{ archivo: '11g-perfil-historial.png', pie: 'Historial de acciones del contacto' }],
        fuente: [{ archivo: CL, funciones: ['ContactPage (sección Historial de acciones)'] }, { archivo: 'src/lib/contacts.ts', funciones: ['contactHistory', 'event'] }, { archivo: API, funciones: ['GET (rama path === "contact")'] }]
      }
    ]
  },
  {
    letra: 'J', titulo: 'APROBACIONES',
    opciones: [
      {
        titulo: 'Decisiones pendientes', ruta: '/approvals',
        parrafos: [
          'Lista las solicitudes que requieren decisión humana: descuentos propuestos por un agente, revisiones de beca o semibeca y canales pendientes de revisión. Cada tarjeta indica el estado (PENDING, APPROVED o REJECTED), el tipo, el motivo, el contacto (con enlace), quién lo solicitó y la fecha. En las solicitudes pendientes aparecen los controles: tipo de oferta (Descuento, Beca o Semibeca), el porcentaje (solo para descuentos, máximo 30), una justificación y los botones Rechazar y Aprobar.',
          'Reglas previas: el descuento no puede superar el 30 %, un usuario puede recibir un solo cupón y la justificación debe tener al menos 3 caracteres; una solicitud ya resuelta no puede decidirse de nuevo. Al aprobar un descuento se crea un cupón de un solo uso (alcance ONE_PAYMENT, 30 días de vigencia) y se encola un trabajo OFFER que prepara el mensaje de la oferta; se registra además el evento APPROVAL. El AMP no procesa el pago: el uso efectivo del cupón lo informa la plataforma de pagos. Esta pantalla fue capturada con una solicitud sintética pendiente, sin resolverla.'
        ],
        figuras: [{ archivo: '12-aprobaciones.png', pie: 'Aprobaciones pendientes' }],
        fuente: [{ archivo: CL, funciones: ['ApprovalsPage'] }, { archivo: API, funciones: ['GET (rama path === "approvals")', 'POST approval/decide'] }, { archivo: 'src/lib/jobs.ts', funciones: ['enqueue', 'processNextJob (trabajo OFFER)'] }]
      }
    ]
  },
  {
    letra: 'K', titulo: 'CAMPAÑAS',
    opciones: [
      {
        titulo: 'Campañas con control', ruta: '/campaigns',
        parrafos: [
          'A la izquierda, el formulario «Nueva campaña» pide Nombre, Etapa, Canal (WhatsApp o correo), Oferta (Sin oferta, Descuento, Beca o Semibeca), el porcentaje si hay descuento (máximo 30) y el Mensaje, que admite variables como {nombre} y {carrera}. «Crear borrador» guarda la campaña en estado DRAFT. A la derecha, «Campañas registradas» lista las campañas con su mensaje, etapa, canal, fecha y estado; los botones Aprobar (para borradores) y Lanzar (para aprobadas) solo se muestran a Administración y Alta dirección.',
          'Reglas previas al crear: el mensaje debe tener al menos 10 caracteres, no puede mencionar un descuento mayor al 30 %, y si menciona descuento, beca, semibeca o cupón debe declararse el tipo de oferta. Aprobar exige rol Alta dirección o Administrador. Lanzar encola un trabajo CAMPAIGN por cada contacto de la etapa y el panel informa «N mensajes en cola»; cada envío se procesa en el worker, respeta el consentimiento y el horario de 07:00 a 23:00 (Lima), y las campañas aprobadas por alta dirección no necesitan nueva aprobación individual. No se pueden lanzar campañas para la etapa Buyer, porque los buyers no reciben mensajes. La campaña visible es un ejemplo sintético en borrador.'
        ],
        figuras: [{ archivo: '13-campanas.png', pie: 'Campañas: nueva campaña y campañas registradas' }],
        fuente: [{ archivo: CL, funciones: ['CampaignsPage'] }, { archivo: API, funciones: ['GET (rama path === "campaigns")', 'POST campaign/create', 'POST campaign/approve', 'POST campaign/run'] }, { archivo: 'src/lib/jobs.ts', funciones: ['enqueue', 'processNextJob (trabajo CAMPAIGN)'] }]
      }
    ]
  },
  {
    letra: 'L', titulo: 'EXÁMENES DE ADMISIÓN',
    opciones: [
      {
        titulo: 'Importar y verificar resultados', ruta: '/exams',
        parrafos: [
          'A la izquierda, el formulario «Cargar lista de ingresantes» pide el Nombre del examen, la Fecha del examen y un archivo TXT de resultados; el botón «Procesar resultados» lo envía. A la derecha, «Exámenes cargados» lista los exámenes ya importados con su fecha y nombre de archivo, y, cuando existen coincidencias dudosas, la sección «Coincidencias para revisar», donde se confirma manualmente a qué contacto corresponde cada registro.',
          'Reglas previas: solo Alta dirección y Administrador pueden cargar resultados y confirmar coincidencias (el botón queda deshabilitado para operadores); se exige nombre de al menos 3 caracteres, una fecha válida y un TXT de hasta 5 MB. Al procesar, el servidor analiza el archivo por carrera, calcula los diez mejores puntajes «NO INGRESA» de cada una y busca coincidencias con los contactos por carnet cuando existe, por nombre normalizado y mediante una comparación difusa conservadora; las coincidencias dudosas no se adjudican y quedan pendientes. Los buyers prioritarios (diez primeros no ingresantes) suben de prioridad y pueden originar una revisión de beca, y un ingreso confirmado bloquea la recuperación de un contacto Turned. Confirmar una coincidencia exige el ID del contacto y un motivo de al menos 5 caracteres, y queda auditado. En la captura no hay exámenes cargados: no se importó ningún archivo.'
        ],
        figuras: [{ archivo: '14-examenes.png', pie: 'Importación y verificación de exámenes de admisión' }],
        fuente: [{ archivo: CL, funciones: ['ExamsPage', 'ReviewEntry'] }, { archivo: 'src/lib/exams.ts', funciones: ['parseExamFile', 'importExam', 'confirmExamMatch', 'normalizeName'] }, { archivo: API, funciones: ['GET (rama path === "exams")', 'POST exam/upload', 'POST exam/match'] }]
      }
    ]
  },
  {
    letra: 'M', titulo: 'TRABAJOS DEL SERVIDOR',
    opciones: [
      {
        titulo: 'Cola de trabajos', ruta: '/jobs',
        parrafos: [
          'La tabla «Cola de trabajos» muestra los últimos 100 trabajos que el servidor procesa en segundo plano: número, tipo (por ejemplo BUYER_RUN, ANALYZE, AGENT, LIFECYCLE, INBOUND, RENEWAL, CAMPAIGN, OFFER), contacto asociado (con enlace), estado (pendiente, en ejecución, DONE, FAILED), fecha programada, número de intentos y último error. El botón Actualizar recarga la lista.',
          'Es la pantalla de diagnóstico: casi todo lo que el usuario pide en la interfaz (ejecutar un agente, lanzar una campaña, generar propuestas del agente Buyer) se encola aquí y lo procesa el worker, hasta en tres bucles concurrentes. Cada trabajo reserva un tiempo de ejecución y los reintentos se cuentan en la columna Intentos; un error, como la falta de un conector de WhatsApp o de correo, aparece en la última columna. Los trabajos de envío solo corren dentro del horario de 07:00 a 23:00 (Lima); los de análisis, ciclo de vida, mensajes entrantes y BUYER_RUN no tienen esa restricción.'
        ],
        figuras: [{ archivo: '15-trabajos.png', pie: 'Cola de trabajos del servidor' }],
        fuente: [{ archivo: CL, funciones: ['JobsPage'] }, { archivo: 'src/lib/jobs.ts', funciones: ['enqueue', 'scanSchedules', 'processNextJob', 'nextSendWindow'] }, { archivo: 'scripts/worker.ts', funciones: ['(bucle del worker)'] }, { archivo: API, funciones: ['GET (rama path === "jobs")'] }]
      }
    ]
  },
  {
    letra: 'N', titulo: 'CONFIGURACIÓN',
    opciones: [
      {
        titulo: 'Vista general de Configuración', ruta: '/settings',
        parrafos: [
          'La pantalla se divide en dos paneles: a la izquierda la elección del proveedor de inteligencia artificial y a la derecha el estado de las conexiones y el plazo de seguimiento sin respuesta. Todos los usuarios pueden verla, pero solo el Administrador puede modificar los valores: para los demás roles los controles aparecen deshabilitados.'
        ],
        figuras: [{ archivo: '16-configuracion.png', pie: 'Pantalla de Configuración' }],
        fuente: [{ archivo: CL, funciones: ['SettingsPage'] }, { archivo: API, funciones: ['GET (rama path === "settings")'] }]
      },
      {
        titulo: 'Proveedor y modelo de IA', ruta: '/settings',
        parrafos: [
          'El panel «Proveedor activo» permite elegir el proveedor (OpenAI, Gemini, Grok o Anthropic) y escribir el nombre del modelo; al elegir OpenAI se propone gpt-5-mini y para los demás el modelo queda en blanco para completarlo. El botón «Guardar proveedor» aplica el cambio a los agentes. Las llaves de acceso a cada proveedor no se capturan aquí: viven en el archivo .env.local del servidor y nunca se exponen al navegador.',
          'Regla previa: solo el Administrador puede guardar (el servidor responde 403 a otros roles). El cambio se almacena en amp_settings con la clave ai y se registra un evento SETTINGS; lo usan el Radar, los agentes de etapa y el agente Buyer → Lead. Si no hay llave del proveedor seleccionado, el agente utiliza una plantilla explícita y registra el motivo en el historial. Al elaborar este manual no se guardó ningún cambio en esta pantalla.'
        ],
        figuras: [{ archivo: '16a-configuracion-proveedor-ia.png', pie: 'Proveedor y modelo de inteligencia artificial' }],
        fuente: [{ archivo: CL, funciones: ['SettingsPage', 'save'] }, { archivo: 'src/lib/ai.ts', funciones: ['aiConfig'] }, { archivo: API, funciones: ['POST settings'] }]
      },
      {
        titulo: 'Estado de conexiones y plazo de seguimiento', ruta: '/settings',
        parrafos: [
          'El panel «Servicios» indica, para cada proveedor de IA, si su llave está configurada en el servidor («Configurado» o «Sin llave») y si las comunicaciones están en «Simulación» (modo Demo) o con «Conectores reales». Debajo, «Plazo máximo» fija los días máximos de seguimiento sin respuesta (entre 1 y 90) con el botón «Guardar plazo».',
          'Regla previa: solo el Administrador puede cambiar el plazo (el servidor valida el rango y responde 403 a otros roles). El Radar usa este plazo para decidir cuándo detener el seguimiento de una conversación sin respuesta; las alertas intermedias se emiten a los 3, 7, 14 y 21 días siempre que sean menores que el plazo. El cambio se guarda en amp_settings (clave followup) y se registra el evento FOLLOWUP_SETTINGS.'
        ],
        figuras: [{ archivo: '16b-configuracion-conexiones-seguimiento.png', pie: 'Estado de conexiones y plazo de seguimiento' }],
        fuente: [{ archivo: CL, funciones: ['SettingsPage', 'saveFollowup'] }, { archivo: 'src/lib/radar.ts', funciones: ['radarConfig', 'assessConversation'] }, { archivo: API, funciones: ['GET (rama path === "settings")', 'POST settings/followup'] }]
      }
    ]
  }
];
