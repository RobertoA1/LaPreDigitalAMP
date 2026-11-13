# Buyers v2: reglas de negocio variables, modo del agente y reorganización de la página

Complementa `agente-buyer-lead.md`. Es el contrato entre el subagente de backend y el de interfaz.

## 1. Qué es una regla de negocio

Una regla es toda decisión de negocio que hoy está fija en el código y que la academia podría querer cambiar sin programar. Las de medición que calcula el DataMart no se pueden cambiar desde el AMP: se muestran, bloqueadas, para que el usuario sepa que existen.

| Categoría | Regla (código) | Parámetros | Valor inicial | Editable |
|---|---|---|---|---|
| SEMAFORO | Niveles de cada KPI: `SEM_B-1.1`, `SEM_B-1.2`, `SEM_B-2.1`, `SEM_B-2.2`, `SEM_B-2.3`, `SEM_B-3.1` | `direction`, `yellow`, `green` | los del documento (60/80 %, S/ 15/8, 30/60 %, 50/75 %, 5/12 %, 3/8 %) | Sí (niveles); no se elimina, se restaura |
| MEDICION | `MED_ZONA_HORARIA` (Lima, UTC−5), `MED_MITAD_VIDEO` (50 %), `MED_UN_VISITANTE_POR_DISPOSITIVO`, `MED_ELEGIBLE` (dispositivo sin formulario previo y contacto no registrado), `MED_MISMA_VISITA_MISMO_DIA` (B-2.3), `MED_B12_FORMULA` (costo del periodo / leads nuevos de campañas pagadas del periodo) | texto descriptivo | — | No (bloqueada: la define el DataMart) |
| CONTENIDO | `CON_PROHIBIDOS`: términos que una propuesta no puede contener | lista de `{ etiqueta, patron }` | precios, descuentos, becas/semibecas, promesas de ingreso (los actuales de `detectarProhibidos`) | Sí: añadir, quitar, modificar términos |
| CONTENIDO | `CON_PILARES`: pilares que debe destacar una publicación | lista de `{ nombre, palabrasClave[] }`, `minimo` | preparación flexible, ruta de estudio, seguimiento académico; mínimo 1 | Sí |
| CONTENIDO | `CON_LLAMADO_LANDING`: toda publicación lleva llamado a la landing | `fraseDeRespaldo` | activa | Sí (activar/desactivar, frase) |
| CONTENIDO | `CON_EVIDENCIA`: toda recomendación cita cifras del contexto | — | activa | Sí (activar/desactivar) |
| COBERTURA | `COB_B1`: públicos y canales para los que se generan publicaciones | `publicos[]`, `canales[]` | POSTULANTE, APODERADO × TIKTOK, INSTAGRAM, WHATSAPP | Sí |
| COBERTURA | `COB_B2`: salida por video | `guiones`, `llamados`, `recomendaciones[]`, `maxVideos` | 2, 3, DURACION+ORDEN_BENEFICIOS+MENSAJE_FINAL, 6 | Sí |
| COBERTURA | `COB_ATRIBUCION`: recomendar mejoras de atribución cuando B-1.1 no alcanza un nivel | `cuando`: `ROJO` o `NO_VERDE` | NO_VERDE | Sí |
| AUTOMATIZACION | `AUT_SEMANAL_B1`, `AUT_SEMANAL_B2`: ejecución programada | `diaSemana` (1–7), `hora` (0–23, Lima) | lunes 08:00 | Sí |
| AUTOMATIZACION | `AUT_ENFRIAMIENTO`: días mínimos entre ejecuciones automáticas de una misma actividad por alerta | `dias` | 7 | Sí |
| APROBACION | `APR_HUMANA`: ninguna propuesta se publica sin aprobación de una persona | — | activa | No (bloqueada) |
| ALERTA (personalizadas) | Creadas por el usuario: «si un KPI cumple una condición, entonces…» | `kpi`, `operador` (`<`,`<=`,`>`,`>=`) o `estado` (`ROJO`,`AMARILLO`), `valor`, `canal?`, `accion` (`AVISAR` \| `EJECUTAR_B1` \| `EJECUTAR_B2`) | Dos de fábrica, eliminables: «KPI de B-1 en rojo → ejecutar B1» y «KPI de B-2 en rojo → ejecutar B2» | Sí: crear, modificar, desactivar, eliminar |
| DIRECTRIZ (personalizadas) | Creadas por el usuario: indicación en lenguaje natural que la IA debe respetar | `texto` (≤300), `aplicaA` (`B1` \| `B2` \| `AMBAS`) | ninguna | Sí: crear, modificar, desactivar, eliminar |

