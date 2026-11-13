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
