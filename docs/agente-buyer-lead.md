# Agente de conversión Buyer → Lead (especificación)

Fuente funcional: sección 3.3 del documento de BUYERS. Este archivo es el contrato entre backend, lógica del agente e interfaz.

## 1. Alcance

Un BUYER es un **visitante anónimo de la landing** (un dispositivo), no un contacto. El agente **no conversa con nadie**: cuando alguien envía el formulario pasa a LEAD y su gestión es del agente Lead → Payer (fuera de alcance).

| Actividad | Qué hace el agente IA | KPI que observa |
|---|---|---|
| B-1 Difundir publicaciones orgánicas y anuncios pagados (TikTok, Instagram, WhatsApp) hacia la landing | Genera propuestas de publicaciones adaptadas a **estudiantes postulantes** y a **padres o apoderados**, destacando **preparación flexible, ruta de estudio y seguimiento académico** | B-1.1, B-1.2 |
| B-2 Video breve de la landing con registro periódico del punto de reproducción | Elabora **variantes del guion y del llamado a completar el formulario**. Analiza **puntos de abandono** y la **relación entre visualización y registro**, y recomienda cambios en **duración, orden de los beneficios o mensaje final** | B-2.1, B-2.2, B-2.3 |
| B-3 Captar datos con formulario breve | No requiere IA. Solo se muestra el KPI | B-3.1 |

Se elimina el agente BUYER conversacional anterior (prompt de Marketing para BUYER, señales de intención, borradores y envíos a buyers, Radar/triaje para BUYER). Los agentes LEAD, PAYER, CUSTOMER y TURNED no se tocan.

## 2. Fuentes de datos

Tres bases en SQL Server 2025, mismo servidor por defecto:

| Base | Uso | Acceso |
|---|---|---|
| `LaPreDigitalDatamart` | KPI por periodo y dimensión, tendencias, comparaciones entre campañas/videos (tareas grandes) | Solo `SELECT` |
| `LaPreDigitalOLTP` | Tiempo real: actividad de hoy, verificación de una inscripción notificada, catálogo vigente de campañas y videos, curva de abandono (el DataMart no guarda el segundo alcanzado) | Solo `SELECT` |
| `LaPreDigitalAMP` | Todo lo que el AMP escribe: tablas `amp_*` | Lectura y escritura |

Reglas: el AMP **nunca escribe** en OLTP ni DataMart; el ayudante de consulta externa rechaza todo lo que no empiece por `SELECT`/`WITH`. El DataMart lo carga a diario otro sistema: el AMP solo lo lee y muestra la fecha del último dato (`MAX(idFecha)` de `dim.Tiempo` con hechos). Las definiciones exactas de tablas y medidas están en `../01_LaPreDigitalOLTP_Buyers_v3.sql`, `../02_LaPreDigitalDatamart_Creacion.sql` y `../03_LaPreDigitalDatamart_Migracion.sql` (la vista `etl.v_DatosComportamientoVisita` define «elegible», «mitad», «final» y la hora de Lima = UTC−5; las consultas al OLTP deben usar los mismos criterios).

### Configuración (`.env.local`)

```
DEMO_MODE=false
DB_DIALECT=mssql
DB_AUTH=windows            # windows | sql
DB_HOST=localhost
DB_PORT=1433               # se ignora con DB_INSTANCE
DB_INSTANCE=
DB_NAME=LaPreDigitalAMP
DB_USER=                   # solo DB_AUTH=sql
DB_PASSWORD=
DB_ENCRYPT=false
DB_ODBC_DRIVER=ODBC Driver 18 for SQL Server   # solo DB_AUTH=windows
OLTP_DB_NAME=LaPreDigitalOLTP
DATAMART_DB_NAME=LaPreDigitalDatamart
BUYER_WEBHOOK_SECRET=
OPENAI_API_KEY=
```

`DB_AUTH=windows` usa el controlador ODBC (`msnodesqlv8`) con conexión de confianza; `DB_AUTH=sql` usa `tedious` como hasta ahora. `OLTP_*` y `DATAMART_*` heredan host, puerto, instancia y autenticación de `DB_*` salvo que se definan `OLTP_DB_HOST`, etc. El modo Demo (SQLite) sigue existiendo para el resto de la aplicación; en Demo el agente Buyer → Lead responde «requiere SQL Server».

## 3. KPI y semáforos

| Código | Nombre | Fórmula (medidas del DataMart) | Rojo | Amarillo | Verde |
|---|---|---|---|---|---|
| B-1.1 | Cobertura de atribución a campañas | `Visitas` con `KeyCampana <> 0` / `Visitas` | < 60 % | 60 – < 80 % | ≥ 80 % |
| B-1.2 | Costo por LEADs nuevos por campaña (S/) | Fórmula literal: `SUM(hecho.CostoCampana.CostoCampana)` con fecha en el periodo / `SUM(LeadsNuevos)` de campañas PAGADAS en el mismo periodo (dos agregaciones separadas, sin JOIN entre hechos; sin filas de costo el numerador es 0) | > 15 | > 8 y ≤ 15 | ≤ 8 |
| B-2.1 | Tasa de visualización completa | `ReproduccionesAlFinal` / `ReproduccionesTotales` | < 30 % | 30 – < 60 % | ≥ 60 % |
| B-2.2 | Tasa de avance al 50 % | `ReproduccionesMitad` / `ReproduccionesTotales` | < 50 % | 50 – < 75 % | ≥ 75 % |
| B-2.3 | Conversión a LEAD tras el 50 % | `ReproduccionesElegiblesMitadFormulario` / `ReproduccionesElegiblesMitad` | < 5 % | 5 – < 12 % | ≥ 12 % |
| B-3.1 | Tasa de conversión a LEADS | `RegistrosFormulario` / `Visitas` | < 3 % | 3 – < 8 % | ≥ 8 % |

