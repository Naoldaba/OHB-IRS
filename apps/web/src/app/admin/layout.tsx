'use client';

import { RoleScope } from '@ohb/shared';
import { Protected } from '@/components/Protected';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Protected scope={RoleScope.BUREAU}>{children}</Protected>;
}
