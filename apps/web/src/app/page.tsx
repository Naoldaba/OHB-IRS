'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, homeFor } from '@/lib/auth';
import { Spinner } from '@/components/ui';

export default function IndexPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? homeFor(user.scope) : '/login');
  }, [loading, user, router]);

  return (
    <div className="loading-screen">
      <Spinner />
    </div>
  );
}