Reglas del modelo:
- Tabla `amp_buyer_rules`: `id`, `code` (único), `category`, `name`, `description`, `params` (JSON), `enabled`, `origin` (`SISTEMA` \| `USUARIO`), `locked` (bool), `updatedBy`, `updatedAt`, `createdAt`. Migración `010_buyer_rules` que crea la tabla y siembra las reglas de sistema (idempotente).
- Las reglas `SISTEMA` no se eliminan: se modifican, se desactivan (salvo SEMAFORO y las bloqueadas) y se **restauran** a su valor de fábrica. Las `USUARIO` (ALERTA y DIRECTRIZ) se crean y eliminan libremente. Las `locked` no admiten ningún cambio.
- Validación estricta con zod por categoría (p. ej. semáforo: `yellow` y `green` coherentes con `direction`; patrones prohibidos: texto literal o lista de palabras, nunca expresiones regulares arbitrarias del usuario — se escapan y se comparan sin tildes ni mayúsculas; límites de tamaño).
- Solo `ADMIN` y `DIRECCION` crean, modifican, eliminan o restauran; `OPERADOR` las ve. Cada cambio deja `amp_events` (`BUYER_RULE_CHANGE`) con el valor anterior y el nuevo.
- El código deja de usar constantes fijas: `semaforo`, los validadores, la cobertura, las plantillas, los prompts y la programación leen las reglas vigentes (caché en memoria de pocos segundos, invalidada al escribir). Las DIRECTRIZ activas se añaden al prompt como datos delimitados, nunca como instrucciones de sistema, y después de las reglas fijas de seguridad. Cada ejecución guarda en su `context` la instantánea de reglas usada (`reglas`), para auditoría.
- Cambiar un semáforo recalcula al instante los estados (los valores del KPI no cambian) e invalida la caché de KPI.

## 2. Modo del agente: automático o manual

Ajuste `amp_settings.buyer_agent` = `{ B1: 'AUTOMATICO'|'MANUAL', B2: 'AUTOMATICO'|'MANUAL' }` (por defecto MANUAL en ambas).

- **MANUAL:** el agente solo se ejecuta cuando una persona pulsa el botón. Las reglas de AUTOMATIZACION y las ALERTA con acción `EJECUTAR_*` no lanzan nada; las ALERTA siguen generando avisos visibles.
- **AUTOMATICO:** además, el worker lanza la ejecución semanal (`AUT_SEMANAL_*`) y las ALERTA con acción `EJECUTAR_*`, respetando `AUT_ENFRIAMIENTO`. Las propuestas siguen naciendo como borrador (`APR_HUMANA`).
- Cambiar el modo: `ADMIN` y `DIRECCION`; queda en `amp_events` (`BUYER_AGENT_MODE`).

