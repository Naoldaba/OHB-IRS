'use client';

import { RoleName } from '@ohb/shared';
import { Protected } from '@/components/Protected';
import { ReminderDialog } from '@/components/ReminderDialog';

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <Protected role={RoleName.REGIONAL_LAB_HEAD}>
      <ReminderDialog />
      {children}
    </Protected>
  );
}
