'use client';

/**
 * Client-side route guard: waits for the session check, then redirects anyone
 * who isn't signed in (or whose scope doesn't match the portal) away. This is a
 * UX guard only — every API call is independently authorized server-side.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RoleScope } from '@ohb/shared';
import { useAuth, homeFor } from '@/lib/auth';
import { PageShell } from './PageShell';
import { Spinner } from './ui';
import type { ReactNode } from 'react';

export function Protected({
  scope,
  children,
}: {
  scope?: RoleScope;
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
    } else if (user.mustChangePassword) {
      router.replace('/change-password');
    } else if (scope && user.scope !== scope) {
      router.replace(homeFor(user.scope));
    }
  }, [loading, user, scope, router]);

  if (loading || !user || user.mustChangePassword || (scope && user.scope !== scope)) {
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );
  }

  return <PageShell>{children}</PageShell>;
}
