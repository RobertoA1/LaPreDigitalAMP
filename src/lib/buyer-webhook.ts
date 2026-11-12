import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { plain, tables } from './db';
import { oltp, queryExternal } from './external';

/**
 * Notificación de nuevas inscripciones (spec §6). El sistema del OLTP llama a `POST /api/webhooks/inscripciones`.
 * No se guarda ni se pide ningún dato personal (nombre, correo, teléfono).
 */

export const ESTADOS_FORMULARIO = ['VALIDO', 'DUPLICADO', 'INVALIDO', 'REVISION', 'DESCONOCIDO'] as const;
export type EstadoFormulario = (typeof ESTADOS_FORMULARIO)[number];

const entero = z.union([z.number(), z.string().regex(/^\d{1,18}$/, 'Debe ser un entero positivo')]).transform(Number).pipe(z.number().int().positive());

/** Cuerpo del webhook: solo `idFormulario` es obligatorio. Los campos desconocidos (p. ej. datos personales) se descartan. */
export const inscripcionSchema = z.object({
  idFormulario: entero,
  idVisita: entero.optional(),
  fechaHoraEnvio: z.iso.datetime({ offset: true }).optional(),
  estado: z.enum(ESTADOS_FORMULARIO).optional()
});
export type Inscripcion = z.infer<typeof inscripcionSchema>;

/** Comparación en tiempo constante (se comparan hashes para no filtrar la longitud del secreto). */
export function secretoValido(suministrado: string | null | undefined, configurado: string | null | undefined) {
  if (!configurado || !suministrado) return false;
  const a = createHash('sha256').update(suministrado).digest();
  const b = createHash('sha256').update(configurado).digest();
  return timingSafeEqual(a, b);
}

type Notificacion = { id: number; formId: number; visitId: number | null; formStatus: string; channel: string | null; campaignId: number | null; campaignName: string | null; occurredAt: string | null; verified: boolean; receivedAt: string };

/** Consulta el OLTP (solo SELECT): estado, canal y campaña de la visita del formulario. Sin datos personales. */
async function verificarEnOltp(idFormulario: number) {
  const [fila] = await queryExternal<Record<string, any>>(oltp(), `SELECT f.IdFormulario, f.IdVisita, f.FechaHoraEnvio, e.Codigo AS estado, ca.Codigo AS canal, v.IdCampana, cm.Nombre AS campana
    FROM mkt.FormularioContacto AS f
    JOIN cat.EstadoFormulario AS e ON e.IdEstadoFormulario = f.IdEstadoFormulario
    JOIN mkt.VisitaLanding AS v ON v.IdVisita = f.IdVisita
    JOIN cat.Canal AS ca ON ca.IdCanal = v.IdCanal
    LEFT JOIN mkt.Campana AS cm ON cm.IdCampana = v.IdCampana
    WHERE f.IdFormulario = :id`, { id: idFormulario });
  return fila || null;
}

const aNotificacion = (row: Record<string, any>): Notificacion => ({
  id: Number(row.id), formId: Number(row.formId), visitId: row.visitId == null ? null : Number(row.visitId), formStatus: String(row.formStatus),
  channel: row.channel ?? null, campaignId: row.campaignId == null ? null : Number(row.campaignId), campaignName: row.campaignName ?? null,
  occurredAt: row.occurredAt ? new Date(row.occurredAt).toISOString() : null, verified: !!row.verified, receivedAt: new Date(row.receivedAt).toISOString()
});

/** Registra la notificación de forma idempotente por `idFormulario`. `creada=false` si ya existía. */
export async function registrarInscripcion(datos: Inscripcion) {
  const tabla = tables().amp_buyer_notifications;
  const previa = plain<any>(await tabla.findOne({ where: { formId: datos.idFormulario } }));
  if (previa) return { creada: false, notificacion: aNotificacion(previa) };

  let verificado: Record<string, any> | null = null;
  try { verificado = await verificarEnOltp(datos.idFormulario); }
  catch (error) { console.error('Webhook de inscripciones: no se pudo verificar en el OLTP', String(error)); }

  const valores = verificado ? {
    visitId: Number(verificado.IdVisita), formStatus: String(verificado.estado), channel: String(verificado.canal),
    campaignId: verificado.IdCampana == null ? null : Number(verificado.IdCampana), campaignName: verificado.campana == null ? null : String(verificado.campana),
    occurredAt: new Date(verificado.FechaHoraEnvio), verified: true
  } : {
    visitId: datos.idVisita ?? null, formStatus: datos.estado || 'DESCONOCIDO', channel: null, campaignId: null, campaignName: null,
    occurredAt: datos.fechaHoraEnvio ? new Date(datos.fechaHoraEnvio) : null, verified: false
  };
  try {
    const fila = await tabla.create({ formId: datos.idFormulario, ...valores, receivedAt: new Date() });
    return { creada: true, notificacion: aNotificacion(plain<any>(fila)!) };
  } catch (error) {
    // Carrera entre dos entregas del mismo formulario: la restricción única garantiza una sola fila.
    const existente = plain<any>(await tabla.findOne({ where: { formId: datos.idFormulario } }));
    if (existente) return { creada: false, notificacion: aNotificacion(existente) };
    throw error;
  }
}

/** Últimas notificaciones (más recientes primero) para el panel en tiempo real. */
export async function ultimasNotificaciones(limite = 20) {
  const filas = await tables().amp_buyer_notifications.findAll({ order: [['receivedAt', 'DESC'], ['id', 'DESC']], limit: limite });
  return filas.map(fila => aNotificacion(fila.get({ plain: true })));
}
