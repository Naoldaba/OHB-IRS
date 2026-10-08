'use client';

/**
 * Threaded feedback. Each root comment or revision request can carry an anchor
 * (a section/field/row/column of the report) and a chain of replies, so the
 * Bureau and the laboratory hold a two-way conversation that is never
 * overwritten. Pass `onReply` to enable the inline reply box.
 */

import { useState } from 'react';
import { CornerDownRight, Reply } from 'lucide-react';
import { FeedbackType } from '@ohb/shared';
import type { RenderModel } from '@ohb/shared';
import type { Feedback } from '@/lib/types';
import { Button, Pill, Textarea } from '@/components/ui';
import { anchorLabel } from './anchors';

export interface FeedbackListProps {
  feedback: Feedback[];
  model?: RenderModel | null;
  /** When provided, a reply box is shown under each thread root. */
  onReply?: (parentId: string, message: string) => Promise<void> | void;
  busy?: boolean;
}

export function FeedbackList({ feedback, model, onReply, busy }: FeedbackListProps) {
  if (feedback.length === 0) {
    return <div className="table__empty">No feedback yet.</div>;
  }
  return (
    <div className="stack" style={{ gap: 14 }}>
      {feedback.map((root) => (
        <Thread key={root.id} root={root} model={model} onReply={onReply} busy={busy} />
      ))}
    </div>
  );
}

function Thread({
  root,
  model,
  onReply,
  busy,
}: {
  root: Feedback;
  model?: RenderModel | null;
  onReply?: (parentId: string, message: string) => Promise<void> | void;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  async function send() {
    if (!onReply || !text.trim()) return;
    await onReply(root.id, text.trim());
    setText('');
    setOpen(false);
  }

  return (
    <div className="builder-section" style={{ margin: 0, background: 'var(--surface-muted)' }}>
      <FeedbackBody feedback={root} model={model} />

      {root.replies && root.replies.length > 0 && (
        <div className="stack" style={{ gap: 10, marginTop: 10, paddingLeft: 14, borderLeft: '2px solid var(--border)' }}>
          {root.replies.map((r) => (
            <div key={r.id}>
              <div className="text-sm muted" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                <CornerDownRight size={13} /> reply
              </div>
              <FeedbackBody feedback={r} model={model} compact />
            </div>
          ))}
        </div>
      )}

      {onReply && (
        <div style={{ marginTop: 10 }}>
          {open ? (
            <div className="stack" style={{ gap: 8 }}>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write a reply…"
                rows={2}
              />
              <div className="toolbar">
                <Button size="sm" disabled={busy || !text.trim()} onClick={send}>
                  Send reply
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
              <Reply size={14} /> Reply
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function FeedbackBody({
  feedback,
  model,
  compact,
}: {
  feedback: Feedback;
  model?: RenderModel | null;
  compact?: boolean;
}) {
  const anchor = anchorLabel(model, feedback.sectionKey, feedback.fieldKey);
  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 6 }}>
        <strong className="text-sm">{feedback.author?.fullName ?? 'Bureau'}</strong>
        {!compact &&
          (feedback.type === FeedbackType.REVISION_REQUEST ? (
            <Pill tone="red">revision request</Pill>
          ) : (
            <Pill tone="slate">comment</Pill>
          ))}
        <span className="spacer" />
        <span className="text-sm muted">{new Date(feedback.createdAt).toLocaleString()}</span>
      </div>
      {anchor && (
        <div className="text-sm muted" style={{ marginBottom: 4 }}>
          Re: <span className="mono">{anchor}</span>
        </div>
      )}
      <div style={{ whiteSpace: 'pre-wrap' }}>{feedback.message}</div>
    </div>
  );
}
