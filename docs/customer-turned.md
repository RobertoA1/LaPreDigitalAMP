# CUSTOMER y TURNED

## Propósito y arquitectura real

| Requisito | Implementación encontrada | Evidencia en código | Brecha corregida |
|---|---|---|---|
| Agentes propios de CUSTOMER y TURNED | Ciclo lifecycle preparado por worker, ejecución manual y pantalla de perfil | `src/lib/lifecycle.ts`, `src/lib/jobs.ts`, `src/app/lifecycle-panel.tsx` | Se renombraron funcionalmente a Fidelización y Acompañamiento y Reactivación y Postventa; TURNED dejó de documentarse como simple propuesta |
| Datos de entrada | `dm_contacts`, `dm_academic_weekly`, mensajes y eventos AMP | `lifecycleContext()` y `lifecycleAssessment()` | Se registra fecha de consulta, actualización del datamart, evento activador y evidencia |
| IA | Proveedor configurable OpenAI/Gemini/Grok/Anthropic; fallback determinista | `src/lib/ai.ts`, `prepareLifecycle()` | La IA solo elige una redacción entre opciones verificadas; no decide pagos, etapas, riesgo ni rutas |
| Actividad | Última actividad, actividades programadas/completadas, simulacros y comparación semanal | `activityAssessment()` y resumen de lifecycle | Se activa a los cinco días solo con fecha válida; ausencia de fecha queda en `NO_DATA` |
| Académico | Reportes semanales; comparabilidad opcional por `assessmentId`, `assessmentType` o `equivalentGroup` | `academicAssessment()` | Variación explícita: `(actual - anterior) / abs(anterior) * 100`; sin equivalencia no se afirma mejora ni descenso porcentual |
| Riesgo | Señales de inactividad, cumplimiento, dificultad, incidencia, insatisfacción y cancelación | `lifecycleRisk()` | Bajo/medio/alto; dos señales producen alto y cancelación explícita produce alto por sí sola, con estado y fecha |
| Intervención | Insight revisable y envío solo por operador; rutas/pagos no tienen conector | `amp_insights`, `sendInsight()`, `sendMessage()` | Estados `PROPUESTA`, `PENDIENTE`, `EJECUTADA`, `FALLIDA` o `DERIVADA`; se registra el resultado |
| Apoderado | Permisos y direcciones separados | `messagePermission()`, `LifecyclePanel` | Reportes de avance al apoderado solo se habilitan para `Meta UNT Plus`, con autorización y dirección |
| TURNED | Transición anterior, motivo declarado, ventana de contacto y admisión | `lifecycleAssessment()`, `recoveryWindow()` | Motivo desconocido se conserva como desconocido; no se transforma una hipótesis en hecho |
| Reactivación | La baja no se borra; el datamart confirma `TURNED → PAYER` | `syncStage()` | Se registra un nuevo ciclo y la atribución solo se mide dentro de 30 días de un contacto ejecutado; el retorno espontáneo no se atribuye al agente |
| Renovación | Jobs a 7, 3 y 1 días con relectura del datamart | `scanSchedules()`, `processNextJob()` | Trabajos pendientes se marcan `CANCELLED` si cambia vencimiento, etapa o estado de pago; CUSTOMER prioriza responsable económico autorizado |
| Duplicados | `dedupeKey` en jobs e insights y claim de triaje | `prepareLifecycle()`, `enqueue()`, `processInbound()` | Un contacto saliente pendiente impide generar otro contacto lifecycle |

## Ciclo operativo

Cada ejecución sigue: **consultar contexto → analizar evidencia → seleccionar acción → ejecutar o derivar → registrar → comprobar resultado**.

El evento `LIFECYCLE_REVIEW` guarda usuario/ciclo implícito, etapa, activador, fecha de consulta, fecha de datos, evidencias, riesgo, acción, resultado y límites. El envío humano se registra como `LIFECYCLE_CONTACT` o `LIFECYCLE_ACTION`; un fallo se registra como `FALLIDA`. Crear un borrador nunca cuenta como envío.

CUSTOMER reconoce actividades completadas, muestra cambios entre semanas y genera una actividad breve después de cinco días sin actividad. Un descenso de 10 % o dos evaluaciones equivalentes consecutivas sin mejora activa refuerzo. Ruta UNT recibe una revisión puntual pendiente; Meta UNT y Meta UNT Plus generan una propuesta pendiente para el componente académico existente. No se modifica una ruta desde AMP.

TURNED reconstruye si el origen fue PAYER o CUSTOMER solo desde `STAGE_CHANGE`, conserva historial, clasifica únicamente el motivo declarado y pregunta cuando es desconocido. Precio no produce descuentos automáticos. Problemas técnicos, insatisfacción, reclamos, cancelaciones y valoraciones individuales de 0 a 6 requieren revisión humana. Ingreso confirmado cierra el seguimiento. La contratación y el pago siempre dependen de la plataforma académica.

La ventana de **contacto** es de 30 días desde la baja válida. La ventana de **atribución de reactivación** es independiente: 30 días desde el primer contacto ejecutado por el agente. Un pago histórico no se reemplaza; `TURNED → PAYER` inicia un ciclo nuevo y solo el datamart confirma el pago.

## Catálogo y límites

`src/lib/catalog.ts` contiene únicamente prestaciones: Explora UNT (14 días), Ruta UNT (revisiones puntuales), Meta UNT (personalización adaptativa y simulacros) y Meta UNT Plus (reportes al apoderado autorizado, alertas avanzadas y atención prioritaria). No contiene precios ni inventa condiciones. Un plan desconocido genera revisión pendiente.

El AMP consume el datamart, no confirma pagos, no cambia planes o rutas, no resuelve tickets por generar una respuesta y no calcula NPS agregado sin encuesta estructurada. Los precios y alternativas económicas deben venir del catálogo operativo y cualquier descuento especial requiere intervención humana.

## Métricas

Las definiciones ejecutables están en `lifecycleMetricDefinitions()`:

- CUSTOMER: actividad semanal, revisiones académicas ejecutadas, progreso medido solo con pares equivalentes, riesgo actualizado, recuperación de actividad, incidencias resueltas con `INCIDENT_RESOLVED`, renovación confirmada, satisfacción individual y abandono `CUSTOMER → TURNED`.
- TURNED: motivos conocidos sobre bajas con `TURNED_REASON`, contactos ejecutados dentro de 30 días y reactivaciones atribuidas solo si `TURNED → PAYER` ocurre dentro de 30 días del contacto ejecutado.

Una recomendación, un borrador, un pago espontáneo o una respuesta generada no cuentan como acción ejecutada ni recuperación atribuida.

## Escenarios verificados

`tests/customer-turned-scenarios.test.ts` cubre los diez escenarios solicitados con datos sintéticos. `tests/lifecycle.test.ts` además verifica modo Demo aislado, pausa, revisión humana, límite del Radar, deduplicación y envío simulado. Las pruebas no usan red ni la base Demo persistente.
