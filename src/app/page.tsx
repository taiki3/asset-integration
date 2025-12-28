import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { isMockAuthEnabled } from '@/lib/auth/mock';

export default async function Home() {
  // In mock auth mode, always go to dashboard
  if (isMockAuthEnabled()) {
    redirect('/dashboard');
  }

  const user = await getUser();

  if (user) {
    redirect('/dashboard');
  } else {
    redirect('/login');
  }
}
