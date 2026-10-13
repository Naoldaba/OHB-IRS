'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, FilePlus2 } from 'lucide-react';
import { ReportStatus } from '@ohb/shared';
import { api, ApiError } from '@/lib/api';
import type { ReportType, ReportingPeriod, SubmissionSummary } from '@/lib/types';
import {
  ActionDot,
  Button,
  Callout,
  Card,
  Field,
  SegmentedToggle,
  Spinner,
  StatusPill,
} from '@/components/ui';
import { LabDashboard } from '@/components/LabDashboard';

type SubFilter = 'action' | 'review' | 'drafts' | 'approved' | 'all';
type SortKey = 'period' | 'updated';
type SortDir = 'asc' | 'desc';

const IN_REVIEW: ReportStatus[] = [
  ReportStatus.SUBMITTED,
  ReportStatus.RESUBMITTED,
  ReportStatus.UNDER_REVIEW,
];

function matchesFilter(s: SubmissionSummary, filter: SubFilter): boolean {
  switch (filter) {
    case 'action':
      return s.status === ReportStatus.REVISION_REQUIRED;
    case 'review':
      return IN_REVIEW.includes(s.status);
    case 'drafts':
      return s.status === ReportStatus.DRAFT;
    case 'approved':
      return s.status === ReportStatus.APPROVED;
    default:
      return true;
  }
}

function sortSubs(subs: SubmissionSummary[], key: SortKey, dir: SortDir): SubmissionSummary[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...subs].sort((a, b) => {
    if (key === 'period') {
      const ay = a.reportingPeriod?.year ?? 0;
      const by = b.reportingPeriod?.year ?? 0;
      if (ay !== by) return (ay - by) * factor;
      const an = a.reportingPeriod?.periodNumber ?? 0;
      const bn = b.reportingPeriod?.periodNumber ?? 0;
      return (an - bn) * factor;
    }
    return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * factor;
  });
}

