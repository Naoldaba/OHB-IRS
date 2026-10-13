'use client';

import { Protected } from '@/components/Protected';

// No role restriction: every authenticated user manages their own profile.
export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <Protected>{children}</Protected>;
}
