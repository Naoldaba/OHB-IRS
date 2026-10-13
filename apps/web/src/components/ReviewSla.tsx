'use client';

/**
 * Bureau review SLA / time-to-review (Phase 21) — the accountability complement
 * to lab timeliness. Every figure comes from `GET /analytics/review-sla`, which
 * derives latencies from immutable audit timestamps; nothing is computed or
 * assumed here. Bureau-wide (not affected by the report-type filter).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, Hourglass, Timer } from 'lucide-react';
import { api } from '@/lib/api';
import type { OldestAwaitingReview, ReviewSlaAnalytics, SlaStat } from '@/lib/types';
import { Callout, Card, Spinner, StatusPill } from '@/components/ui';

/** Human-friendly duration from a number of hours (e.g. "3h 10m", "2d 4h"). */
function formatHours(hours: number | null): string {
  if (hours == null) return '—';
  const totalMinutes = Math.round(hours * 60);
  if (totalMinutes < 1) return '< 1m';
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const days = Math.floor(totalMinutes / (60 * 24));
  const rem = totalMinutes - days * 60 * 24;
  const h = Math.floor(rem / 60);
  const m = rem % 60;
  if (days > 0) return `${days}d${h ? ` ${h}h` : ''}`;
  return `${h}h${m ? ` ${m}m` : ''}`;
}

export function ReviewSla() {
  const [data, setData] = useState<ReviewSlaAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ReviewSlaAnalytics>('/analytics/review-sla')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  if (error) {
    return (
      <Card title="Review timeliness">
        <Callout tone="danger">{error}</Callout>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card title="Review timeliness">
        <div className="loading-screen">
          <Spinner />
        </div>
      </Card>
    );
  }

  const noData =
    data.timeToFirstReview.count === 0 &&
    data.timeToApproval.count === 0 &&
    data.oldestAwaitingReview.length === 0;

  return (
    <Card
      title="Review timeliness (SLA)"
      desc="How quickly the Bureau acts on submitted reports, measured from the audit trail. Bureau-wide."
    >
      {noData ? (
        <Callout title="No review activity yet">
          Timeliness appears here once laboratories submit reports and the Bureau begins reviewing
          them.
        </Callout>
      ) : (
        <>
          <div className="grid grid--3" style={{ marginBottom: 18 }}>
            <SlaTile
              icon={<Timer size={14} />}
              label="Median time to first review"
              stat={data.timeToFirstReview}
              pick="medianHours"
            />
            <SlaTile
              icon={<Clock size={14} />}
              label="Average time to first review"
              stat={data.timeToFirstReview}
              pick="averageHours"
            />
            <SlaTile
              icon={<Hourglass size={14} />}
              label="Median time to approval"
              stat={data.timeToApproval}
              pick="medianHours"
            />
          </div>

          <div className="micro-label" style={{ marginBottom: 8 }}>
            Oldest awaiting a decision
          </div>
          <OldestList rows={data.oldestAwaitingReview} />
        </>
      )}
    </Card>
  );
}

function SlaTile({
  icon,
  label,
  stat,
  pick,
}: {
  icon: React.ReactNode;
  label: string;
  stat: SlaStat;
  pick: 'medianHours' | 'averageHours';
}) {
  return (
    <div className="stat">
      <div className="stat__label">
        {icon}
        {label}
      </div>
      <div className="stat__value">{formatHours(stat[pick])}</div>
      <div className="stat__sub">
        {stat.count > 0 ? `Across ${stat.count} review${stat.count === 1 ? '' : 's'}` : 'No data yet'}
      </div>
    </div>
  );
}

function OldestList({ rows }: { rows: OldestAwaitingReview[] }) {
  if (rows.length === 0) {
    return <div className="table__empty">Nothing is currently awaiting a Bureau decision.</div>;
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Report</th>
          <th>Laboratory</th>
          <th>Period</th>
          <th>Status</th>
          <th>Waiting</th>
          <th aria-label="Open" />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.submissionId}>
            <td style={{ fontWeight: 600 }}>{r.reportTypeName}</td>
            <td className="text-sm muted">{r.laboratoryName}</td>
            <td className="text-sm muted">{r.periodLabel}</td>
            <td>
              <StatusPill status={r.status} />
            </td>
            <td className="text-sm" style={{ fontWeight: 600 }}>
              {formatHours(r.waitingHours)}
            </td>
            <td style={{ textAlign: 'right' }}>
              <Link
                className="btn btn--ghost btn--sm"
                href={`/admin/submissions/${r.submissionId}`}
              >
                Open <ArrowRight size={15} />
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