Denominador 0 → valor `null`, estado `SIN_DATOS`. Los umbrales viven en una sola constante. Filtros globales: periodo (`from`, `to`), canal, campaña, video. Periodo por defecto: el último mes con datos en el DataMart.

## 4. Tablas nuevas en `LaPreDigitalAMP` (migración `008_buyer_lead_agent`)

- `amp_buyer_notifications`: `id`, `formId` (único, `IdFormulario`), `visitId`, `formStatus` (`VALIDO|DUPLICADO|INVALIDO|REVISION|DESCONOCIDO`), `channel`, `campaignId`, `campaignName`, `occurredAt`, `verified` (bool: se encontró en el OLTP), `receivedAt`. **Sin datos personales** (ni nombre, ni correo, ni teléfono).
- `amp_buyer_runs`: `id`, `activity` (`B1|B2`), `trigger` (`MANUAL|SCHEDULED|KPI_ALERT`), `status` (`PENDING|RUNNING|DONE|FAILED`), `periodFrom`, `periodTo`, `instructions`, `context` (JSON con KPI y evidencia usados), `analysis` (texto), `provider`, `model`, `error`, `requestedBy`, `createdAt`, `finishedAt`.
- `amp_buyer_proposals`: `id`, `runId`, `activity`, `kind` (`PUBLICACION|GUION|LLAMADO|RECOMENDACION`), `audience` (`POSTULANTE|APODERADO|null`), `channel` (`TIKTOK|INSTAGRAM|WHATSAPP|null`), `campaignType` (`ORGANICA|PAGADA|null`), `videoId`, `recommendationType` (`DURACION|ORDEN_BENEFICIOS|MENSAJE_FINAL|ATRIBUCION|null`), `title`, `content`, `rationale`, `evidence` (JSON), `status` (`DRAFT|APPROVED|DISCARDED`), `editedContent`, `decidedBy`, `decidedAt`, `decisionReason`, `createdAt`.

Las propuestas son borradores: un operador las aprueba, edita o descarta. Nada se publica solo.

## 5. API (todo bajo `/api/`, sesión requerida salvo el webhook)

| Método y ruta | Respuesta / efecto |
|---|---|
| `GET buyer/kpis?from&to&canal&campana&video` | `{ period:{from,to}, lastLoad, filters:{canales[],campanas[],videos[]}, kpis:[{code,name,activity,value,unit:'%'|'S/',status:'ROJO'|'AMARILLO'|'VERDE'|'SIN_DATOS',numerator,denominator,thresholds}], trend:[{mes, 'B-1.1':n, ...}], byCanal:[{canal, ...kpis}], byCampana:[{campana,tipo,visitas,leadsNuevos,costo,costoPorLead}], byVideo:[{videoId,video,version,duracionSeg,'B-2.1','B-2.2','B-2.3'}] }` (DataMart) |
| `GET buyer/realtime` | `{ now, today:{visitas,visitasConCampana,reproducciones,formularios:{VALIDO,DUPLICADO,INVALIDO,REVISION},conversion}, lastActivityAt, notifications:[últimas 20] }` (OLTP + AMP) |
| `GET buyer/abandonment?video&from&to` | `{ videoId, duracionSeg, total, curve:[{pct:0..100 paso 10, alcanzan, conversion}], mayorCaida:{desdePct,hastaPct,perdida} }` (OLTP) |
| `GET buyer/runs` | últimas 50 ejecuciones |
| `GET buyer/proposals?status&activity&runId` | propuestas |
| `POST buyer/run` `{activity, from?, to?, instructions?}` | crea `amp_buyer_runs` y encola trabajo `BUYER_RUN`; devuelve `{runId}` |
| `POST buyer/proposal/decide` `{id, decision:'APPROVED'|'DISCARDED', reason?, editedContent?}` | registra la decisión y un `amp_events` |
| `POST webhooks/inscripciones` | notificación en tiempo real, ver §6 |

`GET live` (SSE existente) debe incluir `amp_buyer_notifications`, `amp_buyer_runs` y `amp_buyer_proposals` en su versión para que el panel se actualice solo.

## 6. Notificación de nuevas inscripciones

El sistema que gestiona el OLTP llama a `POST /api/webhooks/inscripciones` con cabecera `x-amp-webhook-secret: <BUYER_WEBHOOK_SECRET>` (comparación en tiempo constante; sin secreto configurado responde 503) y cuerpo:

