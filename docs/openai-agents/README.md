# Plantillas de agentes para LaPreDigital AMP

Estas instrucciones se pueden copiar en la configuración de agentes de OpenAI para ensayos. El AMP de esta entrega ejecuta la orquestación en su propio servidor mediante Responses API y conserva sus controles, permisos, historial y cola; crear agentes en la plataforma no los conecta automáticamente con el AMP. Mantener aquí las versiones aprobadas y actualizar los prompts del código cuando se cambien.

**Estado de plataforma a 25-09-2026:** OpenAI anuncia la retirada de Agent Builder el 30-11-2026. Para una implementación nueva, documenta Agents API y sus campos `model`, `instructions` y `tools`. No se debe hacer depender la operación del AMP de un flujo guardado en Agent Builder. Referencias: [Agent Builder](https://developers.openai.com/api/docs/guides/agent-builder), [configuración de Agents API](https://developers.openai.com/api/docs/guides/agents-api/configuration), [File search](https://developers.openai.com/api/docs/guides/tools-file-search).

## Configuración común

- **Nombres:** `LaPreDigital AMP / Marketing`, `Negociador`, `Cobranza`, `Académico`, `Post-venta` y `Radar / Triaje`.
- **Modelo objetivo en AMP:** `gpt-5-nano`. Antes de guardar un agente alojado, comprobar que el selector de la plataforma admite ese modelo; la disponibilidad puede variar. El AMP lo invoca directamente mediante Responses API.
- **Idioma:** español de Perú; mensajes cortos, respetuosos y con una sola pregunta o llamada a la acción.
- **Entrada:** contexto estructurado que entrega el AMP: etapa, perfil vigente del datamart, MCE, consentimiento, últimos mensajes, campañas y ofertas aprobadas, actividad académica si procede, fecha local de Lima. No colocar expedientes completos ni credenciales en las instrucciones.
- **Herramientas:** en la plataforma, iniciar en modo lectura/borrador. Para una futura conexión por funciones, exponer únicamente `read_contact`, `read_conversation`, `read_approved_campaigns`, `read_academic_summary` y `propose_action`. Las acciones reales (`send_message`, `update_contact`, `approve_offer`, `mark_admitted`) siguen en el backend con validación de permisos, idempotencia, consentimiento, horario y auditoría. Ningún agente obtiene una herramienta directa para aprobar descuentos o modificar pagos.
- **Salida del agente de etapa en AMP:** JSON validado por Zod con `draft`, `nextAction`, `priority`, `priorityReason`, `missingFields`, `proposalType`, `needsApproval` y `factsUsed`. La prioridad del lead y los campos faltantes se recalculan con reglas del backend; la IA no confirma pagos ni modifica etapas. Las propuestas de beneficios quedan sujetas a aprobación del AMP.
- **Salida del triaje entrante:** JSON validado con `decision` (`AUTO` o `MANUAL`), `reason` y `draft`. La lista determinista del servidor limita qué respuestas se pueden enviar; el modelo no puede convertir una consulta sensible en auto-respuesta.
- **Salida del Radar:** usa el contrato estructurado del agente de etapa, pero el borrador queda en revisión humana y el Radar nunca lo envía por sí solo.
- **Control común:** añadir el texto de [reglas-comunes.md](reglas-comunes.md) antes de la instrucción específica del agente.

## Bases de conocimiento que debe preparar la empresa

Cargar archivos **aprobados, fechados y sin datos personales**. Mantener versiones; retirar las antiguas. File search usa archivos en un vector store, pero el datamart y el chat reciente deben consultarse como datos vivos, no subirse como documentos estáticos.

| Base de conocimiento | Contenido mínimo | Agentes |
|---|---|---|
| `01_servicio_y_pedagogia` | Descripción de LaPreDigital, modalidad 100 % digital, universidades y carreras cubiertas, acceso, cursos, simulacros, calendario, soporte, preguntas frecuentes y afirmaciones permitidas. | Todos |
| `02_planes_y_pagos` | Planes y precios vigentes con fecha de inicio/fin, renovación, cambios de plan, cancelación y proceso de cobro definido por la plataforma académica. | Negociador, Cobranza, Post-venta, Radar |
| `03_campanas_aprobadas` | Campañas autorizadas por alta dirección: ID, texto, segmentación, canal, cupos, vigencia, restricciones y responsable. Actualizar al aprobar o expirar. | Marketing, Negociador, Post-venta, Radar |
| `04_politica_comercial` | Descuento máximo 30 %, un uso por usuario, un pago, sin combinación; condiciones de beca y semibeca, ruta de aprobación y justificación fuera de los diez no ingresantes. | Negociador, Post-venta, Radar |
| `05_operacion_y_privacidad` | Consentimiento por canal, MCE, horario 07:00–23:00 Lima, atención de entrantes, baja de contacto, privacidad, escalamiento y trato a estudiantes/apoderados. | Todos |
| `06_atencion_academica` | Reglas de lectura de progreso, rachas, cursos no usados, simulacros y formato del reporte semanal. Sin prometer resultados de admisión. | Académico, Radar |
| `07_impulse_y_embudo` | Definición validada de Universo, Buyer, Lead, Payer, Customer, Turned y regreso a Payer; objetivos y recomendaciones del funnel pirata por etapa. | Todos |
| `08_preguntas_y_objeciones` | Respuestas revisadas a dudas reales sobre tiempo, modalidad, precio y resultados; criterios para dejar a un humano. | Todos |

**No subir como conocimiento:** listas TXT de ingresantes, nombres/teléfonos/correos de alumnos, chats individuales, llaves API, tokens, datos de pago o copias completas de tablas. Esos datos se consultan en el AMP con control de acceso. La lista TXT se procesa en la base propia para cotejar y detener contacto a admitidos.

## Pasos en OpenAI

1. Preparar los ocho documentos anteriores con propietario, fecha de vigencia y aprobación de dirección. Una versión del PDF IMPULSE puede ser fuente para `07_impulse_y_embudo` tras depurar datos personales y marcar qué políticas siguen vigentes.
2. Crear un vector store de prueba y añadir las bases pertinentes. Probar búsquedas para verificar que devuelve la versión vigente.
3. Para cada rol, crear un agente con el nombre indicado, modelo admitido e instrucciones de `reglas-comunes.md` más su archivo de rol. Conectar solo las bases que figuran en la tabla. Dejar las herramientas de escritura desactivadas en estas pruebas.
4. Probar saludos, objeciones de precio, solicitud de beca, cancelación, quejas, usuario admitido, solicitud de dejar de recibir mensajes y respuesta fuera del horario. Confirmar que los casos sensibles producen `ESCALATE` o `STOP`.
5. Para integrar agentes alojados en una versión futura, guardar identificadores por rol, conectar las funciones con autorización del backend y conservar la decisión final de envío en el AMP. No sustituir las reglas deterministas de consentimiento, horario, límites de oferta y admisión.
