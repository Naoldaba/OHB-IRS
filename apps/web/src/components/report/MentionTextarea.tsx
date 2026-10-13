'use client';

/**
 * A textarea with @mention autocomplete (Phase 24). As the user types `@` plus
 * word characters, a dropdown of mentionable users (passed in — already scoped
 * server-side to people who can see the submission) is shown; picking one inserts
 * `@Full Name `. The set of mentioned user ids is derived from the final text by
 * `extractMentionIds`, so deleting a name from the text drops the mention.
 *
 * The autocomplete trigger token is `@` followed by word characters only, so the
 * space inside an inserted full name does not keep the menu open.
 */

import { useMemo, useRef, useState } from 'react';
import type { MentionableUser } from '@/lib/types';

export interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  users: MentionableUser[];
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}

/** Word-char token immediately before the caret, e.g. the `jo` in "hi @jo". */
const TRIGGER = /(^|\s)@(\w*)$/;

export function MentionTextarea({
  value,
  onChange,
  users,
  placeholder,
  rows = 3,
  disabled,
}: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return users.filter((u) => u.fullName.toLowerCase().includes(q)).slice(0, 6);
  }, [query, users]);

  const open = query !== null && matches.length > 0;

  function syncQuery(el: HTMLTextAreaElement) {
    const before = el.value.slice(0, el.selectionStart ?? el.value.length);
    const m = before.match(TRIGGER);
    setQuery(m ? m[2] : null);
    setActive(0);
  }

  function pick(user: MentionableUser) {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const start = before.search(/@(\w*)$/); // position of the `@` being completed
    if (start < 0) return;
    const insert = `@${user.fullName} `;
    const next = before.slice(0, start) + insert + after;
    onChange(next);
    setQuery(null);
    // Restore the caret just after the inserted mention.
    const pos = start + insert.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === 'Escape') {
      setQuery(null);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={ref}
        className="textarea"
        value={value}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          syncQuery(e.target);
        }}
        onKeyDown={onKeyDown}
        onClick={(e) => syncQuery(e.currentTarget)}
        onBlur={() => setTimeout(() => setQuery(null), 120)}
      />
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 20,
            left: 0,
            right: 0,
            marginTop: 2,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            overflow: 'hidden',
          }}
        >
          {matches.map((u, i) => (
            <button
              key={u.id}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(u);
              }}
              onMouseEnter={() => setActive(i)}
              style={{
                display: 'flex',
                width: '100%',
                gap: 8,
                alignItems: 'center',
                padding: '7px 10px',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                background: i === active ? 'var(--surface-muted)' : 'transparent',
              }}
            >
              <span className="text-sm" style={{ fontWeight: 600 }}>
                {u.fullName}
              </span>
              <span className="text-sm muted">
                {u.role === 'BUREAU_ADMIN' ? 'Bureau' : 'Laboratory'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Derive the mentioned user ids from a finished message: a user is mentioned when
 * `@Full Name` appears followed by a boundary (end, whitespace or punctuation).
 * Longer names are matched first so "@Abdi Mohammed" doesn't also count "@Abdi".
 */
export function extractMentionIds(text: string, users: MentionableUser[]): string[] {
  const ids = new Set<string>();
  const byLength = [...users].sort((a, b) => b.fullName.length - a.fullName.length);
  for (const u of byLength) {
    const token = `@${u.fullName}`;
    const re = new RegExp(escapeRegExp(token) + '(?![\\w])');
    if (re.test(text)) ids.add(u.id);
  }
  return [...ids];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