```json
{ "idFormulario": 116501, "idVisita": 647224, "fechaHoraEnvio": "2026-11-12T15:04:05Z", "estado": "VALIDO" }
```

Solo `idFormulario` es obligatorio. El AMP: valida, es idempotente por `idFormulario`, verifica en el OLTP (estado, canal y campaña de la visita; si no existe aún, guarda `verified=false` con lo recibido), guarda en `amp_buyer_notifications` y el panel lo muestra en vivo. No contacta al lead. Respuestas: `201` creado, `200` ya existía, `400` cuerpo inválido, `401` secreto incorrecto.

## 7. Ejecución del agente

Trabajo `BUYER_RUN` en `amp_jobs` (sin contacto, exento de la ventana horaria de envíos).

1. Reúne el contexto con consultas deterministas (no la IA): KPI del periodo y del periodo anterior, desgloses, catálogo vigente de campañas/videos, y para B-2 la curva de abandono y la conversión por tramo de avance.
2. Llama a la IA configurada (`amp_settings.ai`; por defecto OpenAI `gpt-5-mini`) pidiendo JSON validado con zod.
3. Aplica reglas: sin precios, descuentos, becas ni promesas de ingreso inventados; cada publicación menciona al menos uno de los tres pilares y lleva llamado a la landing; toda recomendación cita evidencia numérica presente en el contexto.
4. Guarda el análisis y las propuestas como `DRAFT`. Si la IA falla o no hay llave, guarda propuestas de plantilla marcadas `provider='PLANTILLA'` y el error.

Salida mínima — **B1**: 2 públicos × 3 canales, cada una con tipo sugerido (orgánica/pagada), gancho, texto, llamado y formato; más una recomendación `ATRIBUCION` si B-1.1 no está en verde. **B2**: por video vigente, 2 variantes de guion con segmentos temporizados, 3 variantes del llamado al formulario y recomendaciones `DURACION`, `ORDEN_BENEFICIOS` y `MENSAJE_FINAL`.

Disparadores: manual desde el panel; semanal (lunes, hora de Lima) para B1 y B2; y `KPI_ALERT` cuando la revisión diaria encuentra un KPI de la actividad en rojo y no hubo ejecución de esa actividad en los últimos 7 días.

## 8. Interfaz

La pestaña Buyers deja de listar contactos y muestra el panel del agente: tarjetas de los seis KPI con semáforo, valor, numerador/denominador y filtros; tendencia mensual; desgloses por canal, campaña y video; curva de abandono; actividad de hoy y notificaciones en vivo; ejecuciones; y bandeja de propuestas con aprobar, editar y descartar.

## 9. Detalles de implementación (precisiones al contrato)

- **Respuestas**: `GET buyer/runs` → `{ runs: [...] }` (últimas 50, `context` ya parseado); `GET buyer/proposals?status&activity&runId` → `{ proposals: [...] }` (hasta 300, `evidence` ya parseado como arreglo de textos); `POST buyer/run` → `202 { runId }` (400 si el cuerpo es inválido: `activity` B1|B2, `from` y `to` juntos o ninguno, `instructions` ≤ 500; 503 sin SQL Server); `POST buyer/proposal/decide` → `200 { proposal }`, `404` si no existe, `409` si no está en `DRAFT`, `422` si el `editedContent` contiene precios, descuentos, becas o promesas de ingreso. `editedContent` solo se guarda al aprobar y si difiere del contenido original.
- **IA**: Responses API con `reasoning: { effort: 'low' }`, `max_output_tokens: 24000`, `text.format: { type: 'json_object' }` y tiempo máximo de 270 s sin reintentos (el trabajo tiene un arrendamiento de 5 min). La salida se valida con zod propuesta por propuesta.
- **Vigencia**: un video o campaña es «vigente» si su vigencia se solapa con el periodo analizado. B2 incluye hasta 6 videos.
- **ATRIBUCION**: se exige cuando B-1.1 está en ROJO o AMARILLO (con SIN_DATOS no se genera: no hay cifra que citar).
- **Complementos**: las propuestas añadidas por plantilla a una salida de IA llevan «Origen: plantilla de respaldo…» en `evidence`. Las frases con contenido prohibido se eliminan de la propuesta; si no queda texto útil, se descarta y se repone con plantilla.
- **Cierre atómico**: la ejecución pasa a `DONE` y escribe sus propuestas en una sola transacción; si dos ejecutores coinciden, solo uno escribe.
- **Eventos** (`amp_events`, sin contacto): `BUYER_RUN`, `BUYER_RUN_FAILED`, `BUYER_PROPOSAL_DECISION`.
- **Programación**: dedupe `buyer-weekly:<B1|B2>:<fecha Lima>` y `buyer-alert:<B1|B2>:<fecha Lima>`; la revisión de alertas se hace como mucho una vez por hora y actividad.

- **B-1.2 (fórmula literal)**: la misma fórmula se aplica a la tendencia mensual, por canal y por campaña (`byCampana.costo` y `costoPorLead` son del periodo; se eliminó `leadsAcumulados`). Denominador 0 → SIN_DATOS. El filtro de video no aplica al costo.
