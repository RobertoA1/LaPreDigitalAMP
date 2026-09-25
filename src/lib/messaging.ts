import { tables } from './db';
import { OAuth2Client } from 'google-auth-library';
import { contact, event } from './contacts';
import type { Channel } from './types';

export function peruHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', hour: '2-digit', hour12: false }).format(now));
}
export function withinSendHours(now = new Date()) { const hour = peruHour(now); return hour >= 7 && hour < 23; }
function address(channel: Channel, c: Awaited<ReturnType<typeof contact>>, recipientKind: 'STUDENT' | 'GUARDIAN') { return recipientKind === 'GUARDIAN' ? (channel === 'EMAIL' ? c?.guardianEmail : c?.guardianPhone) : (channel === 'EMAIL' ? c?.email : c?.phone); }
function allowed(channel: Channel, c: Awaited<ReturnType<typeof contact>>, recipientKind: 'STUDENT' | 'GUARDIAN') { return recipientKind === 'GUARDIAN' ? c?.guardianConsent : (channel === 'EMAIL' ? c?.consentEmail : c?.consentWhatsapp); }
export function messagePermission(c: Awaited<ReturnType<typeof contact>>, channel: Channel, recipientKind: 'STUDENT' | 'GUARDIAN' = 'STUDENT') {
  if (!allowed(channel, c, recipientKind)) return 'NO_CONSENT' as const;
  if (!address(channel, c, recipientKind)) return 'NO_ADDRESS' as const;
  return 'ALLOWED' as const;
}
export async function sendMessage(contactId: number, channel: Channel, body: string, senderType: 'AGENT' | 'OPERATOR', senderId: string, automatic = false, replying = false, recipientKind: 'STUDENT' | 'GUARDIAN' = 'STUDENT', replyToId?: number) {
  const c = await contact(contactId);
  if (!c) throw new Error('Contacto no encontrado');
  if (c.admissionStatus === 'ADMITTED' && c.stage === 'TURNED') throw new Error('Recuperación detenida: ingresó a la universidad');
  if (c.contactPaused) throw new Error('El contacto está pausado');
  const permission = messagePermission(c, channel, recipientKind);
  if (permission === 'NO_CONSENT') throw new Error(`Sin autorización para ${channel}`);
  if (permission === 'NO_ADDRESS') throw new Error(`Falta dirección para ${channel}`);
  const to = address(channel, c, recipientKind);
  if (!to) throw new Error(`Falta dirección para ${channel}`);
  if (automatic && !replying && !withinSendHours()) throw new Error('Fuera de horario automático (07:00 a 23:00, Lima)');
  let status = 'SIMULATED', externalId: string | null = null;
  if (process.env.DEMO_MODE !== 'true') {
    if (channel === 'WHATSAPP') {
      if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY || !process.env.EVOLUTION_INSTANCE) throw new Error('Evolution API no configurada');
      const response = await fetch(`${process.env.EVOLUTION_API_URL.replace(/\/$/, '')}/message/sendText/${encodeURIComponent(process.env.EVOLUTION_INSTANCE)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: process.env.EVOLUTION_API_KEY },
        body: JSON.stringify({ number: to.replace(/\D/g, ''), text: body })
      });
      if (!response.ok) throw new Error(`Evolution API: HTTP ${response.status}`);
      const payload = await response.json(); externalId = payload?.key?.id || null;
    } else {
      if (!process.env.GMAIL_SENDER) throw new Error('GMAIL_SENDER no configurado');
      let accessToken = process.env.GMAIL_ACCESS_TOKEN;
      if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN) {
        const oauth = new OAuth2Client(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET);
        oauth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
        accessToken = (await oauth.getAccessToken()).token || undefined;
      }
      if (!accessToken) throw new Error('Gmail OAuth no configurado');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || /[\r\n]/.test(to)) throw new Error('Correo del destinatario inválido');
      const subject = 'LaPreDigital';
      const mime = `From: ${process.env.GMAIL_SENDER}\r\nTo: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(body, 'utf8').toString('base64')}`;
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: Buffer.from(mime).toString('base64url') })
      });
      if (!response.ok) throw new Error(`Gmail API: HTTP ${response.status}`);
      const payload = await response.json(); externalId = payload?.id || null;
    }
    status = 'SENT';
  }
  const row = await tables().amp_messages.create({ contactId, channel, direction: 'OUT', body, status, senderType, senderId, recipientKind, externalId, replyToId: replyToId || null, createdAt: new Date() });
  await event(contactId, 'MESSAGE', `${senderType === 'AGENT' ? 'Agente' : 'Operador'}: ${channel} ${status === 'SIMULATED' ? 'simulado' : 'enviado'} a ${recipientKind === 'GUARDIAN' ? 'apoderado' : 'estudiante'}.`, senderType, senderId, { messageId: row.get('id') });
  return row;
}
export async function receiveMessage(contactId: number, channel: Channel, body: string, externalId?: string) {
  const row = await tables().amp_messages.create({ contactId, channel, direction: 'IN', body, status: 'RECEIVED', senderType: 'CONTACT', senderId: String(contactId), recipientKind: 'STUDENT', externalId, createdAt: new Date() });
  await event(contactId, 'INBOUND', `Respuesta recibida por ${channel}.`, 'CONTACT', String(contactId));
  return row;
}

export async function sendToBoth(contactId: number, channel: Channel, body: string, senderId: string, automatic = true, replying = false, guardianBody = body) {
  const c = await contact(contactId);
  if (!c) throw new Error('Contacto no encontrado');
  const student = await sendMessage(contactId, channel, body, 'AGENT', senderId, automatic, replying, 'STUDENT');
  if (messagePermission(c, channel, 'GUARDIAN') === 'ALLOWED') {
    try { await sendMessage(contactId, channel, guardianBody, 'AGENT', senderId, automatic, replying, 'GUARDIAN'); }
    catch (error) { await event(contactId, 'GUARDIAN_DELIVERY_ERROR', `No se pudo contactar al apoderado por ${channel}.`, 'SYSTEM', senderId, { error: String(error) }); }
  }
  return student;
}

export async function sendToPermittedRecipients(contactId: number, channel: Channel, studentBody: string, guardianBody: string, senderId: string, automatic = true, replying = false) {
  const c = await contact(contactId);
  if (!c) throw new Error('Contacto no encontrado');
  const sent: Array<'STUDENT' | 'GUARDIAN'> = [];
  if (messagePermission(c, channel, 'STUDENT') === 'ALLOWED') {
    await sendMessage(contactId, channel, studentBody, 'AGENT', senderId, automatic, replying, 'STUDENT');
    sent.push('STUDENT');
  }
  if (messagePermission(c, channel, 'GUARDIAN') === 'ALLOWED') {
    try {
      await sendMessage(contactId, channel, guardianBody, 'AGENT', senderId, automatic, replying, 'GUARDIAN');
      sent.push('GUARDIAN');
    } catch (error) {
      await event(contactId, 'GUARDIAN_DELIVERY_ERROR', `No se pudo contactar al apoderado por ${channel}.`, 'SYSTEM', senderId, { error: String(error) });
    }
  }
  if (!sent.length) await event(contactId, 'AGENT_NO_CONSENT', `Sin consentimiento o dirección válida para ${channel}; no se enviaron mensajes.`, 'SYSTEM', senderId);
  return sent;
}
