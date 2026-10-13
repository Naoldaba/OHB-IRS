'use client';

/**
 * Notification inbox for the app header: a bell with an unread badge and a
 * dropdown of recent notifications. The unread count is polled (there is no
 * socket layer yet); the full list is fetched when the panel opens. Clicking a
 * notice marks it read and deep-links to the submission it concerns, routed by
 * the viewer's role. The API is the authority — this only reflects it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openNotificationTarget } from '@/lib/notification-nav';
import type { Notification } from '@/lib/types';

const POLL_MS = 45_000;

export function NotificationBell() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      const { count } = await api.get<{ count: number }>('/notifications/unread-count');
      setCount(count);
    } catch {
      /* transient — leave the last known count in place */
    }
  }, []);

  // Poll the unread count while mounted.
  useEffect(() => {
    void refreshCount();
    const id = window.setInterval(() => void refreshCount(), POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshCount]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        const list = await api.get<Notification[]>('/notifications?limit=20');
        setItems(list);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
  }

  async function openItem(n: Notification) {
    if (!n.readAt) {
      // Optimistic: mark read locally, then persist.
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)));
      setCount((c) => Math.max(0, c - 1));
      try {
        await api.post(`/notifications/${n.id}/read`);
      } catch {
        void refreshCount();
      }
    }
    setOpen(false);
    await openNotificationTarget(n, isAdmin, router);
  }

  async function markAll() {
    setItems((prev) => prev.map((i) => (i.readAt ? i : { ...i, readAt: new Date().toISOString() })));
    setCount(0);
    try {
      await api.post('/notifications/read-all');
    } catch {
      void refreshCount();
    }
  }

  return (
    <div className="notif" ref={rootRef}>
      <button
        type="button"
        className="btn btn--ghost btn--sm notif__trigger"
        onClick={toggle}
        aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ''}`}
        aria-expanded={open}
      >
        <Bell size={16} />
        {count > 0 && <span className="notif__badge">{count > 99 ? '99+' : count}</span>}
      </button>

      {open && (
        <div className="notif__panel" role="menu">
          <div className="notif__head">
            <span className="notif__title">Notifications</span>
            {count > 0 && (
              <button type="button" className="notif__markall" onClick={markAll}>
                <Check size={13} style={{ verticalAlign: '-2px', marginRight: 3 }} />
                Mark all read
              </button>
            )}
          </div>

          <div className="notif__list">
            {loading ? (
              <p className="notif__empty">Loading…</p>
            ) : items.length === 0 ? (
              <p className="notif__empty">You&apos;re all caught up.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`notif__item${n.readAt ? '' : ' notif__item--unread'}`}
                  onClick={() => void openItem(n)}
                  role="menuitem"
                >
                  <span className="notif__item-title">
                    {!n.readAt && <span className="notif__dot" aria-hidden />}
                    {n.title}
                  </span>
                  <span className="notif__item-body">{n.body}</span>
                  <span className="notif__item-time">{relativeTime(n.createdAt)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Compact relative time: "just now", "5m ago", "3h ago", "2d ago", else a date. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(then).toLocaleDateString();
}
