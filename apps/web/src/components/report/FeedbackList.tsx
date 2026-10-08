'use client';

import { FeedbackType } from '@ohb/shared';
import type { Feedback } from '@/lib/types';
import { Pill } from '@/components/ui';

export function FeedbackList({ feedback }: { feedback: Feedback[] }) {
  if (feedback.length === 0) {
    return <div className="table__empty">No feedback yet.</div>;
  }
  return (
    <div className="stack" style={{ gap: 12 }}>
      {feedback.map((f) => (
        <div
          key={f.id}
          className="builder-section"
          style={{ margin: 0, background: 'var(--surface-muted)' }}
        >
          <div className="toolbar" style={{ marginBottom: 6 }}>
            <strong className="text-sm">{f.author?.fullName ?? 'Bureau'}</strong>
            {f.type === FeedbackType.REVISION_REQUEST ? (
              <Pill tone="red">revision request</Pill>
            ) : (
              <Pill tone="slate">comment</Pill>
            )}
            <span className="spacer" />
            <span className="text-sm muted">{new Date(f.createdAt).toLocaleString()}</span>
          </div>
          {(f.sectionKey || f.fieldKey) && (
            <div className="text-sm muted" style={{ marginBottom: 4 }}>
              Re: <span className="mono">{[f.sectionKey, f.fieldKey].filter(Boolean).join('.')}</span>
            </div>
          )}
          <div>{f.message}</div>
        </div>
      ))}
    </div>
  );
}
