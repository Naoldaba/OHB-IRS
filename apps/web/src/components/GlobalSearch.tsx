'use client';

/**
 * Header full-text search (Phase 25). A single box searches across report types,
 * submissions and feedback; the API returns role/lab-scoped, ranked, grouped
 * results and this renders them as typed groups, each hit deep-linking to the
 * right detail page (routed by the viewer's role). The server is the authority
 * for scope — a lab head only ever sees its own laboratory's rows.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, FileText, ClipboardList, MessageSquare } from 'lucide-react';
import type { SearchResults } from '@ohb/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const DEBOUNCE_MS = 250;
const MIN_LEN = 2;

const EMPTY: SearchResults = {
  query: '',
  reportTypes: [],
  submissions: [],
  feedback: [],
  total: 0,
};

export function GlobalSearch() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  const base = isAdmin ? '/admin' : '/lab';

  // Debounced query. A stale response (slower than a later keystroke) is dropped
  // via the monotonically increasing request id.
  useEffect(() => {
    const term = q.trim();
    if (term.length < MIN_LEN) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const mine = ++reqId.current;
    const handle = window.setTimeout(async () => {
      try {
        const res = await api.get<SearchResults>(
          `/search?q=${encodeURIComponent(term)}&limit=8`,
        );
        if (reqId.current === mine) {
          setResults(res);
          setLoading(false);
        }
      } catch {
        if (reqId.current === mine) {
          setResults(EMPTY);
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [q]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQ('');
      setResults(EMPTY);
      router.push(href);
    },
    [router],
  );

  const term = q.trim();
  const showPanel = open && term.length >= MIN_LEN;
  const hasResults = results.total > 0;

  return (
    <div className="search" ref={rootRef}>
      <Search size={15} className="search__icon" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        className="search__input"
        placeholder="Search reports, submissions, feedback…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        aria-label="Search"
        autoComplete="off"
      />
      {q && (
        <button
          type="button"
          className="search__clear"
          onClick={() => {
            setQ('');
            setResults(EMPTY);
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}

      {showPanel && (
        <div className="search__panel" role="listbox">
          {loading && !hasResults ? (
            <p className="search__empty">Searching…</p>
          ) : !hasResults ? (
            <p className="search__empty">No matches for “{term}”.</p>
          ) : (
            <>
              {results.reportTypes.length > 0 && (
                <div className="search__group">
                  <div className="search__group-head">
                    <FileText size={12} aria-hidden /> Report types
                  </div>
                  {results.reportTypes.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="search__item"
                      role="option"
                      onClick={() => go(isAdmin ? `/admin/report-types/${r.id}` : '/lab')}
                    >
                      <span className="search__item-title">{r.name}</span>
                      <span className="search__item-meta">{r.code}</span>
                    </button>
                  ))}
                </div>
              )}

              {results.submissions.length > 0 && (
                <div className="search__group">
                  <div className="search__group-head">
                    <ClipboardList size={12} aria-hidden /> Submissions
                  </div>
                  {results.submissions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="search__item"
                      role="option"
                      onClick={() => go(`${base}/submissions/${s.id}`)}
                    >
                      <span className="search__item-title">
                        {s.reportTypeName}
                        <span className="search__pill">{formatStatus(s.status)}</span>
                      </span>
                      <span className="search__item-meta">
                        {s.laboratoryName} · {s.periodLabel}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {results.feedback.length > 0 && (
                <div className="search__group">
                  <div className="search__group-head">
                    <MessageSquare size={12} aria-hidden /> Feedback
                  </div>
                  {results.feedback.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className="search__item"
                      role="option"
                      onClick={() => go(`${base}/submissions/${f.submissionId}`)}
                    >
                      <span className="search__item-title">{f.snippet}</span>
                      <span className="search__item-meta">
                        {f.authorName} · {relativeTime(f.createdAt)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatStatus(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
}

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
