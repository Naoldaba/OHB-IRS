'use client';

/**
 * Submission activity timeline (Phase 21). Renders the submission's lifecycle —
 * created → submitted → review → feedback → revision → resubmit → approved — as
 * an ordered vertical timeline. Every entry is a real audit / feedback / version
 * record returned by `GET /submissions/:id/timeline` (access-scoped server-side,
 * so a lab only ever sees its own); nothing is synthesized on the client.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  FilePlus2,
  MessageSquare,
  PlayCircle,
  RotateCcw,
  Send,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { TimelineEvent, TimelineKind } from '@/lib/types';
import { Spinner } from '@/components/ui';

const KIND_META: Record<
  TimelineKind,
  { icon: React.ReactNode; color: string }
> = {
  created: { icon: <FilePlus2 size={14} />, color: 'var(--state-pending)' },
  submitted: { icon: <Send size={14} />, color: 'var(--state-review)' },
  resubmitted: { icon: <RotateCcw size={14} />, color: 'var(--state-review)' },
  review_started: { icon: <PlayCircle size={14} />, color: 'var(--state-review)' },
  revision_requested: { icon: <RotateCcw size={14} />, color: 'var(--state-revision)' },
  feedback: { icon: <MessageSquare size={14} />, color: 'var(--primary-accent)' },
  approved: { icon: <Check size={14} />, color: 'var(--state-approved)' },
};

export function SubmissionTimeline({
  submissionId,
  /** Bump to refetch (e.g. after an action changes the submission). */
  refreshKey,
}: {
  submissionId: string;
  refreshKey?: unknown;
}) {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<TimelineEvent[]>(`/submissions/${submissionId}/timeline`)
      .then(setEvents)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load timeline'));
  }, [submissionId]);

  useEffect(() => {
    setEvents(null);
    setError(null);
    load();
  }, [load, refreshKey]);

  if (error) return <div className="text-sm muted">{error}</div>;
  if (!events) return <Spinner />;
  if (events.length === 0) {
    return <div className="table__empty">No activity recorded yet.</div>;
  }

  return (
    <ol className="timeline">
      {events.map((e) => {
        const meta = KIND_META[e.kind];
        return (
          <li className="timeline__item" key={e.id}>
            <span className="timeline__dot" style={{ background: meta.color }}>
              {meta.icon}
            </span>
            <div className="timeline__body">
              <div className="timeline__head">
                <strong>{e.title}</strong>
                {e.versionNumber !== undefined && (
                  <span className="timeline__tag">v{e.versionNumber}</span>
                )}
                <span className="spacer" />
                <time className="text-sm muted" dateTime={e.at}>
                  {new Date(e.at).toLocaleString()}
                </time>
              </div>
              <div className="text-sm muted">{e.actor?.fullName ?? 'System'}</div>
              {e.message && <div className="timeline__message">{e.message}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
