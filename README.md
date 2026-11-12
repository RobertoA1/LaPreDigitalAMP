# LaPreDigital AMP

CUSTOMER utiliza el **Agente de Fidelización y Acompañamiento** y TURNED el **Agente de Reactivación y Postventa**. Ambos siguen un ciclo auditable y preparan acciones revisables con evidencia del perfil; solo las acciones autorizadas por un operador se ejecutan. Las reglas de actividad, riesgo, reactivación, revisión humana y plazos se describen en [docs/customer-turned.md](docs/customer-turned.md). Estas mejoras no requieren cambios de esquema ni migraciones.

Aplicación local de orquestación para el recorrido **Universo → Buyer → Lead → Payer → Customer → Turned → Payer** de LaPreDigital. Implementada con Next.js 16, React, TypeScript y Sequelize 6. SQL Server 2022 es el motor operativo previsto; el modo Demo usa una base SQLite aislada con contactos sintéticos.

## Inicio rápido: Demo

```bash
npm install
cp .env.example .env.local
# Cambia SESSION_SECRET por una cadena larga y aleatoria.
npm run db:migrate
npm run db:seed
```

Inicia dos procesos en terminales distintas:

```bash
npm run dev
npm run worker
```

Abre `http://127.0.0.1:3000`. Cuentas Demo: `admin@lapredigital.local`, `direccion@lapredigital.local` y `operador@lapredigital.local`, todas con contraseña `Demo1234!`. Estas cuentas son **solo para la base Demo local**. La base, las cuentas y los mensajes simulados no se mezclan con SQL Server. `DEMO_MODE=true` exige `DB_DIALECT=sqlite`.

## SQL Server 2022

