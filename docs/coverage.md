# Cobertura funcional y próximos pasos

| Requisito | Estado en esta entrega | Cómo comprobarlo |
|---|---|---|
| Dashboard IMPULSE y KPI ampliables | Implementado | `/` muestra snapshot del embudo, conversión, ingreso, cartera actual, aprobaciones y actividad. Nuevos KPI se agregan mediante nuevas proyecciones `dm_*`. |
| BUYER, LEAD, PAYER, CUSTOMER y TURNED | Implementado | Cada vista separa «Requieren atención» y «Esperando contacto», ordena perfiles por prioridad y muestra el borrador aplicable, perfil, historial, chat y recomendación del funnel pirata. |
| Cinco agentes y tareas concurrentes | Implementado | `npm run worker` procesa hasta tres tareas simultáneas en `amp_jobs`; la web solo encola. |
| Radar permanente de conversaciones | Implementado | Worker analiza chats cada minuto sin operador; guarda borradores y estrategias, alerta a los 3/7/14/21 días y detiene a los 30 días por defecto. El máximo se configura en la UI. El radar incluye «Ver perfil». |
| Triaje entrante y panel en vivo | Implementado en Demo y webhook WhatsApp | Cada entrada crea trabajo servidor. Las respuestas factuales cubiertas por lista blanca se envían automáticamente por el canal de origen; ofertas, pagos, incidencias y dudas sin datos verificados crean alerta manual con borrador. Los operadores reciben actualizaciones por SSE y sondeo de respaldo. |
| Plantillas de OpenAI | Entregadas para configuración manual | `docs/openai-agents/` contiene reglas comunes, cinco agentes de etapa, Radar y lista de bases de conocimiento. La plataforma OpenAI no está conectada a estas plantillas automáticamente. |
| Proveedores IA | Implementado; llamadas reales dependen de llaves | Administrador selecciona OpenAI `gpt-5-nano`, Gemini, Grok o Anthropic en Configuración. Sin llave se audita el uso de plantilla. |
| MCE, estudiante y apoderado, horario | Implementado | MCE editable, permisos separados, envíos automáticos 07:00–23:00 Lima; respuestas a mensajes entrantes pueden salir fuera del horario. |
| Exámenes, diez no ingresantes, ingreso | Implementado | Alta dirección carga TXT, el sistema rankea por carrera, coteja carnet/nombre/variantes, permite revisión manual, alerta al BUYER prioritario y detiene TURNED admitidos. |
| Aprobaciones y descuentos | Implementado | Ofertas individuales se revisan en Aprobaciones. Descuento de 1–30 %, un cupón por contacto, un uso, un pago, sin combinación. Campañas requieren aprobación previa de alta dirección. |
| Renovación y seguimiento académico | Implementado según datos del datamart | Recordatorios a 7, 3 y 1 días; se cancelan al cambiar fecha o marcar `RENEWED`/`CANCELLED`. Seguimiento académico semanal y aviso de simulacros los viernes. |
| Mejoras IMPULSE BUYER / LEAD / PAYER | Implementado sobre tablas existentes | Señales BUYER y perfil progresivo LEAD quedan auditados en `amp_events`; prioridad comercial basada en evidencia; aprobación solo ante petición explícita o propuesta concreta de beneficio. PAYER registra onboarding y `NO_DATA` sin inventar hitos, ofrece apoyo por inactividad confirmada y vuelve a validar la renovación antes del envío. |
| Datamart y migraciones | Implementado | `npm run db:migrate` aplica siete migraciones; el AMP consume `dm_*` y guarda acciones en `amp_*`. No conecta al OLTP. |
| Demo aislado | Implementado y probado | SQLite, 18 contactos sintéticos, tres cuentas y mensajes simulados. Simulación de entrada y salida solo con `DEMO_MODE=true`. |
| Evolution API y Gmail API | Adaptadores de salida implementados; verificación real pendiente | Requieren instancia, llaves y cuenta reales. Evolution recibe webhook de WhatsApp. La recepción/sincronización de correo Gmail aún requiere OAuth y mecanismo de notificaciones del buzón; el triaje automático por correo quedará operativo cuando esa entrada esté conectada. |
| SQL Server 2022 | Migraciones y dialecto configurados; verificación real pendiente | Ejecutar migraciones y prueba de integración contra una instancia 2022 con credenciales de la organización. |
| Pagos, plan y baja | Dependencia externa definida | La plataforma académica confirma y el DBMS vuelca sus eventos al datamart; el AMP solo lee y actúa sobre esos datos. El canje efectivo del cupón requiere retorno de dicha plataforma. |

## Comprobaciones ejecutadas

- `npm run typecheck`, `npm test` y `npm run build` completados.
- Inicio de sesión y rutas API principales verificados por HTTP en Demo.
- TXT de ejemplo parseado, con pruebas de ranking por carrera y bloqueo de recuperación de admitidos.
- Worker activo en Demo: 18 contactos con estado sincronizado. El Radar generó sugerencias sin abrir sus chats. Se verificó un saludo con respuesta automática, una consulta comercial con alerta manual y actualización del radar abierta sin recargar la página.

## Trabajo con infraestructura real

1. Preparar SQL Server 2022, aplicar migraciones y cargar `dm_contacts`, `dm_funnel_daily` y `dm_academic_weekly` desde el DBMS.
2. Configurar una llave de IA, Evolution API y OAuth de Gmail; probar salidas y webhook con cuentas de prueba.
3. Incorporar la recepción de Gmail si se desea conversación bidireccional por correo.
4. Definir en la plataforma académica cómo reportar renovaciones, bajas, cambios de plan y canjes de cupones al datamart.
5. Antes de publicar, usar HTTPS, `SESSION_COOKIE_SECURE=true`, cuentas reales, respaldo y monitoreo del worker.
