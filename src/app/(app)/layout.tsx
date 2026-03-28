import { redirect } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import AuthBootstrap from '@/components/auth/AuthBootstrap';
import { getUserFromCookies } from '@/lib/auth-server';

export default async function ProtectedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUserFromCookies();

  if (!user) {
    redirect('/login');
  }

  return (
    <>
      <AuthBootstrap user={user} />
      <AppShell>{children}</AppShell>
    </>
  );
}