En `.env.local`, establece `DEMO_MODE=false`, `DB_DIALECT=mssql`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_ENCRYPT` y `SESSION_SECRET`. Ejecuta `npm run db:migrate` y crea el primer administrador con `npm run user:create -- correo@dominio ADMIN Nombre Completo`, proporcionando `AMP_BOOTSTRAP_PASSWORD` como variable de entorno de al menos 12 caracteres. Después inicia la web y el worker.

Sequelize permite configurar el dialecto en `.env`, pero **no garantiza que una base SQL Server completa pueda cambiarse a otro motor con solo editar esa variable**. Los tipos, índices, consultas analíticas, importación y semántica de concurrencia deben verificarse en cada dialecto. La versión actual admite SQL Server 2022 y SQLite únicamente para Demo.

## Límite de datos

El AMP **lee el datamart**, no la base OLTP de la plataforma académica. Las migraciones crean tres proyecciones del datamart (`dm_contacts`, `dm_funnel_daily`, `dm_academic_weekly`) y tablas propias `amp_*` para conversaciones, eventos, cola, campañas, exámenes, aprobaciones, cupones, usuarios y ajustes. El equipo puede poblar o actualizar `dm_*` manualmente desde su DBMS. El AMP no confirma pagos ni cambia planes o suscripciones: los consume una vez aparezcan en el datamart. La correspondencia con los SQL adjuntos está en [docs/datamart-contract.md](docs/datamart-contract.md). La matriz de requisitos y trabajo de integración está en [docs/coverage.md](docs/coverage.md).

Las correcciones del operador y las inferencias de alta confianza del agente se guardan en `amp_overrides`, sin sobrescribir la carga externa. Las transiciones de etapa vienen del datamart. `TURNED` significa baja; una reactivación confirmada vuelve a `PAYER` en un ciclo nuevo, sin borrar compras históricas.

## Reglas operativas

- Los agentes conversacionales de etapa son Negociador (LEAD), Cobranza (PAYER), Académico y Fidelización (CUSTOMER) y Post-venta (TURNED). BUYER no tiene agente conversacional: un buyer es un visitante anónimo de la landing y lo atiende el **Agente de conversión Buyer → Lead** (ver más abajo). El **Radar** es un analizador transversal que revisa conversaciones cada minuto desde el worker, sin depender de que un operador abra el perfil. Guarda estrategias y borradores, alerta por silencio a los 3, 7, 14 y 21 días y detiene el seguimiento a los 30 días por defecto. El administrador puede ajustar el máximo entre 1 y 90 días en Configuración. La respuesta del contacto reinicia el ciclo. Las sugerencias se pueden editar, enviar o marcar como revisadas desde la UI. Cada etapa separa los perfiles que requieren atención de los que esperan contacto y los ordena por prioridad; el Radar enlaza al perfil. Un mensaje entrante activa triaje en el servidor: saludos y hechos institucionales verificados pueden recibir respuesta automática en el mismo canal, mientras dudas comerciales, académicas o no verificadas generan alerta manual. Los borradores del Radar no se envían por sí solos. El panel recibe cambios por eventos en vivo, con recarga periódica de respaldo. La ejecución se encola en `amp_jobs`, corre en el servidor y puede procesarse en tres bucles concurrentes. El agente de IA seleccionado puede ser OpenAI (por defecto `gpt-5-mini`, configurable), Gemini, Grok o Anthropic. El administrador elige proveedor y nombre de modelo. Las llaves permanecen en `.env.local`. Sin llave, se registra el fallo y se usa una plantilla explícita.
- El modo Demo simula mensajes; fuera de Demo se usan Evolution API y Gmail API cuando estén configuradas. La recepción de WhatsApp se puede configurar en `/api/webhooks/evolution` con `EVOLUTION_WEBHOOK_SECRET` y el evento `MESSAGES_UPSERT`. Gmail usa un access token o OAuth con client ID, client secret y refresh token. No hay envío externo mientras `DEMO_MODE=true`.
- Los envíos automáticos se ejecutan entre **07:00 y 23:00 de Lima**. Una respuesta iniciada por el contacto puede atenderse fuera de ese horario. Solo se envía por canales con consentimiento. Las etapas con agente conversacional usan el MCE editable; los buyers no reciben mensajes. También se contacta al apoderado si existe dato y autorización.
- Renovaciones: avisos a 7, 3 y 1 días. Antes de enviar se vuelve a leer el datamart; si se renovó, canceló o cambió la fecha, el aviso anterior no se envía. Customers reciben seguimiento semanal; payers y customers reciben un recordatorio de revisión de simulacros los viernes.
- Ofertas individuales de agentes requieren aprobación del operador. Los descuentos tienen límite de **30 %**, un cupón por usuario, un uso y alcance `ONE_PAYMENT`. Becas y semibecas también se revisan. Las campañas aprobadas por alta dirección pueden enviarse sin nueva aprobación individual. El uso efectivo del cupón debe informarlo la plataforma de pagos; el AMP no procesa pagos.
- El TXT del examen se analiza por carrera. Se calculan los diez mejores puntajes `NO INGRESA` por carrera. El cotejo usa carnet cuando esté disponible, nombre normalizado y comparación difusa conservadora. Las coincidencias dudosas quedan pendientes para alta dirección. Un ingreso confirmado bloquea la recuperación de un contacto `TURNED`.

## Agente de conversión Buyer → Lead

Un BUYER es un visitante anónimo de la landing (un dispositivo), no un contacto. El agente no conversa con nadie: lee los KPI de adquisición y propone **borradores** que un operador aprueba, edita o descarta (nada se publica solo). Especificación completa y contrato de API: [docs/agente-buyer-lead.md](docs/agente-buyer-lead.md).

- **B-1** (publicaciones orgánicas y anuncios pagados hacia la landing): propuestas para estudiantes postulantes y padres o apoderados en TikTok, Instagram y WhatsApp, destacando preparación flexible, ruta de estudio y seguimiento académico.
- **B-2** (video breve de la landing): variantes de guion y del llamado al formulario, y recomendaciones de duración, orden de los beneficios y mensaje final a partir de la curva de abandono.
- **B-3** (formulario breve): solo se muestra el KPI, sin IA.

### Tres bases de datos

| Base | Uso | Acceso |
|---|---|---|
| `LaPreDigitalDatamart` | KPI por periodo y dimensión, tendencias y comparaciones | solo `SELECT` |
| `LaPreDigitalOLTP` | Tiempo real, catálogo vigente de campañas y videos, curva de abandono, verificación de inscripciones | solo `SELECT` |
| `LaPreDigitalAMP` | Todo lo que escribe el AMP (`amp_*`) | lectura y escritura |

El ayudante `queryExternal` rechaza todo lo que no sea `SELECT`/`WITH`. En modo Demo (SQLite) el agente responde «requiere SQL Server».

### Configuración de conexión (`.env.local`)

`DB_AUTH=windows` usa el controlador ODBC (`msnodesqlv8`, conexión de confianza, p. ej. `DB_ODBC_DRIVER=ODBC Driver 18 for SQL Server`); `DB_AUTH=sql` usa `tedious` con `DB_USER` y `DB_PASSWORD`. `DB_HOST`, `DB_PORT` (se ignora con `DB_INSTANCE`), `DB_NAME` (`LaPreDigitalAMP`), `OLTP_DB_NAME` y `DATAMART_DB_NAME` definen las tres bases; `OLTP_*` y `DATAMART_*` heredan host, puerto, instancia y autenticación de `DB_*` salvo que se redefinan (p. ej. `OLTP_DB_HOST`). Tras actualizar el código ejecuta `npm run db:migrate` (la migración `009_repair_shared_attribute_columns` repara bases que perdieron columnas por un defecto previo del migrador; solo añade, no borra).

### Notificación de nuevas inscripciones

El sistema del OLTP llama a `POST /api/webhooks/inscripciones` con la cabecera `x-amp-webhook-secret` igual a `BUYER_WEBHOOK_SECRET` (sin secreto configurado responde 503). Solo `idFormulario` es obligatorio; es idempotente (201 creado, 200 ya existía, 400 cuerpo inválido, 401 secreto incorrecto) y no guarda datos personales.

```bash
curl -X POST http://127.0.0.1:3000/api/webhooks/inscripciones \
  -H "Content-Type: application/json" \
  -H "x-amp-webhook-secret: $BUYER_WEBHOOK_SECRET" \
  -d '{"idFormulario":116501,"idVisita":647224,"fechaHoraEnvio":"2026-11-12T15:04:05Z","estado":"VALIDO"}'