Visibilidad del funcionamiento (lo que el usuario debe poder ver sin buscar):
- Latido del worker: el worker escribe `amp_settings.worker_heartbeat` cada ≤15 s. Sin latido en 45 s el agente figura «Detenido: el worker no está en ejecución» y los botones de ejecutar lo advierten.
- Estado por actividad: `EN_REPOSO`, `EN_COLA`, `EJECUTANDO`, `ERROR` (última ejecución fallida), con modo, última ejecución (cuándo, disparador, proveedor, n.º de propuestas) y **próxima ejecución automática** calculada (o «—» en manual).
- Progreso de la ejecución en curso: `amp_buyer_runs` gana `step` (`COLA` → `CONTEXTO` → `IA` → `REGLAS` → `GUARDADO` → `FIN`), `stepStartedAt` y `log` (JSON: lista de `{ at, step, message }`, p. ej. «Contexto reunido: 6 KPI, 4 videos», «IA respondió en 27 s», «Reglas: 2 propuestas corregidas, 1 completada con plantilla», «7 borradores guardados»). Migración `011_buyer_run_progress`.
- Avisos de reglas ALERTA: tabla `amp_buyer_alerts` (`id`, `ruleId`, `kpi`, `value`, `status`, `message`, `action`, `runId?`, `createdAt`, `acknowledgedBy?`, `acknowledgedAt?`), deduplicados por regla y día.

## 3. API nueva (bajo `/api/`, con sesión)

| Ruta | Respuesta / efecto |
|---|---|
| `GET buyer/agent` | `{ worker:{ alive, lastBeatAt }, mode:{B1,B2}, canChangeMode, activities:[{ activity, mode, state, currentRun?:{ id, step, stepStartedAt, startedAt, log[] }, lastRun?:{ id, status, trigger, provider, model, finishedAt, proposals, error }, nextRunAt, nextRunReason }], alerts:[abiertas] , pendingProposals }` |
| `POST buyer/agent/mode` `{ activity:'B1'|'B2', mode }` | cambia el modo |
| `POST buyer/alert/ack` `{ id }` | marca un aviso como visto |
| `GET buyer/rules` | `{ canEdit, categories:[{ category, label, description }], rules:[{ id, code, category, name, description, params, enabled, origin, locked, isDefault, defaultParams, updatedBy, updatedAt }] }` |
| `POST buyer/rule/save` `{ id?, category, name?, description?, params, enabled }` | crea (solo ALERTA/DIRECTRIZ) o modifica; devuelve `{ rule }`; 422 con `{ error, issues[] }` si no valida |
| `POST buyer/rule/delete` `{ id }` | elimina una regla `USUARIO` |
| `POST buyer/rule/restore` `{ id }` o `{ all:true }` | restaura reglas `SISTEMA` |
| `GET buyer/proposals` | añade `page`, `pageSize` (≤50), `kind`, `q` (texto) y devuelve `{ proposals, total, counts:{ DRAFT, APPROVED, DISCARDED } }` |
| `POST buyer/proposals/decide-many` `{ ids[≤50], decision, reason? }` | decide varias en bloque |
| `GET buyer/runs` | cada ejecución incluye `step`, `log` y `proposals` (conteo) |

`GET buyer/kpis` conserva su forma; `thresholds` y `status` salen de las reglas vigentes. `GET live` incluye también `amp_buyer_rules`, `amp_buyer_alerts` y los cambios de `step`.

## 4. Organización de la página Buyers

Pestañas con URL propia (`/buyers`, `/buyers/analisis`, `/buyers/agente`, `/buyers/propuestas`, `/buyers/reglas`), barra del agente siempre visible arriba y filtros que se conservan al cambiar de pestaña.

