'use client';

/**
 * Login-time deadline prompt for lab heads. When a lab head lands on the portal
 * with unread reminder notifications (DEADLINE_APPROACHING / REPORT_OVERDUE from
 * the Phase 17 sweep), a modal surfaces them up front so a deadline is hard to
 * miss — the header bell already lists them, this just makes them unmissable.
 *
 * Shown once per browser session (so navigating around doesn't re-pop it);
 * dismissing keeps the notices unread so the bell still carries them. Clicking a
 * reminder marks it read and routes to the report (or to "what's due" when the
 * report has not been started). The API stays the authority — this only reflects it.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, X } from 'lucide-react';
import { NotificationType } from '@ohb/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openNotificationTarget } from '@/lib/notification-nav';
import { Button } from './ui';
import type { Notification } from '@/lib/types';

const REMINDER_TYPES: NotificationType[] = [
  NotificationType.REPORT_OVERDUE,
  NotificationType.DEADLINE_APPROACHING,
];

export function ReminderDialog() {
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const sessionKey = user ? `ohb.reminderPrompt.${user.id}` : null;

  /** Remember we've prompted this session, then close. */
  function dismiss() {
    if (sessionKey) {
      try {
        sessionStorage.setItem(sessionKey, '1');
      } catch {
        /* best-effort */
      }
    }
    setOpen(false);
  }

  // Fetch unread reminders once per session when a lab head arrives. The
  // "already prompted" marker is written on close (not here): React Strict Mode
  // double-invokes this effect in dev, so writing it at open time would let the
  // throwaway first run suppress the real one.
  useEffect(() => {
    if (!user || isAdmin || !sessionKey) return;
    try {
      if (sessionStorage.getItem(sessionKey) === '1') return;
    } catch {
      /* storage unavailable — fall through and prompt */
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.get<Notification[]>('/notifications?unread=true&limit=50');
        if (cancelled) return;
        const reminders = list.filter((n) => REMINDER_TYPES.includes(n.type));
        if (reminders.length === 0) return;
        setItems(reminders);
        setOpen(true);
      } catch {
        /* transient — the header bell still surfaces these */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, sessionKey]);

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const { overdue, approaching } = useMemo(
    () => ({
      overdue: items.filter((n) => n.type === NotificationType.REPORT_OVERDUE),
      approaching: items.filter((n) => n.type === NotificationType.DEADLINE_APPROACHING),
    }),
    [items],
  );

  if (!open || items.length === 0) return null;

  async function openItem(n: Notification) {
    try {
      await api.post(`/notifications/${n.id}/read`);
    } catch {
      /* best-effort — still navigate */
    }
    dismiss();
    await openNotificationTarget(n, false, router);
  }

  const total = items.length;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reminder-dialog-title">
        <div className="modal__head">
          <span className="modal__title" id="reminder-dialog-title">
            <AlertTriangle
              size={18}
              style={{ verticalAlign: '-3px', marginRight: 8, color: 'var(--status-amber)' }}
              aria-hidden
            />
            {total === 1
              ? '1 reporting deadline needs your attention'
              : `${total} reporting deadlines need your attention`}
          </span>
          <button type="button" className="modal__close" onClick={dismiss} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal__body">
          {overdue.length > 0 && (
            <div className="reminder-group">
              <div className="reminder-group__label reminder-group__label--red">
                Overdue ({overdue.length})
              </div>
              {overdue.map((n) => (
                <button key={n.id} type="button" className="reminder-row" onClick={() => void openItem(n)}>
                  {n.body}
                </button>
              ))}
            </div>
          )}
          {approaching.length > 0 && (
            <div className="reminder-group">
              <div className="reminder-group__label reminder-group__label--amber">
                Due soon ({approaching.length})
              </div>
              {approaching.map((n) => (
                <button key={n.id} type="button" className="reminder-row" onClick={() => void openItem(n)}>
                  {n.body}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="modal__foot">
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Dismiss
          </Button>
          <Button
            size="sm"
            onClick={() => {
              dismiss();
              router.push('/lab');
            }}
          >
            Go to my reports
          </Button>
        </div>
      </div>
    </div>
  );
}
