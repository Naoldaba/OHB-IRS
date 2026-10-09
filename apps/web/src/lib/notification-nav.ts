import { api } from './api';
import type { Notification } from './types';

/**
 * Follow a notification's deep link, shared by the header bell and the lab
 * reminder dialog so both behave identically.
 *
 * - A notice tied to a submission opens it (role-routed).
 * - A reminder whose report has not been started yet carries slot hints
 *   (`reportTypeId` + `reportingPeriodId`) instead of a submission: create the
 *   draft and open it — the "route to the create/continue draft" the plan calls
 *   for. If the draft already exists (409) we fall back to the lab dashboard,
 *   where "What's due" offers Continue.
 * - Anything else sends a lab user to their dashboard; admins stay put.
 */
export async function openNotificationTarget(
  n: Notification,
  isAdmin: boolean,
  router: { push: (href: string) => void },
): Promise<void> {
  if (n.submissionId) {
    router.push(`${isAdmin ? '/admin' : '/lab'}/submissions/${n.submissionId}`);
    return;
  }
  if (!isAdmin && n.reportTypeId && n.reportingPeriodId) {
    try {
      const created = await api.post<{ id: string }>('/submissions', {
        reportTypeId: n.reportTypeId,
        reportingPeriodId: n.reportingPeriodId,
      });
      router.push(`/lab/submissions/${created.id}`);
    } catch {
      // Already started (or a transient error) — the dashboard shows the slot.
      router.push('/lab');
    }
    return;
  }
  if (!isAdmin) router.push('/lab');
}