1. **Barra del agente (siempre visible):** estado del worker, y por actividad (B-1, B-2): interruptor Automático/Manual, estado con color e icono (y animación mientras ejecuta, con el paso actual), próxima ejecución, y botón «Ejecutar ahora». Contador de propuestas por revisar y de avisos, que llevan a su pestaña.
2. **Resumen:** filtros, los seis KPI agrupados por actividad con comparación frente al periodo anterior, avisos abiertos, «Hoy en tiempo real» y notificaciones de inscripciones.
3. **Análisis:** tendencia, desgloses por canal/campaña/video (ordenables, con búsqueda en campañas) y curva de abandono.
4. **Agente:** línea de tiempo en vivo de la ejecución en curso (pasos y registro), indicaciones opcionales, historial de ejecuciones con su registro y análisis, y enlace a las propuestas de cada ejecución.
5. **Propuestas:** bandeja paginada, agrupable por ejecución, con filtros (actividad, tipo, público, canal, estado), búsqueda, selección múltiple y acciones en bloque, además de aprobar, editar y descartar individualmente.
6. **Reglas:** reglas por categoría con su valor vigente y el de fábrica; edición con formularios específicos (niveles de semáforo con vista previa del efecto sobre el KPI actual; listas de términos; cobertura; programación), reglas bloqueadas explicadas, alta/edición/baja de ALERTA y DIRECTRIZ, restaurar, e historial de cambios.

## 5. Perfiles de los buyers capturados por el formulario (botón «Perfiles»)

Petición del usuario: poder ver los perfiles de los buyers, entendiendo por tales los **atrapados por el formulario** (quienes enviaron `mkt.FormularioContacto`). Un botón extra «Perfiles» junto a las pestañas (`/buyers/perfiles`) abre un listado y, al elegir una fila, un panel de detalle (cajón lateral con enlace directo `/buyers/perfiles?formulario=ID`).

Principios:
- **Lectura directa del OLTP, solo SELECT.** El AMP no copia datos personales a `LaPreDigitalAMP` (las tablas `amp_buyer_notifications` siguen sin datos personales). Nada se escribe en el OLTP.
- En el listado, correo y teléfono van enmascarados (`j***@dominio.com`, `*****123`); el detalle los muestra completos. Todo rol con sesión puede verlos (ya manejan contactos en otras etapas), pero cada apertura de un detalle deja `amp_events` tipo `BUYER_PROFILE_VIEW` con usuario y `idFormulario`, **sin** datos personales.
- Consultas baratas (esta instancia de SQL Server tiene poca memoria): `OPTION (MAXDOP 1)`, paginación por `TOP`/`OFFSET` con orden por `FechaHoraEnvio DESC, IdFormulario DESC`, búsqueda de texto solo con ≥3 caracteres, `pageSize` ≤ 50, caché de 30 s del conteo, tiempo máximo de `queryExternal`.

API (con sesión):
| Ruta | Respuesta |
|---|---|
| `GET buyer/profiles?page&pageSize&q&estado&canal&campana&rol&from&to` | `{ total, page, pageSize, counts:{ VALIDO, DUPLICADO, INVALIDO, REVISION }, profiles:[{ idFormulario, idPersona\|null, nombre, correo (enmascarado), telefono (enmascarado), rol, estado, enviadoEn (ISO), canal, campana:{ id, nombre, tipo }\|null, video:{ id, nombre }\|null, avancePct:number\|null, esLead:boolean }] }`. `q` busca por nombre, correo o teléfono. `esLead` = estado VALIDO o DUPLICADO con persona. Filtros `from`/`to` en fecha de Lima; por defecto, sin límite de fechas pero ordenado por más reciente. |
| `GET buyer/profile?formulario=ID` | `{ persona:{ id, nombre, correo, telefono, rol, registradaEn }\|null, formulario:{ id, estado, enviadoEn, nombre, correo, telefono, rol }, visita:{ id, inicio, canal, campana, dispositivo (código corto) }, reproduccion:{ video, version, duracionSeg, segundoMaximo, avancePct, llegoAlFinal, alcanzoMitad, mismoDia:boolean, elegible:boolean, puntos:[{ segundo, registradoEn }] }\|null, otrosFormularios:[{ id, estado, enviadoEn }] (misma persona o mismo dispositivo), otrasVisitas:[{ id, inicio, canal, campana }] (mismo dispositivo, máx. 20), lineaDeTiempo:[{ at, tipo:'VISITA'\|'VIDEO'\|'FORMULARIO', texto }] }`. 404 si no existe. Un formulario INVALIDO o REVISION no tiene `persona`: se muestran los datos tal como se escribieron. |

