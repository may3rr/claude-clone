'use client';

import { useLayoutEffect } from 'react';
import { saveStoredAuthState } from '@/lib/auth-events';

interface AuthBootstrapProps {
  user: {
    shortname: string;
    displayName: string;
    role: string;
  };
}

export default function AuthBootstrap({ user }: AuthBootstrapProps) {
  useLayoutEffect(() => {
    saveStoredAuthState(user);
  }, [user]);

  return null;
}
