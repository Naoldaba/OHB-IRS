'use client';

import { RoleScope } from '@ohb/shared';
import { Protected } from '@/components/Protected';
import { ReminderDialog } from '@/components/ReminderDialog';

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <Protected scope={RoleScope.LAB}>
      <ReminderDialog />
      {children}
    </Protected>
  );
}
