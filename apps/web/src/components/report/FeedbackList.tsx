'use client';

/**
 * Threaded feedback. Each root comment or revision request can carry an anchor
 * (a section/field/row/column of the report) and a chain of replies, so the
 * Bureau and the laboratory hold a two-way conversation that is never
 * overwritten. A thread can be resolved (hidden-but-preserved) and messages can
 * @mention users who can see the submission. Pass `onReply` to enable the inline
 * reply box, `onResolve` to enable the resolve toggle, and `users` for @mention
 * autocomplete in replies.
 */

import { Fragment, useState } from 'react';
import { CheckCircle2, CornerDownRight, Reply, RotateCcw } from 'lucide-react';
import { FeedbackType } from '@ohb/shared';
import type { RenderModel } from '@ohb/shared';
import type { Feedback, MentionableUser } from '@/lib/types';
import { Button, Pill } from '@/components/ui';
import { MentionTextarea, extractMentionIds } from './MentionTextarea';
import { anchorLabel } from './anchors';

export interface FeedbackListProps {
  feedback: Feedback[];
  model?: RenderModel | null;
  /** When provided, a reply box is shown under each open thread root. */
  onReply?: (parentId: string, message: string, mentions: string[]) => Promise<void> | void;
  /** When provided, a resolve/reopen toggle is shown on each thread root. */
  onResolve?: (rootId: string, resolved: boolean) => Promise<void> | void;
  /** Mentionable users (scoped to those who can see the submission). */
  users?: MentionableUser[];
  busy?: boolean;
}

export function FeedbackList({ feedback, model, onReply, onResolve, users = [], busy }: FeedbackListProps) {
  if (feedback.length === 0) {
    return <div className="table__empty">No feedback yet.</div>;
  }
  return (
    <div className="stack" style={{ gap: 14 }}>
      {feedback.map((root) => (
        <Thread
          key={root.id}
          root={root}
          model={model}
          onReply={onReply}
          onResolve={onResolve}
          users={users}
          busy={busy}
        />
      ))}
    </div>
  );
}

function Thread({
  root,
  model,
  onReply,
  onResolve,
  users,
  busy,
}: {
  root: Feedback;
  model?: RenderModel | null;
  onReply?: FeedbackListProps['onReply'];
  onResolve?: FeedbackListProps['onResolve'];
  users: MentionableUser[];
  busy?: boolean;
}) {
  const resolved = Boolean(root.resolvedAt);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  // A resolved thread is collapsed by default (hidden-but-preserved).
  const [expanded, setExpanded] = useState(!resolved);

  async function send() {
    if (!onReply || !text.trim()) return;
    await onReply(root.id, text.trim(), extractMentionIds(text, users));
    setText('');
    setOpen(false);
  }

  if (resolved && !expanded) {
    return (
      <div
        className="builder-section"
        style={{ margin: 0, background: 'var(--surface-muted)', opacity: 0.85 }}
      >
        <div className="toolbar">
          <Pill tone="green">
            <CheckCircle2 size={12} /> resolved
          </Pill>
          <span className="text-sm muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {root.author?.fullName ?? 'Bureau'}: {root.message}
          </span>
          <span className="spacer" />
          <Button size="sm" variant="ghost" onClick={() => setExpanded(true)}>
            Show
          </Button>
        </div>
      </div>
    );
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

      {resolved && (
        <div className="text-sm muted" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle2 size={13} /> Resolved{root.resolvedBy ? ` by ${root.resolvedBy.fullName}` : ''}
        </div>
      )}

      {(onReply || onResolve) && (
        <div className="toolbar" style={{ marginTop: 10 }}>
          {onReply && !open && !resolved && (
            <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
              <Reply size={14} /> Reply
            </Button>
          )}
          {onResolve && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => onResolve(root.id, !resolved)}
            >
              {resolved ? (
                <>
                  <RotateCcw size={14} /> Reopen
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} /> Resolve
                </>
              )}
            </Button>
          )}
          {resolved && onReply && (
            <Button size="sm" variant="ghost" onClick={() => setExpanded(false)}>
              Hide
            </Button>
          )}
        </div>
      )}

      {onReply && open && !resolved && (
        <div className="stack" style={{ gap: 8, marginTop: 8 }}>
          <MentionTextarea
            value={text}
            onChange={setText}
            users={users}
            placeholder="Write a reply… use @ to mention someone"
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
  const names = (feedback.mentions ?? [])
    .map((m) => m.mentionedUser?.fullName)
    .filter((n): n is string => Boolean(n));
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
      <div style={{ whiteSpace: 'pre-wrap' }}>{highlightMentions(feedback.message, names)}</div>
    </div>
  );
}

/** Wrap each `@Full Name` that matches a recorded mention in a highlighted span. */
function highlightMentions(message: string, names: string[]) {
  if (names.length === 0) return message;
  // Longest names first so an overlapping shorter name doesn't win.
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const tokens = new Set(sorted.map((n) => `@${n}`));
  // The capturing group means split() keeps the matched `@Name` tokens as their
  // own array entries — a part that equals a known token is a mention.
  const pattern = sorted.map((n) => escapeRegExp(`@${n}`)).join('|');
  const re = new RegExp(`(${pattern})(?![\\w])`, 'g');
  const parts = message.split(re);
  return parts.map((part, i) =>
    tokens.has(part) ? (
      <span key={i} className="mention">
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
