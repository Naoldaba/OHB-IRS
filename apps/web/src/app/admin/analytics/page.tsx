'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  Flag,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import type {
  ComplianceCounts,
  DashboardAnalytics,
  ReportType,
} from '@/lib/types';
import { Callout, Card, Select, Spinner } from '@/components/ui';

/**
 * Bureau dashboard — compliance & analytics (Phase 8). Every figure comes from
 * the API, which derives it from actual requirements, opened periods, due dates
 * and real submissions. Nothing is computed or assumed on the client.
 */

/** The mutually-exclusive report states that partition every expected slot. */
const STATES = [
  { key: 'approved', label: 'Approved', color: 'var(--state-approved)' },
  { key: 'pendingReview', label: 'In review', color: 'var(--state-review)' },
  { key: 'revisionRequired', label: 'Revision required', color: 'var(--state-revision)' },
  { key: 'overdue', label: 'Overdue', color: 'var(--state-overdue)' },
  { key: 'pending', label: 'Not yet due', color: 'var(--state-pending)' },
] as const;

const pct = (rate: number) => `${Math.round(rate * 100)}%`;

export default function AdminAnalyticsPage() {
  const [reportTypes, setReportTypes] = useState<ReportType[] | null>(null);
  const [reportTypeId, setReportTypeId] = useState<string>('');
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ReportType[]>('/report-types')
      .then(setReportTypes)
      .catch(() => setReportTypes([]));
  }, []);

  useEffect(() => {
    setData(null);
    setError(null);
    const qs = reportTypeId ? `?reportTypeId=${encodeURIComponent(reportTypeId)}` : '';
    api
      .get<DashboardAnalytics>(`/analytics/dashboard${qs}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [reportTypeId]);

  return (
    <>
      <div className="page-head">
        <div className="page-head__row">
          <div>
            <div className="micro-label">Compliance &amp; Analytics</div>
            <h1>Bureau dashboard</h1>
            <p>
              Expected-vs-submitted reporting across laboratories, built from
              reporting requirements, open periods and actual submissions.
            </p>
          </div>
          <div style={{ minWidth: 240 }}>
            <Select
              value={reportTypeId}
              onChange={(e) => setReportTypeId(e.target.value)}
              aria-label="Filter by report type"
            >
              <option value="">All report types</option>
              {(reportTypes ?? []).map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {error ? (
        <Callout tone="danger" title="Could not load">
          {error}
        </Callout>
      ) : !data ? (
        <div className="loading-screen">
          <Spinner />
        </div>
      ) : (
        <Dashboard data={data} />
      )}
    </>
  );
}

function Dashboard({ data }: { data: DashboardAnalytics }) {
  const { overview } = data;
  const hasExpectations = overview.expected > 0;

  return (
    <>
      {/* Headline KPIs */}
      <div className="grid grid--4" style={{ marginBottom: 18 }}>
        <Stat
          icon={<CheckCircle2 size={14} />}
          label="Reporting compliance"
          value={hasExpectations ? pct(overview.complianceRate) : '—'}
          sub={
            hasExpectations
              ? `${overview.submitted} of ${overview.expected} expected submitted`
              : 'No expected submissions yet'
          }
          dot="var(--state-approved)"
        />
        <Stat
          icon={<ClipboardList size={14} />}
          label="Expected submissions"
          value={overview.expected}
          sub="Across opened reporting periods"
        />
        <Stat
          icon={<Clock size={14} />}
          label="Pending review"
          value={overview.pendingReview}
          sub="Submitted, awaiting the Bureau"
          dot="var(--state-review)"
        />
        <Stat
          icon={<AlertTriangle size={14} />}
          label="Overdue"
          value={overview.overdue}
          sub="Past due and not submitted"
          dot="var(--state-overdue)"
        />
      </div>

      <div className="grid grid--4" style={{ marginBottom: 18 }}>
        <Stat icon={<Building2 size={14} />} label="Active laboratories" value={overview.totalLaboratories} />
        <Stat
          icon={<CheckCircle2 size={14} />}
          label="Approved"
          value={overview.approved}
          dot="var(--state-approved)"
        />
        <Stat
          icon={<RotateCcw size={14} />}
          label="Revision required"
          value={overview.revisionRequired}
          dot="var(--state-revision)"
        />
        <Stat
          icon={<Flag size={14} />}
          label="Flagged submissions"
          value={overview.flagged}
          sub="Carrying rule flags for review"
        />
      </div>

      {!hasExpectations && (
        <Callout title="No reporting expectations yet">
          Compliance is measured against reporting requirements and open periods.
          Define a requirement (which labs must report a type) and open a reporting
          period to start tracking expected-vs-submitted.
        </Callout>
      )}

      {hasExpectations && (
        <>
          <Card title="Status mix" desc="How every expected submission currently stands.">
            <StatusMeter counts={overview} />
          </Card>

          <Card
            title="Laboratory comparison"
            desc="Compliance by laboratory (submitted ÷ expected), most compliant first."
          >
            <LabComparison data={data} />
          </Card>

          <Card
            title="Reporting trend"
            desc="Compliance across the most recent opened reporting periods."
          >
            <Trend data={data} />
          </Card>
        </>
      )}
    </>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  dot,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  dot?: string;
}) {
  return (
    <div className="stat">
      <div className="stat__label">
        {dot ? <span className="stat__dot" style={{ background: dot }} /> : icon}
        {label}
      </div>
      <div className="stat__value">{value}</div>
      {sub && <div className="stat__sub">{sub}</div>}
    </div>
  );
}

/** Stacked meter + labelled legend. Color is never the sole carrier: each state
 *  has a text label and a count in ink (the legend doubles as the data table). */
function StatusMeter({ counts }: { counts: ComplianceCounts }) {
  const total = counts.expected || 1;
  const segments = STATES.filter((s) => counts[s.key] > 0);
  return (
    <>
      <div className="meter" role="img" aria-label="Report status distribution">
        {segments.map((s) => {
          const n = counts[s.key];
          return (
            <div
              key={s.key}
              className="meter__seg"
              style={{ width: `${(n / total) * 100}%`, background: s.color }}
              title={`${s.label}: ${n}`}
            />
          );
        })}
      </div>
      <div className="legend">
        {STATES.map((s) => (
          <span className="legend__item" key={s.key}>
            <span className="legend__swatch" style={{ background: s.color }} />
            {s.label} <b>{counts[s.key]}</b>
          </span>
        ))}
      </div>
    </>
  );
}

function LabComparison({ data }: { data: DashboardAnalytics }) {
  const rows = useMemo(
    () =>
      data.laboratories
        .filter((l) => l.expected > 0)
        .sort((a, b) => b.complianceRate - a.complianceRate || b.expected - a.expected),
    [data.laboratories],
  );

  if (rows.length === 0) {
    return <div className="table__empty">No laboratory is currently expected to report.</div>;
  }

  return (
    <div>
      {rows.map((l) => (
        <div className="barrow" key={l.laboratoryId}>
          <span className="barrow__label" title={l.laboratoryName}>
            {l.laboratoryName}
          </span>
          <span
            className="barrow__track"
            title={`${l.submitted} of ${l.expected} submitted`}
          >
            <span className="barrow__fill" style={{ width: `${l.complianceRate * 100}%` }} />
          </span>
          <span className="barrow__meta">
            <b>{pct(l.complianceRate)}</b>
            {l.overdue > 0 && (
              <>
                {' · '}
                <span style={{ color: 'var(--state-overdue)' }}>{l.overdue} overdue</span>
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function Trend({ data }: { data: DashboardAnalytics }) {
  if (data.trends.length === 0) {
    return <div className="table__empty">No opened periods with expected submissions yet.</div>;
  }
  const multiType = new Set(data.trends.map((t) => t.reportTypeId)).size > 1;
  return (
    <div className="trend">
      {data.trends.map((t) => (
        <div className="trend__col" key={t.periodId}>
          <span className="trend__val">{pct(t.complianceRate)}</span>
          <div className="trend__bar-wrap">
            <div
              className="trend__bar"
              style={{ height: `${Math.max(t.complianceRate * 100, 1)}%` }}
              title={`${t.reportTypeName} · ${t.periodLabel}: ${t.submitted}/${t.expected} submitted`}
            />
          </div>
          <span className="trend__x">
            {t.periodLabel}
            {multiType && (
              <>
                <br />
                <span style={{ color: 'var(--text-faint)' }}>{t.reportTypeName}</span>
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