Interfaz (pestaña «Perfiles», botón destacado a la derecha de las pestañas, con el total de capturados): tarjetas de conteo por estado que filtran al pulsarlas; búsqueda; filtros de estado, canal, campaña, rol y fechas (heredan los filtros globales); tabla paginada (nombre, rol, estado con color e icono, canal, campaña, avance del video, fecha) con fila clicable y teclado; cajón de detalle con datos de contacto (botones copiar), resumen de la captura (canal, campaña, video y qué tan lejos llegó), línea de tiempo, otros formularios y visitas del mismo dispositivo; y un aviso de privacidad («Datos leídos del OLTP; el AMP no los guarda. Cada consulta de detalle queda registrada»). En la pestaña Resumen, cada notificación de inscripción en vivo incluye «Ver perfil». Estados de carga, vacío y error; usable a 390 px (el cajón ocupa toda la pantalla).

## 6. Precisiones de la implementación del backend (valen sobre lo anterior si difieren)

Reglas y modo
- Migraciones: `010_buyer_rules` (tablas `amp_buyer_rules` y `amp_buyer_alerts`, siembra idempotente de 25 reglas de sistema), `011_buyer_run_progress` (`step`, `stepStartedAt`, `log` y `updatedAt` en `amp_buyer_runs`) y `012_settings_created_at_default` (añade un valor por defecto a `amp_settings.createdAt`, que en bases antiguas era NOT NULL sin valor y hacía fallar todo INSERT de un ajuste).
- `COB_B1` y `COB_B2` no se pueden desactivar (422), igual que los semáforos. `AUT_SEMANAL_*`, `CON_*` y `COB_ATRIBUCION` sí. Las ALERTA de fábrica son `origin: SISTEMA` pero se pueden eliminar; `restore { all:true }` las vuelve a crear.
- Alertas: `kpi` es un código (`B-2.1`…) o una actividad (`B1`/`B2`: cualquier KPI de ella). Con `estado`, `AMARILLO` significa amarillo **o peor**. `operador`+`valor` exige un KPI concreto. `canal` evalúa el desglose por canal. Un aviso por regla y día (`dayKey`, índice único). Se evalúan sobre el periodo por defecto como mucho una vez por hora y de nuevo si cambian las reglas o el modo.
- `amp_settings.buyer_agent` guarda además `desde:{B1,B2}` (cuándo se activó el modo automático): si se activa después de la hora semanal de hoy, no se lanza de inmediato.
- Términos prohibidos: `patron` es una lista de palabras o frases literales separadas por `|`, coma, `;` o salto de línea; coincide al inicio de palabra, sin tildes ni mayúsculas. `integrado` (PRECIO, DESCUENTO, BECA, PROMESA_INGRESO, RESULTADO_INVENTADO) activa los detectores del sistema (no editables).
- Aprobar una propuesta (individual o en bloque) revisa el texto contra los términos prohibidos VIGENTES (422 individual; `skipped` con `PROHIBIDO` en bloque).
- La caché de KPI guarda sumas, no estados: `status` y `thresholds` se calculan en cada respuesta con las reglas vigentes, así que cambiar o restaurar un semáforo se ve al instante.

