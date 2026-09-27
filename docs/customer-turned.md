# Fidelización y reactivación

CUSTOMER corresponde al Agente de Fidelización del informe, secciones 6.1–6.4. Detecta cinco días sin actividad registrada, resume reportes fechados y prepara borradores diferenciados para estudiante y apoderado. Las cancelaciones, insatisfacción e incidencias de acceso generan atención humana. El bloqueo comienza al detectar la declaración y no depende de que el operador abra el perfil. Una resolución humana con motivo queda auditada antes de habilitar nuevamente la programación automática; la pausa del contacto conserva su efecto.

TURNED es una propuesta de asistente, basada en las actividades de la sección 7.3. Identifica la etapa anterior solo mediante un evento de transición, registra motivos declarados en `amp_events` y propone mensajes según la dificultad comunicada. No infiere pagos de una conversación. Registra la reactivación únicamente cuando el worker observa el cambio TURNED → PAYER en el datamart.

## Datos y límites

No hay cambios de esquema, migraciones ni cargas iniciales. Se utilizan `dm_contacts`, `dm_academic_weekly`, `amp_events`, `amp_messages`, `amp_insights` y `amp_jobs`. La fase LIFECYCLE usa el campo de texto existente; `sourceMessageId=0` representa un borrador previo a la primera conversación (el esquema existente no define una clave foránea para ese campo).

`stageChangedAt` debe representar la transición vigente, no una fecha de importación. Se considera inválida si falta, no se puede interpretar o está en el futuro. El seguimiento saliente termina al cumplirse 30 días desde la baja o al vencer el plazo de silencio configurado en el Radar. No se reemplaza la fecha faltante por la creación del contacto ni por el vencimiento del plan.

Los reportes semanales no permiten demostrar que dos puntajes provienen de evaluaciones equivalentes. Se muestran valores, semanas y actividades observadas, pero no se calculan mejora del 10 %, estancamiento entre evaluaciones, NPS ni satisfacción. No se alteran rutas académicas ni planes. Esta limitación también se explica en el perfil.

## Operación

El worker prepara recomendaciones al detectar la etapa, en su revisión diaria y durante el seguimiento semanal existente. CUSTOMER y TURNED generan borradores revisables, sin envío autónomo del texto generado. Los recordatorios ya existentes permanecen sujetos a consentimiento, horario y revisión de servicio. Las tareas bloqueadas quedan terminadas con un evento de omisión; no se reenvían comunicaciones vencidas al resolver el caso.

La clave de cada recomendación depende de la evidencia, no del propio envío, para evitar que enviar un borrador produzca otro idéntico. El Radar no genera un seguimiento adicional mientras hay una recomendación de ciclo abierta. Antes de enviar se verifican nuevamente evidencia, etapa, pausa, plazo y último mensaje. Los borradores copiados al editor son mensajes manuales sujetos a los controles de envío del sistema.

La IA únicamente elige entre redacciones basadas en evidencia; no puede incorporar nuevos hechos a estos borradores. Las consultas sensibles entrantes conservan respuestas de plantilla para revisión humana. Una ausencia o fallo del proveedor no impide el análisis.

## Verificación

`tests/lifecycle.test.ts` cubre datos insuficientes, cinco días sin actividad, reportes, motivos declarados, pausa, admisión, revisión humana, límites de reactivación y deduplicación. La integración usa SQLite exclusivamente en memoria y prohíbe llamadas de red. No inicia el worker ni accede a la base local del usuario.
