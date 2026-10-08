'use client';

/**
 * Client-side route guard: waits for the session check, then redirects anyone
 * who isn't signed in (or lacks the required role) away. This is a UX guard
 * only — every API call is independently authorized server-side.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RoleName } from '@ohb/shared';
import { useAuth, homeFor } from '@/lib/auth';
import { PageShell } from './PageShell';
import { Spinner } from './ui';
import type { ReactNode } from 'react';

export function Protected({
  role,
  children,
}: {
  role?: RoleName;
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
    } else if (role && user.role !== role) {
      router.replace(homeFor(user.role));
    }
  }, [loading, user, role, router]);

  if (loading || !user || (role && user.role !== role)) {
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );
  }

  return <PageShell>{children}</PageShell>;
}
