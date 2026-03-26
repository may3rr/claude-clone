'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { initSessionsCache, migrateLocalStorageToServer } from '@/lib/chat-storage';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      router.push('/login');
      return;
    }

    // Initialize sessions from server, migrate localStorage data if any
    async function init() {
      await migrateLocalStorageToServer();
      await initSessionsCache();
      setReady(true);
    }

    void init();
  }, [router]);

  if (!ready) return null;

  return <>{children}</>;
}