```

### Ejecuciones y llave de IA

El worker procesa trabajos `BUYER_RUN`: manual desde el panel (`POST /api/buyer/run`), semanal (lunes, hora de Lima) para B1 y B2, y `KPI_ALERT` diaria si un KPI de la actividad está en rojo y no hubo ejecución en los últimos 7 días. El contexto se calcula con consultas deterministas; la IA (OpenAI `gpt-5-mini` por defecto, Responses API) devuelve JSON validado con zod; después reglas deterministas descartan o corrigen precios, descuentos, becas y promesas de ingreso, exigen pilar y llamado a la landing en cada publicación y completan la cobertura mínima con plantillas. Sin llave o si la IA falla se guardan propuestas de plantilla (`provider='PLANTILLA'`) y el motivo queda en `amp_buyer_runs.error`.

Para activar OpenAI, escribe tu llave en `.env.local` (nunca en el repositorio):

```
OPENAI_API_KEY=sk-...
```

Reinicia `npm run dev` y `npm run worker`. El proveedor y el modelo se pueden cambiar en Configuración (administrador).

## Plantillas para OpenAI

Las seis plantillas, su configuración y las bases de conocimiento que debe preparar la empresa están en [docs/openai-agents/README.md](docs/openai-agents/README.md). La creación de agentes en OpenAI no los conecta automáticamente con este AMP; el backend conserva las reglas de envío y aprobación.

## Permisos

- **Administrador:** configuración de IA, exámenes, campañas y operaciones.
- **Alta dirección:** carga resultados, aprueba y lanza campañas, confirma coincidencias.
- **Operador:** atiende contactos y revisa propuestas individuales con motivo auditado.

## Verificación

```bash
npm run typecheck
npm test
npm run build
```

El SQL Server productivo, Evolution API y Gmail requieren credenciales e instancias reales para una prueba de integración. La aplicación se validó en modo Demo local. Antes de desplegarla, configure HTTPS y `SESSION_COOKIE_SECURE=true`, usuarios reales, copias de seguridad, OAuth de Gmail y carga regular del datamart.
