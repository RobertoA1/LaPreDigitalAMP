# Cobertura funcional y próximos pasos

| Requisito | Estado en esta entrega | Cómo comprobarlo |
|---|---|---|
| Dashboard IMPULSE y KPI ampliables | Implementado | `/` muestra snapshot del embudo, conversión, ingreso, cartera actual, aprobaciones y actividad. Nuevos KPI se agregan mediante nuevas proyecciones `dm_*`. |
| BUYER, LEAD, PAYER, CUSTOMER y TURNED | Implementado | Cada vista lista contactos, perfil, historial de operador/agente, chat, seguimiento y recomendación del funnel pirata. |
| Cinco agentes y tareas concurrentes | Implementado | `npm run worker` procesa hasta tres tareas simultáneas en `amp_jobs`; la web solo encola. |
| Proveedores IA | Implementado; llamadas reales dependen de llaves | Administrador selecciona OpenAI `gpt-5-nano`, Gemini, Grok o Anthropic en Configuración. Sin llave se audita el uso de plantilla. |
| MCE, estudiante y apoderado, horario | Implementado | MCE editable, permisos separados, envíos automáticos 07:00–23:00 Lima; respuestas a mensajes entrantes pueden salir fuera del horario. |
| Exámenes, diez no ingresantes, ingreso | Implementado | Alta dirección carga TXT, el sistema rankea por carrera, coteja carnet/nombre/variantes, permite revisión manual, alerta al BUYER prioritario y detiene TURNED admitidos. |
| Aprobaciones y descuentos | Implementado | Ofertas individuales se revisan en Aprobaciones. Descuento de 1–30 %, un cupón por contacto, un uso, un pago, sin combinación. Campañas requieren aprobación previa de alta dirección. |
| Renovación y seguimiento académico | Implementado según datos del datamart | Recordatorios a 7, 3 y 1 días; se cancelan al cambiar fecha o marcar `RENEWED`/`CANCELLED`. Seguimiento académico semanal y aviso de simulacros los viernes. |
| Datamart y migraciones | Implementado | `npm run db:migrate` aplica cinco migraciones; el AMP consume `dm_*` y guarda acciones en `amp_*`. No conecta al OLTP. |
| Demo aislado | Implementado y probado | SQLite, 18 contactos sintéticos, tres cuentas y mensajes simulados. Simulación de entrada y salida solo con `DEMO_MODE=true`. |
| Evolution API y Gmail API | Adaptadores de salida implementados; verificación real pendiente | Requieren instancia, llaves y cuenta reales. Evolution recibe webhook de WhatsApp. La recepción/sincronización de correo Gmail aún requiere OAuth y mecanismo de notificaciones del buzón. |
| SQL Server 2022 | Migraciones y dialecto configurados; verificación real pendiente | Ejecutar migraciones y prueba de integración contra una instancia 2022 con credenciales de la organización. |
| Pagos, plan y baja | Dependencia externa definida | La plataforma académica confirma y el DBMS vuelca sus eventos al datamart; el AMP solo lee y actúa sobre esos datos. El canje efectivo del cupón requiere retorno de dicha plataforma. |

## Comprobaciones ejecutadas

- `npm run typecheck`, `npm test` y `npm run build` completados.
- Inicio de sesión y rutas API principales verificados por HTTP en Demo.
- TXT de ejemplo parseado, con pruebas de ranking por carrera y bloqueo de recuperación de admitidos.
- Worker activo: 18 contactos con estado sincronizado y 54 trabajos Demo terminados sin fallos al cierre.

## Trabajo con infraestructura real

1. Preparar SQL Server 2022, aplicar migraciones y cargar `dm_contacts`, `dm_funnel_daily` y `dm_academic_weekly` desde el DBMS.
2. Configurar una llave de IA, Evolution API y OAuth de Gmail; probar salidas y webhook con cuentas de prueba.
3. Incorporar la recepción de Gmail si se desea conversación bidireccional por correo.
4. Definir en la plataforma académica cómo reportar renovaciones, bajas, cambios de plan y canjes de cupones al datamart.
5. Antes de publicar, usar HTTPS, `SESSION_COOKIE_SECURE=true`, cuentas reales, respaldo y monitoreo del worker.
