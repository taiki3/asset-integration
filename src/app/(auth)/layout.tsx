import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { Header } from '@/components/header';

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-background">
      <Header user={user} />
      <main className="container mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