Respuestas
- `GET buyer/rules` añade `history` (últimos 30 cambios) y, en cada regla, `updatedByName`. `buyer/rule/save` → `{ rule }`; `delete` → `{ ok, id, code }`; `restore {id}` → `{ rule, restored }`; `restore {all:true}` → `{ restored, rules }`.
- `GET buyer/agent` añade `now`, `schedule:{enabled,diaSemana,hora}` por actividad, `currentRun.status/trigger/createdAt` y, en cada aviso, `ruleName`. `buyer/alert/ack` → `{ alert }` (idempotente).
- `GET buyer/proposals`: sin `page` ni `pageSize` conserva el comportamiento anterior (hasta 300); con paginación el tamaño por defecto es 25 y el máximo 50. `counts` ignora el filtro `status`.
- `POST buyer/proposals/decide-many` → 200 `{ decided:[ids], skipped:[{id, reason:'NO_ENCONTRADA'|'YA_DECIDIDA'|'PROHIBIDO', detail?}], total }`.
- `GET live` refleja reglas (cantidad y última modificación), avisos (vistos) y ejecuciones (`updatedAt`) en la misma consulta por tick; `BUYER_PROFILE_VIEW` ya queda reflejado a través de `amp_events`, sin coste extra.

Perfiles (§5)
- `buyer/profiles`: `rol` es el código (`ESTUDIANTE`, `PADRE`, `MADRE`, `APODERADO`), `canal` el código del canal, `campana.tipo` `ORGANICA`/`PAGADA`, `avancePct` con un decimal. `counts` ignora el filtro `estado`; `total` lo respeta. `q` exige ≥ 3 caracteres (400 si no); busca por nombre y correo, y por teléfono si trae ≥ 3 dígitos.
- `buyer/profile`: `visita.canal` es el código del canal y `visita.campana` / `otrasVisitas[].campana` tienen la forma `{ id, nombre, tipo }|null`; `visita.dispositivo` son los 8 primeros caracteres del código; `reproduccion` añade `videoId` y se calcula con la primera reproducción de la visita (misma regla del DataMart); `alcanzoMitad` = avance máximo ≥ 50 %; `mismoDia` = formulario VALIDO/DUPLICADO enviado el mismo día de Lima que la visita; `elegible` = misma definición de B-2.3 (sin formulario DUPLICADO/REVISION en la visita ni formulario previo VALIDO/DUPLICADO del dispositivo). Las fechas son ISO en UTC (`…Z`). 400 si `formulario` no es un entero positivo; 404 si no existe.

Historial de cambios de reglas
- `GET buyer/rules/history?ruleId&limit` (`limit` 1–50, por defecto 50; `ruleId` opcional) → `{ history:[{ id, at (ISO), actorId, actorName|null, summary, ruleId, code, category, action:'CREATE'|'UPDATE'|'DELETE'|'RESTORE', before:{name,description,params,enabled}|null, after:{…}|null, detail }] }`, más reciente primero, de `amp_events` tipo `BUYER_RULE_CHANGE`. 400 si `limit` > 50. `GET buyer/rules` sigue trayendo `history` (los 30 últimos) como atajo.

Aclaraciones del contrato de parámetros
- `CON_PROHIBIDOS.params.terminos[]` es `{ etiqueta, patron, integrado?, soloPublicable? }`. `integrado` NO es booleano: es la clave del detector del sistema (`PRECIO`, `DESCUENTO`, `BECA`, `PROMESA_INGRESO`, `RESULTADO_INVENTADO`). Un término con `integrado` puede traer `patron: ''` (el detector integrado hace el trabajo; si además trae palabras en `patron`, se suman). Un término sin `integrado` exige al menos una palabra o frase en `patron`.
- Las alertas admiten `kpi: 'B1' | 'B2'` (cualquier KPI de esa actividad) solo con `estado`; con `operador` y `valor` el `kpi` debe ser un código concreto.
- Los textos de las reglas de sistema hablan de «nivel amarillo» y «nivel verde»; los nombres de campo de `params` (`direction`, `yellow`, `green`) son técnicos y se mantienen.
- `POST buyer/agent/mode` ya no puede responder 200 sin haber guardado: si no se puede escribir `amp_settings` responde 500 con el mensaje. La causa de los fallos silenciosos era `amp_settings.createdAt` NOT NULL sin valor por defecto (columna heredada del defecto antiguo de `clonar()`); la migración `012` añade el DEFAULT.
