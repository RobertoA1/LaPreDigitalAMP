import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import Login from './ui';
export default async function LoginPage() { if (await currentUser()) redirect('/'); return <Login />; }
