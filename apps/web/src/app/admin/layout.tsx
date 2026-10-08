'use client';

import { RoleName } from '@ohb/shared';
import { Protected } from '@/components/Protected';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Protected role={RoleName.BUREAU_ADMIN}>{children}</Protected>;
}
