import bcrypt from 'bcryptjs';
import { getDb, tables } from '../src/lib/db';
import type { Role } from '../src/lib/types';

async function main() {
  const [email, role, ...nameParts] = process.argv.slice(2);
  const password = process.env.AMP_BOOTSTRAP_PASSWORD;
  const name = nameParts.join(' ');
  if (!email || !['ADMIN', 'DIRECCION', 'OPERADOR'].includes(role) || !name || !password || password.length < 12) throw new Error('Uso: AMP_BOOTSTRAP_PASSWORD=<12+ caracteres> npm run user:create -- correo@dominio.com ADMIN Nombre Completo');
  await getDb().authenticate();
  const db = tables();
  if (await db.amp_users.findOne({ where: { email: email.toLowerCase() } })) throw new Error('Ya existe ese correo');
  await db.amp_users.create({ email: email.toLowerCase(), role: role as Role, name, passwordHash: await bcrypt.hash(password, 12), active: true, createdAt: new Date() });
  console.log(`Usuario ${email} creado con rol ${role}`);
  await getDb().close();
}
main().catch(error => { console.error(error); process.exit(1); });
