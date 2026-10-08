'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flag } from 'lucide-react';
import { ReportStatus } from '@ohb/shared';
import { api } from '@/lib/api';
import type { SubmissionSummary } from '@/lib/types';
import { Callout, Card, Pill, SegmentedToggle, Spinner, StatusPill } from '@/components/ui';

type Filter = 'all' | 'review' | 'flagged' | 'approved';

const flagCount = (s: SubmissionSummary) => (Array.isArray(s.flags) ? s.flags.length : 0);

export default function AdminSubmissionsPage() {
  const router = useRouter();
  const [subs, setSubs] = useState<SubmissionSummary[] | null>(null);
  const [filter, setFilter] = useState<Filter>('review');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<SubmissionSummary[]>('/submissions')
      .then(setSubs)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  if (error) return <Callout tone="danger" title="Could not load">{error}</Callout>;
  if (!subs)
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );

  const inReview = (s: SubmissionSummary) =>
    s.status === ReportStatus.SUBMITTED ||
    s.status === ReportStatus.RESUBMITTED ||
    s.status === ReportStatus.UNDER_REVIEW;

  const filtered = subs.filter((s) =>
    filter === 'all'
      ? true
      : filter === 'review'
        ? inReview(s)
        : filter === 'flagged'
          ? flagCount(s) > 0
          : s.status === ReportStatus.APPROVED,
  );

  return (
    <>
      <div className="page-head">
        <div className="page-head__row">
          <div>
            <div className="micro-label">Review Queue</div>
            <h1>Submissions</h1>
            <p>Open a submission to review its data, give feedback, or approve it.</p>
          </div>
          <SegmentedToggle<Filter>
            options={[
              { value: 'review', label: 'Needs review' },
              { value: 'flagged', label: 'Flagged' },
              { value: 'approved', label: 'Approved' },
              { value: 'all', label: 'All' },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </div>
      </div>

      <Card>
        {filtered.length === 0 ? (
          <div className="table__empty">Nothing here.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Report</th>
                <th>Laboratory</th>
                <th>Period</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  className="clickable"
                  onClick={() => router.push(`/admin/submissions/${s.id}`)}
                >
                  <td style={{ fontWeight: 600 }}>{s.reportType?.name ?? '—'}</td>
                  <td>{s.laboratory?.name ?? '—'}</td>
                  <td>{s.reportingPeriod?.label ?? '—'}</td>
                  <td>
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <StatusPill status={s.status} />
                      {flagCount(s) > 0 && (
                        <Pill tone="amber">
                          <Flag size={12} /> {flagCount(s)}
                        </Pill>
                      )}
                    </span>
                  </td>
                  <td className="text-sm muted">{new Date(s.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
