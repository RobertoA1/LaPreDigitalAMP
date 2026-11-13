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
  ['Administrador (ADMIN)', 'Acceso a todas las pantallas. Es el único que puede cambiar el proveedor y modelo de IA y el plazo máximo de seguimiento (Configuración). Además puede aprobar y lanzar campañas, cargar resultados de exámenes, confirmar coincidencias dudosas y, en Buyers, cambiar el modo del agente (Automático o Manual) y crear, modificar, eliminar o restaurar las reglas de negocio.'],
  ['Alta dirección (DIRECCION)', 'Aprueba y lanza campañas, carga resultados de exámenes de admisión y confirma coincidencias dudosas. En Buyers cambia el modo del agente y edita las reglas de negocio, igual que el Administrador. No puede cambiar la configuración de IA.'],
  ['Operador (OPERADOR)', 'Atiende contactos (perfil, mensajes, correcciones auditadas), usa el Radar, ejecuta los agentes, resuelve aprobaciones individuales y aprueba, edita o descarta propuestas del agente Buyer → Lead. En Buyers puede ver las reglas y el estado del agente y pulsar «Ejecutar ahora», pero no cambiar el modo ni editar reglas (solo lectura). Puede redactar borradores de campañas, pero no aprobarlas ni lanzarlas, ni cargar exámenes ni cambiar la configuración. Todos los roles con sesión pueden ver los perfiles de Buyers.']
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
    intro: 'Un buyer es un visitante anónimo de la landing (un dispositivo), no un contacto: por eso esta página no lista conversaciones ni envía mensajes. Muestra los KPI de adquisición y el trabajo del Agente de conversión Buyer → Lead, que solo prepara borradores y recomendaciones. La página se organiza con una barra del agente siempre visible en la parte superior y seis secciones con dirección propia: Resumen (/buyers), Análisis (/buyers/analisis), Agente (/buyers/agente), Propuestas (/buyers/propuestas), Reglas (/buyers/reglas) y, como botón destacado, Perfiles (/buyers/perfiles). Los filtros globales viven en la dirección de la página y se conservan al cambiar de sección. Los KPI, tendencias y desgloses se leen del DataMart y la curva de abandono, la actividad de hoy y los perfiles se leen del OLTP, siempre con consultas de solo lectura: el AMP nunca escribe en esas bases. Requiere un servidor con SQL Server: en modo Demo responde «requiere SQL Server». Cada bloque carga de forma independiente, de modo que un fallo en uno no oculta los demás. Los semáforos, los términos prohibidos, la cobertura y la programación ya no son constantes fijas: son reglas de negocio que se consultan y, con el rol adecuado, se editan desde la sección Reglas.',
    opciones: [
      {
        titulo: 'Barra del agente y pestañas', ruta: '/buyers',
        parrafos: [
          'La barra del agente aparece arriba en todas las secciones de Buyers. Muestra el estado del worker («Worker activo» con «último latido hace N s», o «Worker detenido»), los contadores «por revisar» (propuestas en borrador, con enlace a Propuestas) y «avisos» (alertas abiertas, con enlace a Resumen) y un botón para actualizar. Debajo hay una tarjeta por actividad, B-1 Publicaciones y B-2 Video y guion, con su estado («Sin tareas en este momento», «En cola», «Ejecutando» con el paso y el tiempo transcurrido, o «Error»), el interruptor de modo, la última ejecución (cuándo, si terminó o falló, disparador, proveedor y modelo, y cuántas propuestas generó), la próxima ejecución automática (fecha en hora de Lima o «Solo manual») y el botón «Ejecutar ahora». Debajo de la barra están las pestañas Resumen, Análisis, Agente, Propuestas y Reglas, con insignias (avisos abiertos y propuestas por revisar), un mini resumen del estado y el botón destacado Perfiles con el total de capturados.',
          'Internamente, el worker escribe un latido en la configuración cada 15 segundos como máximo; si pasan más de 45 segundos sin latido, el agente figura como detenido, la barra avisa que las ejecuciones quedarán en cola y las automáticas no se lanzarán hasta que el worker se inicie. «Ejecutar ahora» envía POST /api/buyer/run: crea una ejecución, encola el trabajo BUYER_RUN y la tarjeta pasa a «En cola» y luego a «Ejecutando» (con el enlace «Ver en vivo» a la sección Agente); el botón queda deshabilitado mientras la actividad esté en curso.',
          'Modo Manual o Automático: por defecto ambas actividades están en Manual (al pulsar Ejecutar): el agente solo corre cuando una persona pulsa el botón; las reglas de programación y las alertas con acción «ejecutar» no lanzan nada (las alertas igualmente generan avisos). Con Automático (cada semana), además, el worker lanza la ejecución semanal programada (por defecto lunes 08:00, hora de Lima) y las ejecuciones de las alertas cuya acción sea «ejecutar», respetando los días de enfriamiento entre ejecuciones (7 por defecto); si se activa después de la hora semanal de hoy, no se lanza de inmediato. Pasar a Automático abre un cuadro de confirmación que explica estas consecuencias; volver a Manual es inmediato. En ambos modos las propuestas nacen siempre como borrador y nada se publica solo.',
          'Reglas previas: solo Administración y Alta dirección pueden cambiar el modo (a un operador el interruptor le aparece deshabilitado con el aviso correspondiente y el servidor responde 403); cada cambio queda en la bitácora como BUYER_AGENT_MODE. Cualquier usuario puede pulsar «Ejecutar ahora». Las capturas se tomaron con ambas actividades en Manual.'
        ],
        figuras: [{ archivo: '06a-buyers-barra-agente.png', pie: 'Barra del agente y pestañas de Buyers' }],
        fuente: [{ archivo: 'src/app/buyers/agent-bar.tsx', funciones: ['AgentBar', 'ActivityCard', 'WorkerChip', 'MiniStatus', 'cambiarModo', 'ejecutar'] }, { archivo: 'src/app/buyers/panel.tsx', funciones: ['BuyerPanel', 'Panel'] }, { archivo: 'src/app/buyers/agent-meta.tsx', funciones: ['workerEstado', 'pasoActual', 'ESTADO_AGENTE', 'DISPARADOR'] }, { archivo: 'src/app/buyers/hooks.ts', funciones: ['useBlock', 'useUrlState', 'TABS'] }, { archivo: 'src/lib/buyer-auto.ts', funciones: ['estadoAgente', 'proximaEjecucion', 'modoAgente'] }, { archivo: 'src/lib/buyer-agent.ts', funciones: ['requestRun'] }, { archivo: API, funciones: ['GET buyer/agent', 'POST buyer/agent/mode', 'POST buyer/run'] }]
      },
      {
        titulo: 'Resumen: filtros, avisos y KPI del periodo', ruta: '/buyers',
        parrafos: [
          'La sección Resumen reúne tres bloques. Los filtros globales son Mes (lista de los últimos 17 meses con datos), Desde, Hasta, Canal, Campaña y Video, además del botón Restablecer; por defecto se usa el último mes con datos del DataMart y una leyenda indica la fecha del último dato cargado. Si la fecha inicial es posterior a la final, el panel avisa del error. «Avisos abiertos» lista los avisos generados por las reglas de alerta: mensaje, KPI y valor, fecha en hora de Lima, la acción de la regla (Solo avisar, Ejecutar B-1 o Ejecutar B-2), el enlace a la ejecución si se lanzó una y el botón «Marcar como visto», que envía POST /api/buyer/alert/ack. Por último, «KPI del periodo» muestra seis tarjetas ordenadas por código, cada una con el semáforo, el valor, el numerador sobre el denominador, la variación frente al periodo anterior (cuando el servidor la entrega) y los niveles vigentes; si los niveles no son los de fábrica aparece la etiqueta «Niveles personalizados», con enlace a la regla.',
          'Cada cambio de filtro vuelve a consultar el DataMart (GET /api/buyer/kpis); los KPI no se actualizan por eventos en vivo ni por intervalo, solo al abrir la sección, al cambiar filtros o al actualizar. Los estados se calculan en cada respuesta con los niveles vigentes: Requiere atención (rojo), En seguimiento (amarillo), Favorable (verde) o Sin datos cuando el denominador es 0; por eso cambiar o restaurar un semáforo en Reglas se refleja al instante sin alterar los valores. Los avisos se generan en el servidor: se evalúan las reglas de alerta sobre el periodo por defecto como mucho una vez por hora (y de nuevo si cambian las reglas o el modo), con un aviso por regla y día. B-1.2 usa la fórmula literal del periodo: costo de campañas (S/) del periodo dividido entre la suma de nuevos LEADS atraídos por campañas pagadas en el periodo; en la figura (octubre de 2026) vale S/ 0.00 sobre 553 LEADS nuevos y se muestra Favorable. La tabla siguiente resume los seis KPI con sus niveles de fábrica; ahora son editables desde Reglas (sección Reglas, Semáforos), de modo que las tarjetas siempre muestran los niveles vigentes.'
        ],
        tablaKpi: true,
        figuras: [{ archivo: '06b-buyers-resumen.png', pie: 'Resumen: filtros globales, avisos abiertos y KPI con semáforo' }],
        fuente: [{ archivo: 'src/app/buyers/tab-resumen.tsx', funciones: ['TabResumen', 'AlertsSection', 'Kpis', 'KpiCard', 'variacion'] }, { archivo: 'src/app/buyers/filters.tsx', funciones: ['FilterBar'] }, { archivo: 'src/app/buyers/hooks.ts', funciones: ['useUrlState', 'useBlock'] }, { archivo: 'src/lib/buyer-kpis.ts', funciones: ['KPI_DEFS', 'semaforo', 'kpisQuerySchema', 'buyerKpis', 'kpisPeriodo', 'listasFiltros', 'periodoPorDefecto', 'ultimaCarga', 'construirKpi'] }, { archivo: 'src/lib/buyer-auto.ts', funciones: ['evaluarAlertas', 'estadoAgente'] }, { archivo: API, funciones: ['GET buyer/kpis', 'POST buyer/alert/ack'] }]
      },
      {
        titulo: 'Análisis y lectura del periodo', ruta: '/buyers/analisis',
        parrafos: [
          'La sección Análisis repite los filtros globales y abre con «Lectura del periodo», un texto de tres partes: «Qué pasó» (qué KPI requieren atención, cuáles están en seguimiento, cuáles son favorables y cuáles no tienen datos o no son aplicables), «Qué hacer» (por ejemplo, preparar propuestas de publicaciones para B-1 o variantes de guion y llamado para B-2) y «Qué acción tomar» (revisar las propuestas de B-1 y B-2), con el enlace «Abrir Agente» cuando corresponde. Esta lectura la compone el propio navegador con reglas deterministas a partir de los seis KPI ya consultados: no usa IA ni dispara ninguna ejecución, y cuando no hay datos evaluables lo dice y no recomienda nada. Debajo se muestran la tendencia mensual del KPI elegido, con líneas de referencia en los niveles amarillo y verde vigentes, y la curva de abandono de un video (por defecto el más visto del periodo), con la franja «Mayor caída» resaltada y un texto que indica entre qué porcentajes (y segundos) se pierden más reproducciones.',
          'Los tres desgloses (por canal, por campaña y por video) se pueden ordenar pulsando el encabezado de cada columna, incluyen una fila de totales del periodo y cada celda lleva el semáforo con icono y texto accesible. En «Por campaña» hay un buscador por nombre o tipo, y el costo y el costo por lead corresponden al periodo filtrado; un guion indica que no hay dato. Todo sale de la consulta de KPI al DataMart, salvo la curva de abandono, que se consulta aparte al OLTP (GET /api/buyer/abandonment) porque el DataMart no guarda el segundo alcanzado; exige un video y un periodo con datos y, si el video no tiene reproducciones, el panel lo indica en lugar de dibujar el gráfico.'
        ],
        figuras: [
          { archivo: '06c-buyers-analisis-lectura.png', pie: 'Análisis: lectura del periodo, tendencia mensual y curva de abandono' },
          { archivo: '06d-buyers-analisis-desgloses.png', pie: 'Análisis: desgloses por canal, campaña y video' }
        ],
        fuente: [{ archivo: 'src/app/buyers/tab-analisis.tsx', funciones: ['TabAnalisis', 'Trend', 'Abandonment', 'Desgloses', 'PorCanal', 'PorCampana', 'PorVideo', 'KpiCell'] }, { archivo: 'src/app/buyers/period-reading.ts', funciones: ['leerPeriodo'] }, { archivo: 'src/app/buyers/ui.tsx', funciones: ['SortTable'] }, { archivo: 'src/lib/buyer-kpis.ts', funciones: ['buyerKpis', 'abandonmentQuerySchema', 'curvaAbandono', 'construirCurva'] }, { archivo: API, funciones: ['GET buyer/kpis', 'GET buyer/abandonment'] }]
      },
      {
        titulo: 'Agente: tiempo real y notificaciones', ruta: '/buyers/agente',
        parrafos: [
          'La sección Agente comienza con «Actividades», que resume el alcance de B-1 (publicaciones orgánicas y anuncios pagados en TikTok, Instagram y WhatsApp), B-2 (video breve de la landing) y B-3 (formulario breve, que no usa IA ni tiene acción de ejecución). Sigue «Hoy en tiempo real», con las visitas del día (y cuántas llegaron con campaña), las reproducciones, la conversión (formularios válidos y duplicados sobre visitas), los formularios por estado y la hora de la última actividad, y «Notificaciones de inscripciones en vivo», una lista de las últimas inscripciones con número de formulario, estado, canal, campaña, hora, si fue «Verificada en el OLTP» y el enlace «Ver perfil», que abre el detalle en la sección Perfiles.',
          'Las cifras de hoy se leen del OLTP (no del DataMart, que se carga una vez al día) y se refrescan con los eventos en vivo y cada 60 segundos. Las notificaciones llegan cuando el sistema del OLTP llama al webhook POST /api/webhooks/inscripciones con la cabecera secreta x-amp-webhook-secret: el AMP valida el cuerpo, es idempotente por idFormulario, verifica la inscripción en el OLTP y la guarda sin datos personales; no contacta al lead. En la captura el OLTP no registra actividad del día, por lo que las cifras están en cero y la lista de notificaciones aparece vacía.'
        ],
        figuras: [{ archivo: '06e-buyers-agente-tiempo-real.png', pie: 'Agente: actividades, hoy en tiempo real y notificaciones' }],
        fuente: [{ archivo: 'src/app/buyers/tab-agente.tsx', funciones: ['TabAgente', 'Actividades', 'Realtime'] }, { archivo: 'src/lib/buyer-kpis.ts', funciones: ['actividadHoy', 'diaLima'] }, { archivo: 'src/lib/buyer-webhook.ts', funciones: ['registrarInscripcion', 'ultimasNotificaciones', 'inscripcionSchema', 'secretoValido'] }, { archivo: API, funciones: ['GET buyer/realtime', 'POST webhooks/inscripciones'] }]
      },
      {
        titulo: 'Agente: ejecución en vivo, lanzamiento e historial', ruta: '/buyers/agente',
        parrafos: [
          '«Ejecución en curso» muestra, por cada actividad que esté en cola o ejecutándose, una línea de tiempo con los pasos Cola, Contexto, IA, Reglas, Guardado y Fin (cada paso se marca como hecho, actual o pendiente), el tiempo total y el registro de la ejecución: hora, paso y mensaje (por ejemplo, el contexto reunido, el tiempo de respuesta de la IA, las propuestas corregidas o completadas con plantilla y los borradores guardados). Cuando no hay nada ejecutándose muestra el estado de reposo, como en la figura; la línea de tiempo en vivo no se pudo capturar sin lanzar una ejecución. «Lanzar una ejecución» ofrece un cuadro de indicaciones opcionales (hasta 500 caracteres) y los botones «Generar propuestas de publicaciones (B-1)» y «Analizar video y guion (B-2)», que se deshabilitan mientras esa actividad ya está en curso.',
          'Lanzar equivale a «Ejecutar ahora» de la barra: POST /api/buyer/run crea la ejecución y encola el trabajo BUYER_RUN que procesa el worker. El worker reúne el contexto con consultas deterministas (KPI del periodo y del anterior, desgloses, catálogo vigente y, en B-2, la curva de abandono), llama a la IA configurada, valida su respuesta con las reglas vigentes (elimina o corrige precios, descuentos, becas y promesas de ingreso, exige pilar y llamado a la landing en cada publicación y completa la cobertura mínima con plantillas), y guarda el análisis y las propuestas como borrador en una sola transacción. Sin llave de IA, o si la IA falla, se guardan propuestas de plantilla y se registra el motivo. Las directrices activas de Reglas se añaden a las indicaciones. El trabajo no contacta a nadie y está exento del horario de envíos.',
          '«Ejecuciones recientes» es el historial de las últimas 50: número, actividad, estado (En cola, En proceso, Terminada, Fallida), disparador (Manual, Automático cada semana o Alerta de KPI), proveedor y modelo, fecha, duración y el enlace «Ver sus propuestas (n)», que abre la bandeja filtrada por esa ejecución. Si se usó plantilla porque la IA no estaba disponible, lo advierte con el motivo. El despliegue «Ver registro, análisis y reglas aplicadas» muestra el registro paso a paso, el análisis con el que el agente interpretó los KPI y la instantánea de reglas que se usó en esa ejecución (niveles de semáforo, términos prohibidos, pilares, cobertura y directrices), útil para auditar por qué se generó lo que se generó.'
        ],
        figuras: [
          { archivo: '06f-buyers-agente-ejecucion-vivo.png', pie: 'Agente: ejecución en curso (en reposo) y lanzamiento manual' },
          { archivo: '06g-buyers-agente-historial.png', pie: 'Agente: historial de ejecuciones con el registro desplegado' }
        ],
        fuente: [{ archivo: 'src/app/buyers/tab-agente.tsx', funciones: ['EnCurso', 'LiveRun', 'Log', 'Lanzar', 'Historial', 'Run', 'ReglasAplicadas', 'describirReglas'] }, { archivo: 'src/app/buyers/agent-meta.tsx', funciones: ['PASOS', 'PASO_TEXTO', 'logDe'] }, { archivo: 'src/lib/buyer-agent.ts', funciones: ['solicitudRunSchema', 'requestRun', 'executeRun', 'buildContext', 'procesarSalidaIa', 'validarPropuestas', 'completarCobertura', 'listarEjecuciones'] }, { archivo: 'src/lib/jobs.ts', funciones: ['enqueue', 'processNextJob'] }, { archivo: API, funciones: ['POST buyer/run', 'GET buyer/runs', 'GET buyer/agent'] }]
      },
      {
        titulo: 'Propuestas: bandeja, edición y descarte', ruta: '/buyers/propuestas',
        parrafos: [
          'La bandeja de propuestas está paginada (10, 20 o 50 por página). Arriba hay botones de estado con su conteo (Por revisar, Aprobadas, Descartadas, Todas), un buscador por título, contenido o justificación y los filtros Actividad, Tipo, Público y Canal; un filtro adicional permite ver solo la ejecución elegida desde el historial. La barra de acciones en bloque permite «Seleccionar borradores visibles» (hasta 50), «Agrupar por ejecución», «Aprobar seleccionadas» y «Descartar seleccionadas», y muestra cuántas hay seleccionadas. Cada tarjeta indica estado, tipo, actividad, público, canal, tipo de campaña, el título y una vista previa; se despliega para ver el contenido completo, la justificación, los KPI citados y la evidencia numérica. Los borradores ofrecen Aprobar, «Editar y aprobar», Descartar y Copiar; las ya decididas muestran quién y cuándo las decidió y el motivo.',
          'Aprobar cambia el estado a Aprobada, registra al usuario y un evento BUYER_PROPOSAL_DECISION; no publica nada: el aviso recuerda publicarla manualmente. Las acciones en bloque usan POST /api/buyer/proposals/decide-many y devuelven cuáles se decidieron y cuáles se omitieron (no encontrada, ya decidida o con términos prohibidos vigentes). «Editar y aprobar» abre el campo «Texto final» (hasta 4000 caracteres, precargado) con «Guardar y aprobar» y Cancelar; al guardar se aprueba y el texto se almacena como edición solo si difiere del original, y la tarjeta muestra «Editada». Descartar abre «Motivo del descarte (opcional)», de hasta 300 caracteres, con «Confirmar descarte» y Cancelar. Las figuras 17 y 18 muestran ambos formularios abiertos, sin guardar ni confirmar.',
          'Reglas previas: solo se pueden decidir propuestas en borrador (de lo contrario el servidor responde 409); al aprobar, el texto, original o editado, se revisa contra los términos prohibidos vigentes de la sección Reglas y, si contiene alguno, el servidor lo rechaza (422) o lo omite en bloque. Las propuestas siempre nacen como borrador y la aprobación de una persona es una regla bloqueada que no se puede quitar. Cualquier rol con sesión puede decidir propuestas.'
        ],
        figuras: [
          { archivo: '06h-buyers-propuestas.png', pie: 'Propuestas: filtros, acciones en bloque y bandeja' },
          { archivo: '06i-buyers-editar-propuesta.png', pie: 'Edición de una propuesta con «Editar y aprobar» (sin guardar)' },
          { archivo: '06j-buyers-descartar-propuesta.png', pie: 'Descarte de una propuesta con su motivo (sin confirmar)' }
        ],
        fuente: [{ archivo: 'src/app/buyers/tab-propuestas.tsx', funciones: ['TabPropuestas', 'BulkActions', 'Card', 'seccionesPublicacion'] }, { archivo: 'src/lib/buyer-agent.ts', funciones: ['listarPropuestas', 'filtroPropuestasSchema', 'decisionSchema', 'decidirPropuesta', 'decidirVarias', 'detectarProhibidos', 'propuestaAPlano'] }, { archivo: API, funciones: ['GET buyer/proposals', 'POST buyer/proposal/decide', 'POST buyer/proposals/decide-many'] }]
      },
      {
        titulo: 'Reglas: niveles de semáforo', ruta: '/buyers/reglas',
        parrafos: [
          'La sección Reglas muestra qué decide el agente y con qué criterios, agrupado por categorías. La primera, «Semáforos», tiene una tarjeta por KPI (B-1.1 a B-3.1) con su valor vigente (por ejemplo, «Rojo < 60 % · Verde ≥ 80 %»), su valor de fábrica si fue modificado, el autor y la fecha del último cambio. El botón Editar abre un formulario con el nivel amarillo y el nivel verde (la dirección, «mientras más alto, mejor» o «mientras más bajo, mejor», no se cambia), una barra con las tres zonas y una vista previa del efecto sobre el KPI actual, de modo que se ve en qué color quedaría antes de guardar. La figura muestra el editor de B-1.2 abierto, sin guardar.',
          'Al guardar (POST /api/buyer/rule/save) el servidor valida que los niveles sean coherentes con la dirección del KPI, almacena la regla y registra en la bitácora un evento BUYER_RULE_CHANGE con el valor anterior y el nuevo. Cambiar un semáforo recalcula al instante los estados de todo el panel, sin modificar los valores de los KPI, e invalida la caché de KPI. Los semáforos no se pueden desactivar ni eliminar: solo modificar y restaurar a su valor de fábrica. Regla previa: solo Administración y Alta dirección pueden editar; un operador ve las reglas en modo solo lectura (sin botones de edición).'
        ],
        figuras: [{ archivo: '06l-buyers-reglas-semaforos.png', pie: 'Reglas: semáforos con el editor de B-1.2 abierto (sin guardar)' }],
        fuente: [{ archivo: 'src/app/buyers/tab-reglas.tsx', funciones: ['TabReglas', 'RuleCard', 'Editor'] }, { archivo: 'src/app/buyers/rule-forms.tsx', funciones: ['RuleForm', 'semaforoValido'] }, { archivo: 'src/app/buyers/rule-summary.ts', funciones: ['resumenRegla', 'paramsDe'] }, { archivo: 'src/lib/buyer-rules.ts', funciones: ['listarReglas', 'guardarRegla', 'guardarReglaSchema', 'semaforo', 'reglasVigentes'] }, { archivo: API, funciones: ['GET buyer/rules', 'POST buyer/rule/save'] }]
      },
      {
        titulo: 'Reglas: contenido y cobertura', ruta: '/buyers/reglas',
        parrafos: [
          'La categoría «Contenido» fija qué puede y qué debe decir una propuesta: los Términos prohibidos (lista de términos con etiqueta; de fábrica cubre precios, descuentos, becas y semibecas, promesas de ingreso y resultados inventados), los Pilares del servicio (preparación flexible, ruta de estudio y seguimiento académico, con un mínimo de pilares por publicación), el Llamado a la landing (con su frase de respaldo) y la Evidencia numérica (toda recomendación debe citar cifras del contexto). La categoría «Cobertura» define para qué públicos y canales se generan publicaciones (de fábrica estudiantes postulantes y padres o apoderados en TikTok, Instagram y WhatsApp), la salida por video (variantes de guion y de llamado, recomendaciones y máximo de videos por ejecución) y cuándo recomendar mejoras de atribución (cuando B-1.1 no esté en verde, o solo si está en rojo). La figura siguiente muestra el editor de Términos prohibidos abierto, sin guardar.',
          'Los términos prohibidos se escriben como palabras o frases literales (separadas por coma, punto y coma, barra o salto de línea); se comparan sin distinguir tildes ni mayúsculas y al inicio de palabra, nunca como expresiones regulares. Los términos integrados del sistema activan detectores propios que no se editan. Estas reglas se aplican en la siguiente ejecución del agente (se guarda una instantánea de las reglas usadas en cada ejecución) y también al aprobar una propuesta, cuyo texto se revisa contra los términos vigentes. Las reglas de contenido y de atribución se pueden desactivar con el botón Desactivar; la cobertura de B-1 y de B-2 se puede modificar pero no desactivar. Solo Administración y Alta dirección pueden modificar; cada cambio queda en la bitácora y se puede restaurar el valor de fábrica.'
        ],
        figuras: [
          { archivo: '06m-buyers-reglas-contenido-cobertura.png', pie: 'Reglas: contenido de las propuestas y cobertura' },
          { archivo: '06n-buyers-reglas-editor-prohibidos.png', pie: 'Editor de términos prohibidos (sin guardar)' }
        ],
        fuente: [{ archivo: 'src/app/buyers/tab-reglas.tsx', funciones: ['TabReglas', 'RuleCard', 'Editor', 'alternarActiva'] }, { archivo: 'src/app/buyers/rule-forms.tsx', funciones: ['RuleForm'] }, { archivo: 'src/lib/buyer-rules.ts', funciones: ['guardarRegla', 'listarReglas', 'REGLAS_FABRICA'] }, { archivo: 'src/lib/buyer-agent.ts', funciones: ['detectarProhibidos', 'validarPropuestas', 'exigirPilarYLlamado', 'faltantesCobertura'] }, { archivo: API, funciones: ['GET buyer/rules', 'POST buyer/rule/save'] }]
      },
      {
        titulo: 'Reglas: automatización, alertas y directrices', ruta: '/buyers/reglas',
        parrafos: [
          'La categoría «Automatización» tiene la ejecución semanal de B-1 y de B-2 (día de la semana y hora de Lima; de fábrica lunes 08:00) y el enfriamiento entre ejecuciones lanzadas por alerta (7 días). Solo tienen efecto si la actividad está en modo Automático (cada semana). En «Alertas» cada regla dice «si un KPI cumple una condición, entonces avisar o ejecutar al agente»: de fábrica hay dos («KPI de B-1 en rojo → ejecutar B-1» y «KPI de B-2 en rojo → ejecutar B-2»), que se pueden desactivar, modificar o eliminar. «Nueva alerta» abre un formulario con nombre, KPI (un código o una actividad completa), condición (estado rojo o amarillo, o un operador y un valor), canal opcional y acción (Solo avisar, Ejecutar B-1 o Ejecutar B-2); la figura 23 lo muestra abierto, sin crear. «Directrices» son indicaciones en lenguaje natural (hasta 300 caracteres, aplicables a B-1, a B-2 o a ambas) que la IA debe respetar en sus ejecuciones; no hay ninguna de fábrica.',
          'Las alertas se evalúan en el servidor sobre el periodo por defecto como mucho una vez por hora y generan los avisos de la sección Resumen (uno por regla y día); si la actividad está en Manual, una alerta con acción «ejecutar» solo avisa. Las directrices activas se añaden a la solicitud a la IA como datos delimitados, después de las reglas fijas de seguridad, de modo que nunca pueden anular la prohibición de precios o promesas ni la aprobación humana. Las alertas y directrices creadas por el usuario se pueden crear, modificar, desactivar y eliminar; las reglas de sistema se modifican, se desactivan (si lo permiten) y se restauran. Solo Administración y Alta dirección pueden hacerlo (el servidor responde 403 a otros roles).'
        ],
        figuras: [
          { archivo: '06o-buyers-reglas-automatizacion-alertas.png', pie: 'Reglas: automatización, aprobación, alertas y directrices' },
          { archivo: '06p-buyers-reglas-nueva-alerta.png', pie: 'Formulario «Nueva alerta» (sin crear)' }
        ],
        fuente: [{ archivo: 'src/app/buyers/tab-reglas.tsx', funciones: ['TabReglas', 'Editor'] }, { archivo: 'src/app/buyers/rule-forms.tsx', funciones: ['RuleForm'] }, { archivo: 'src/app/buyers/rule-summary.ts', funciones: ['fraseAlerta', 'resumenRegla'] }, { archivo: 'src/lib/buyer-auto.ts', funciones: ['evaluarAlertas', 'proximaEjecucion', 'scanBuyerAuto'] }, { archivo: 'src/lib/buyer-rules.ts', funciones: ['guardarRegla', 'eliminarRegla', 'reglasVigentes'] }, { archivo: API, funciones: ['POST buyer/rule/save', 'POST buyer/rule/delete'] }]
      },
      {
        titulo: 'Reglas: restaurar, reglas bloqueadas y registro de cambios', ruta: '/buyers/reglas',
        parrafos: [
          'En la cabecera de la sección, el botón «Restaurar todas» devuelve a su valor de fábrica todas las reglas de sistema modificadas (se habilita solo si hay alguna cambiada) y pide confirmación; las alertas y directrices creadas por el usuario no se tocan. Las reglas modificadas llevan la etiqueta «Personalizada», muestran el valor de fábrica y tienen su propio botón Restaurar. Las reglas de la categoría «Medición» (zona horaria de Lima, mitad del video en el 50 %, un visitante por dispositivo, reproducción elegible, misma visita y mismo día, y la fórmula de B-1.2) y la «Aprobación humana» están bloqueadas: se muestran con un candado para que se sepa qué significa cada cifra y qué garantías existen, pero no se pueden cambiar desde el AMP. Las de medición las define el DataMart; la aprobación humana asegura que ninguna propuesta se publique sin la aprobación de una persona.',
          'Restaurar ejecuta POST /api/buyer/rule/restore (una regla o todas) y recalcula de inmediato los semáforos. Cada creación, modificación, eliminación o restauración registra en la bitácora un evento BUYER_RULE_CHANGE con el valor anterior y el nuevo, el autor y la fecha, y la tarjeta de cada regla muestra su último cambio; el historial completo de cambios lo entrega el servidor (GET /api/buyer/rules/history), pero la pantalla actual no lo muestra como una sección aparte. Reglas previas: solo Administración y Alta dirección restauran; las bloqueadas no admiten ningún cambio. Las capturas se tomaron con todas las reglas en su valor de fábrica, por lo que no aparecen botones Restaurar.'
        ],
        figuras: [
          { archivo: '06k-buyers-reglas-cabecera.png', pie: 'Reglas: cabecera con «Restaurar todas»' },
          { archivo: '06q-buyers-reglas-bloqueadas.png', pie: 'Reglas de medición bloqueadas' },
          { archivo: '06r-buyers-reglas-aprobacion.png', pie: 'Regla bloqueada de aprobación humana' }
        ],
        fuente: [{ archivo: 'src/app/buyers/tab-reglas.tsx', funciones: ['TabReglas', 'RuleCard', 'ejecutar (restaurar)'] }, { archivo: 'src/lib/buyer-rules.ts', funciones: ['restaurarRegla', 'restaurarReglaSchema', 'historialReglas', 'REGLAS_FABRICA'] }, { archivo: API, funciones: ['POST buyer/rule/restore', 'GET buyer/rules/history'] }]
      },
      {
        titulo: 'Perfiles: listado de buyers capturados', ruta: '/buyers/perfiles',
        parrafos: [
          'El botón destacado «Perfiles» (con el total de capturados) abre el listado de los buyers que fueron atrapados por el formulario, es decir, quienes enviaron el formulario de contacto de la landing. Muestra un aviso de privacidad, tarjetas de conteo por estado (Todos, Válido, Duplicado, Inválido, En revisión) que filtran al pulsarlas, un buscador (nombre, correo o teléfono; se envía desde 3 caracteres), filtros de Rol, Canal, Campaña, Desde y Hasta, el botón Restablecer y una tabla paginada de 25 filas con nombre, rol, estado, canal, campaña, avance del video y fecha de envío. Correo y teléfono se muestran enmascarados en el listado. La figura recorta las primeras filas; los datos pertenecen a un generador de datos sintéticos del OLTP.',
          'Los perfiles se leen directamente del OLTP con consultas de solo lectura (GET /api/buyer/profiles), ordenadas por fecha de envío descendente y con paginación y límites para cuidar la memoria del servidor; el AMP no copia datos personales a su base. Los conteos por estado ignoran el filtro de estado y el total lo respeta. Todo rol con sesión puede ver los perfiles. Los filtros se conservan en la dirección de la página, por lo que una vista se puede compartir.'
        ],
        figuras: [{ archivo: '06s-buyers-perfiles-listado.png', pie: 'Perfiles: tarjetas por estado, filtros y listado enmascarado' }],
        fuente: [{ archivo: 'src/app/buyers/tab-perfiles.tsx', funciones: ['TabPerfiles'] }, { archivo: 'src/app/buyers/perfil-detalle.tsx', funciones: ['EstadoForm', 'Avance', 'rolTexto', 'campanaTexto'] }, { archivo: 'src/lib/buyer-profiles.ts', funciones: ['listarPerfiles', 'perfilesQuerySchema', 'enmascararCorreo', 'enmascararTelefono'] }, { archivo: API, funciones: ['GET buyer/profiles'] }]
      },
      {
        titulo: 'Perfiles: detalle del buyer', ruta: '/buyers/perfiles?formulario={id}',
        parrafos: [
          'Al elegir una fila (o desde «Ver perfil» en las notificaciones) se abre un cajón lateral con el detalle del formulario, cuya dirección se puede compartir (?formulario=ID). Muestra el estado y el rol, los datos de contacto completos con botones Copiar (nombre, correo, teléfono, fecha de registro y de envío), «Cómo llegó» (canal, campaña, visita y dispositivo), el video (versión, duración, avance con barra, si llegó al final, si pasó la mitad, si fue el mismo día y si es elegible según la definición de B-2.3), una línea de tiempo (visita, video y formulario), otros formularios de la misma persona o dispositivo, que enlazan entre sí, y otras visitas del mismo dispositivo. Un formulario inválido o en revisión no tiene persona asociada: se muestran los datos tal como se escribieron. En pantallas pequeñas el cajón ocupa todo el ancho. La captura muestra un caso ficticio del generador de datos.',
          'El detalle se consulta al OLTP (GET /api/buyer/profile) y no se guarda en el AMP; en cambio, cada apertura deja en la bitácora un evento BUYER_PROFILE_VIEW con el usuario y el número de formulario, sin datos personales, de modo que el acceso a datos completos queda auditado. El aviso al pie del cajón lo recuerda («Datos leídos del OLTP; el AMP no los guarda. Cada consulta de detalle queda registrada»). Todo rol con sesión puede abrirlo. Si el formulario no existe, el servidor responde 404 y el cajón lo informa.'
        ],
        figuras: [{ archivo: '06t-buyers-perfiles-detalle.png', pie: 'Perfiles: cajón de detalle de un buyer capturado (caso ficticio)' }],
        fuente: [{ archivo: 'src/app/buyers/perfil-detalle.tsx', funciones: ['PerfilDetalle', 'Avance', 'EstadoForm'] }, { archivo: 'src/lib/buyer-profiles.ts', funciones: ['perfilDetalle', 'perfilQuerySchema'] }, { archivo: 'src/lib/contacts.ts', funciones: ['event (BUYER_PROFILE_VIEW)'] }, { archivo: API, funciones: ['GET buyer/profile'] }]
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
