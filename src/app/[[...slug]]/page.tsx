import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import App from '../client';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const { slug = [] } = await params;
  return <App user={user} slug={slug} />;
}
