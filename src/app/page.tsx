import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { isMockAuthEnabled } from '@/lib/auth/mock';

// Skip static generation - always redirect at runtime
export const dynamic = 'force-dynamic';

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
