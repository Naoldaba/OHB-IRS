'use client';

/**
 * Bureau audit trail. Lists the immutable audit-log entries the API records for
 * security-sensitive and workflow actions. Read-only — the trail is never
 * edited here; the backend is the authority on what gets written. Filtering and
 * search run client-side over the fetched window (the endpoint returns the most
 * recent entries, newest first).
 */

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { AuditAction } from '@ohb/shared';
import { api } from '@/lib/api';
import type { AuditLogRow } from '@/lib/types';
import { Avatar, Callout, Card, Field, Pill, Spinner } from '@/components/ui';

const PAGE_SIZE = 200;

/** Human-readable label for each audited action. */
const ACTION_LABEL: Record<AuditAction, string> = {
  [AuditAction.LOGIN]: 'Signed in',
  [AuditAction.LOGOUT]: 'Signed out',
  [AuditAction.PASSWORD_RESET_REQUESTED]: 'Password reset requested',
  [AuditAction.PASSWORD_RESET_COMPLETED]: 'Password reset completed',
  [AuditAction.LAB_CREATED]: 'Laboratory created',
  [AuditAction.LAB_UPDATED]: 'Laboratory updated',
  [AuditAction.USER_CREATED]: 'User created',
  [AuditAction.USER_UPDATED]: 'User updated',
  [AuditAction.REPORT_CREATED]: 'Report created',
  [AuditAction.REPORT_UPDATED]: 'Report updated',
  [AuditAction.REPORT_SUBMITTED]: 'Report submitted',
  [AuditAction.REPORT_REVIEW_STARTED]: 'Review started',
  [AuditAction.REPORT_FEEDBACK_ADDED]: 'Feedback added',
  [AuditAction.REPORT_REVISION_REQUESTED]: 'Revision requested',
  [AuditAction.REPORT_RESUBMITTED]: 'Report resubmitted',
  [AuditAction.REPORT_APPROVED]: 'Report approved',
  [AuditAction.REPORT_EXPORTED]: 'Report exported',
  [AuditAction.REPORT_ATTACHMENT_ADDED]: 'Attachment added',
  [AuditAction.REPORT_ATTACHMENT_REMOVED]: 'Attachment removed',
  [AuditAction.DEFINITION_VERSION_CREATED]: 'Definition version created',
  [AuditAction.DEFINITION_VERSION_PUBLISHED]: 'Definition version published',
  [AuditAction.RULE_CREATED]: 'Rule created',
  [AuditAction.RULE_UPDATED]: 'Rule updated',
  [AuditAction.RULE_DELETED]: 'Rule deleted',
  [AuditAction.RULE_TEMPLATE_CREATED]: 'Rule template created',
  [AuditAction.RULE_TEMPLATE_UPDATED]: 'Rule template updated',
};

type Tone = 'green' | 'amber' | 'red' | 'slate';

/** Tone chosen by the kind of action so the trail is scannable at a glance. */
function toneFor(action: AuditAction): Tone {
  if (action.includes('DELETED')) return 'red';
  if (action.includes('REVISION')) return 'amber';
  if (
    action.includes('CREATED') ||
    action.includes('APPROVED') ||
    action.includes('PUBLISHED') ||
    action.includes('SUBMITTED')
  )
    return 'green';
  return 'slate';
}

function labelFor(action: AuditAction): string {
  return ACTION_LABEL[action] ?? action;
}

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<AuditAction | 'all'>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    api
      .get<AuditLogRow[]>(`/audit-logs?limit=${PAGE_SIZE}`)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  // Only the actions actually present in this window, so the dropdown stays useful.
  const presentActions = useMemo(() => {
    const set = new Set<AuditAction>();
    (rows ?? []).forEach((r) => set.add(r.action));
    return Array.from(set).sort((a, b) => labelFor(a).localeCompare(labelFor(b)));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (actionFilter !== 'all' && r.action !== actionFilter) return false;
      if (!q) return true;
      const haystack = [
        r.actor?.fullName,
        r.actor?.email,
        r.entityType,
        r.entityId,
        labelFor(r.action),
        r.metadata ? JSON.stringify(r.metadata) : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, actionFilter, query]);

  if (error) return <Callout tone="danger" title="Could not load">{error}</Callout>;
  if (!rows)
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );

  return (
    <>
      <div className="page-head">
        <div className="micro-label">Administration</div>
        <h1>Audit trail</h1>
        <p>
          Security-sensitive and reporting-workflow actions, newest first. Entries are
          immutable — this is a record, not an editable list. Showing the most recent {rows.length}.
        </p>
      </div>

      <Card>
        <div className="split" style={{ gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 16 }}>
          <Field label="Action">
            <select
              className="select"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value as AuditAction | 'all')}
            >
              <option value="all">All actions</option>
              {presentActions.map((a) => (
                <option key={a} value={a}>
                  {labelFor(a)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Search" hint="Matches actor, entity, and details.">
            <div style={{ position: 'relative' }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-faint)',
                }}
              />
              <input
                className="input"
                style={{ paddingLeft: 32 }}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the trail…"
              />
            </div>
          </Field>
        </div>

        {filtered.length === 0 ? (
          <div className="table__empty">
            {rows.length === 0 ? 'No audit entries recorded yet.' : 'No entries match the filter.'}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="text-sm muted" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td>
                    {r.actor ? (
                      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                        <Avatar name={r.actor.fullName} size={28} />
                        <span>
                          <div style={{ fontWeight: 600 }}>{r.actor.fullName}</div>
                          <div className="text-sm muted">{r.actor.email}</div>
                        </span>
                      </span>
                    ) : (
                      <span className="text-sm muted">System</span>
                    )}
                  </td>
                  <td>
                    <Pill tone={toneFor(r.action)}>{labelFor(r.action)}</Pill>
                  </td>
                  <td className="text-sm">
                    {r.entityType ? (
                      <>
                        <span>{r.entityType}</span>
                        {r.entityId && (
                          <div className="text-sm muted" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                            {r.entityId}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <MetadataCell metadata={r.metadata} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function MetadataCell({ metadata }: { metadata?: Record<string, unknown> | null }) {
  const entries = metadata ? Object.entries(metadata) : [];
  if (entries.length === 0) return <span className="muted">—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {entries.map(([key, value]) => (
        <span key={key} className="text-sm" style={{ color: 'var(--text-faint)' }}>
          <strong style={{ fontWeight: 600, color: 'var(--text-muted, inherit)' }}>{key}:</strong>{' '}
          {formatValue(value)}
        </span>
      ))}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