export default function LabHome() {
  const router = useRouter();
  const [subs, setSubs] = useState<SubmissionSummary[] | null>(null);
  const [types, setTypes] = useState<ReportType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SubFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  async function reload() {
    const [s, t] = await Promise.all([
      api.get<SubmissionSummary[]>('/submissions'),
      api.get<ReportType[]>('/report-types'),
    ]);
    setSubs(s);
    setTypes(t);
  }

  useEffect(() => {
    reload().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  const actionCount = useMemo(
    () => (subs ?? []).filter((s) => s.status === ReportStatus.REVISION_REQUIRED).length,
    [subs],
  );

  // Open the inbox straight on the action-required segment when something awaits.
  useEffect(() => {
    if (actionCount > 0) setFilter('action');
  }, [actionCount]);

  const visible = useMemo(() => {
    const picked = (subs ?? []).filter((s) => matchesFilter(s, filter));
    return sortSubs(picked, sortKey, sortDir);
  }, [subs, filter, sortKey, sortDir]);

  if (error && !subs) return <Callout tone="danger" title="Could not load">{error}</Callout>;
  if (!subs)
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sortCaret = (key: SortKey) =>
    sortKey === key ? (
      sortDir === 'desc' ? (
        <ChevronDown size={13} className="sort-caret" />
      ) : (
        <ChevronUp size={13} className="sort-caret" />
      )
    ) : (
      <ChevronDown size={13} className="sort-caret" />
    );

  return (
    <>
      <div className="page-head">
        <div className="micro-label">Regional Laboratory</div>
        <h1>My reports</h1>
        <p>Create a report for a period, fill it in, and submit it for review.</p>
      </div>

      <LabDashboard />

      <div className="split">
        <NewSubmissionCard
          types={types}
          submissions={subs}
          onCreated={(subId) => router.push(`/lab/submissions/${subId}`)}
        />

        <Card
          title="Submissions"
          actions={
            subs.length > 0 ? (
              <SegmentedToggle<SubFilter>
                options={[
                  {
                    value: 'action',
                    label: (
                      <span className="seg-label">
                        Needs your action
                        {actionCount > 0 && <ActionDot count={actionCount} />}
                      </span>
                    ),
                  },
                  { value: 'review', label: 'In review' },
                  { value: 'drafts', label: 'Drafts' },
                  { value: 'approved', label: 'Approved' },
                  { value: 'all', label: 'All' },
                ]}
                value={filter}
                onChange={setFilter}
              />
            ) : undefined
          }
        >
          {subs.length === 0 ? (
            <div className="table__empty">No reports yet. Start one on the left.</div>
          ) : visible.length === 0 ? (
            <div className="table__empty">
              {filter === 'action'
                ? 'Nothing needs your action right now.'
                : 'No reports match this filter.'}
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th
                    className={`sortable${sortKey === 'period' ? ' is-sorted' : ''}`}
                    onClick={() => toggleSort('period')}
                  >
                    Period {sortCaret('period')}
                  </th>
                  <th>Status</th>
                  <th
                    className={`sortable${sortKey === 'updated' ? ' is-sorted' : ''}`}
                    onClick={() => toggleSort('updated')}
                  >
                    Updated {sortCaret('updated')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr
                    key={s.id}
                    className="clickable"
                    onClick={() => router.push(`/lab/submissions/${s.id}`)}
                  >
                    <td style={{ fontWeight: 600 }}>{s.reportType?.name ?? '—'}</td>
                    <td>{s.reportingPeriod?.label ?? '—'}</td>
                    <td>
                      <StatusPill status={s.status} />
                    </td>
                    <td className="text-sm muted">{new Date(s.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}

/** Rank a submission's reporting period (year, then period number) for "latest" comparisons. */
function periodRank(s: SubmissionSummary): number {
  return (s.reportingPeriod?.year ?? 0) * 100 + (s.reportingPeriod?.periodNumber ?? 0);
}

function NewSubmissionCard({
  types,
  submissions,
  onCreated,
}: {
  types: ReportType[];
  submissions: SubmissionSummary[];
  onCreated: (submissionId: string) => void;
}) {
  const [reportTypeId, setReportTypeId] = useState('');
  const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [prefill, setPrefill] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPeriodId('');
    if (!reportTypeId) {
      setPeriods([]);
      return;
    }
    api
      .get<ReportingPeriod[]>(`/reporting-periods?reportTypeId=${reportTypeId}`)
      .then(setPeriods)
      .catch(() => setPeriods([]));
  }, [reportTypeId]);

  // The most recent earlier submission of the same report type (excluding the
  // period being created) whose values can seed the new draft (Phase 16).
  const priorSubmission = useMemo(() => {
    if (!reportTypeId) return null;
    const candidates = submissions.filter(
      (s) => s.reportTypeId === reportTypeId && s.reportingPeriodId !== periodId,
    );
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => periodRank(b) - periodRank(a))[0];
  }, [submissions, reportTypeId, periodId]);

  // Drop the prefill choice whenever it no longer applies.
  useEffect(() => {
    if (!priorSubmission) setPrefill(false);
  }, [priorSubmission]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const created = await api.post<SubmissionSummary>('/submissions', {
        reportTypeId,
        reportingPeriodId: periodId,
        ...(prefill && priorSubmission
          ? { copyFromSubmissionId: priorSubmission.id }
          : {}),
      });
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create report');
      setBusy(false);
    }
  }

  return (
    <Card title="Start a new report">
      <form onSubmit={submit}>
        {error && (
          <div style={{ marginBottom: 12 }}>
            <Callout tone="danger">{error}</Callout>
          </div>
        )}
        <Field label="Report type">
          <select
            className="select"
            value={reportTypeId}
            onChange={(e) => setReportTypeId(e.target.value)}
            required
          >
            <option value="">— Select report —</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Reporting period"
          hint={reportTypeId && periods.length === 0 ? 'No open periods for this report yet.' : undefined}
        >
          <select
            className="select"
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
            disabled={!reportTypeId || periods.length === 0}
            required
          >
            <option value="">— Select period —</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.year} E.C.)
              </option>
            ))}
          </select>
        </Field>
        {priorSubmission && (
          <Field label="Prefill">
            <label className="checkbox-row" style={{ padding: '9px 0' }}>
              <input
                type="checkbox"
                checked={prefill}
                onChange={(e) => setPrefill(e.target.checked)}
              />
              <span className="text-sm muted">
                Start from {priorSubmission.reportingPeriod?.label ?? 'last period'}
                &rsquo;s values
              </span>
            </label>
          </Field>
        )}
        <Button type="submit" disabled={busy || !reportTypeId || !periodId}>
          <FilePlus2 size={16} /> Create draft
        </Button>
      </form>
    </Card>
  );
}
