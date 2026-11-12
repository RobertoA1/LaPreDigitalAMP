# Contrato de datamart y migraciones

Los SQL suministrados describen un **OLTP** (`oltp.*`) y reportes derivados (`rpt.*`), pero no un datamart físico independiente. La instrucción vigente es que la plataforma académica y el DBMS hagan la transferencia manual. Por ello las migraciones `001`–`007` definen el **destino analítico que consume el AMP**, junto con su almacenamiento operativo; no replican ni modifican el OLTP externo.

| Tabla del AMP | Grano | Fuentes propuestas en la base adjunta |
|---|---|---|
| `dm_contacts` | Una persona y etapa vigente | `oltp.Persona`, `Buyer`, `Lead`, `Payer`, `Customer`, `Turned`, `HistorialEtapa`, `PerfilPersona`, `ContactoPreferido`, `Suscripcion`, `VersionPlan`, `AccesoServicio` |
| `dm_funnel_daily` | Una cohorte/snapshot diario | `rpt.fn_Captacion`, `rpt.fn_Conversion`, reportes de leads y `rpt.sp_Resumen_CICLO` |
| `dm_academic_weekly` | Una persona y semana | `oltp.ActividadAcademica`, `ActividadProgramada`, `EvaluacionAcademica`, `ReporteProgreso` |

`sourceKey` debe ser estable y único. El campo `stage` admite `LEAD`, `PAYER`, `CUSTOMER` o `TURNED` (`BUYER` se conserva en el esquema por compatibilidad, pero un BUYER es un visitante anónimo de la landing y no se gestiona como contacto: ver [agente-buyer-lead.md](agente-buyer-lead.md)). `interestChannel` es el MCE y puede cambiarse desde la UI sin modificar el valor original en el datamart; `sourceChannel` conserva el canal de adquisición. `renewalAt` y `paymentStatus` provienen de la plataforma académica. Tras una renovación, el DBMS debe actualizar `renewalAt` al próximo vencimiento y `paymentStatus` a `RENEWED`; una cancelación se marca `CANCELLED`. El worker vuelve a leer ambos antes de notificar, por lo que una renovación pagada o cancelada detiene los avisos anteriores. `admissionStatus=ADMITTED` o una confirmación a partir del TXT detiene acciones de recuperación de `TURNED`.

El snapshot `dm_funnel_daily` contiene contadores acumulados de la cohorte: `universe`, `buyers`, `leads`, `payers`, `customers`, `turned`, `reactivated` e `revenue`. Los contadores del panel «Contactos por etapa» se calculan separadamente desde la etapa vigente de `dm_contacts`. No se mezclan esos dos granos.

El perfil académico semanal contiene `activitiesCompleted`, `activitiesPlanned`, `score`, `simulations` y `missingCourses`. El agente Académico solo menciona mejoras si hay al menos dos semanas comparables. Para otros KPI del PDF, se pueden añadir nuevas proyecciones `dm_*` mediante migraciones adicionales, sin cambiar el historial operativo.

Las tablas `amp_*` nunca se llenan desde el OLTP. Guardan operadores, mensajes, eventos, correcciones, trabajos, sugerencias del Radar (`amp_insights`), decisiones de triaje entrante (`amp_inbound_triage`), exámenes importados, aprobaciones, campañas y cupones. El TXT original no se conserva después de procesarse; se guardan filas estructuradas, nombre de archivo y auditoría.

## Señales IMPULSE sin ampliar el esquema

El perfil negociador LEAD y las evaluaciones de onboarding PAYER se auditan en `amp_events` (tipos `LEAD_NEGOTIATION_PROFILE` y `PAYER_ONBOARDING`). Ya no existen señales de intención BUYER (`BUYER_INTENT_SIGNAL`); el Agente de conversión Buyer → Lead registra `BUYER_RUN`, `BUYER_RUN_FAILED` y `BUYER_PROPOSAL_DECISION` (sin contacto). El perfil LEAD combina `career`, `missingCourses`, `plan` y `academicStatus` disponibles con evidencia explícita de mensajes entrantes; los datos no detectados se muestran como campos faltantes, no se escriben en el datamart.

El onboarding PAYER solo puede confirmar activación con `stageChangedAt` y un estado de pago confirmado (`ACTIVE`, `PAID` o `RENEWED`), y actividad con `lastActivityAt` posterior a la activación. El contrato actual no expone hitos independientes para acceso, diagnóstico inicial o ruta de estudio: esos estados permanecen `NO_DATA` salvo que el contacto los confirme explícitamente en el chat. Una fecha de última actividad anterior a la activación permite recomendar ayuda después de tres días; un `lastActivityAt` ausente no se interpreta como inactividad. No se requieren nuevas tablas, columnas, migraciones ni proyecciones para estas mejoras.

## Validaciones de carga del DBMS

1. Cada `dm_contacts.sourceKey` corresponde a una única persona del OLTP.
2. La etapa vigente se deriva del último evento verificable de `HistorialEtapa`; una baja crea `TURNED`, una reactivación crea `PAYER`.
3. Los pagos, fechas de vigencia y planes se transfieren desde la plataforma académica, sin inferirlos a partir de mensajes del AMP.
4. Los contactos de estudiante y apoderado mantienen sus permisos de contacto y direcciones por separado.
5. Los snapshots de cohortes y los perfiles semanales indican fecha de corte. No mezclar los 385 payers ilustrativos del PDF con los 92 primeros pagos simulados presentes en los scripts.
