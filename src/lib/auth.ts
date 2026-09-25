import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { tables, plain } from './db';
import type { User, Role } from './types';

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value && process.env.DEMO_MODE !== 'true') throw new Error('SESSION_SECRET requerido');
  return value || 'lapredigital-local-demo-only-change-me';
}
function sign(payload: string) { return createHmac('sha256', secret()).update(payload).digest('base64url'); }
export function sessionToken(id: number) {
  const payload = Buffer.from(JSON.stringify({ id, exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
export function sessionCookie() {
  return { httpOnly: true, secure: process.env.SESSION_COOKIE_SECURE === 'true', sameSite: 'strict' as const, path: '/', maxAge: 8 * 60 * 60 };
}
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get('amp_session')?.value;
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (decoded.exp < Date.now()) return null;
    const row = plain<any>(await tables().amp_users.findByPk(decoded.id));
    return row?.active ? { id: row.id, email: row.email, name: row.name, role: row.role as Role } : null;
  } catch { return null; }
}
export function canApprove(role: Role) { return role === 'ADMIN' || role === 'DIRECCION'; }
export function canConfigure(role: Role) { return role === 'ADMIN'; }
