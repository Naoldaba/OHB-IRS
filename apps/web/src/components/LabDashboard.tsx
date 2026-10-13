'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  FilePlus2,
  RotateCcw,
} from 'lucide-react';
import { Award } from 'lucide-react';
import { ReportStatus } from '@ohb/shared';
import { api, ApiError } from '@/lib/api';
import type {
  ComplianceCounts,
  DashboardAnalytics,
  ExpectedSlot,
  RegionalBenchmark,
} from '@/lib/types';
import { Button, Callout, Card, Spinner, StatusPill } from '@/components/ui';
import { AnalyticsExport } from '@/components/AnalyticsExport';

/**
 * Lab compliance dashboard (Phase 13) — the lab head's sense of *obligation*.
 * Everything is derived from actual data and scoped to the signed-in user's own
 * laboratory server-side (`GET /analytics/my-lab`); the client can never widen
 * the scope. Visuals + the report-state palette are shared with the Bureau
 * dashboard (Phase 8).
 */

/** The report states that partition every expected slot (shared palette). */
const STATES = [
  { key: 'approved', label: 'Approved', color: 'var(--state-approved)' },
  { key: 'pendingReview', label: 'In review', color: 'var(--state-review)' },
  { key: 'revisionRequired', label: 'Revision required', color: 'var(--state-revision)' },
  { key: 'overdue', label: 'Overdue', color: 'var(--state-overdue)' },
  { key: 'pending', label: 'Not yet due', color: 'var(--state-pending)' },
] as const;

const pct = (rate: number) => `${Math.round(rate * 100)}%`;
const DAY = 24 * 60 * 60 * 1000;

export function LabDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardAnalytics>('/analytics/my-lab')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  if (error) {
    return (
      <Callout tone="danger" title="Could not load your compliance">
        {error}
      </Callout>
    );
  }
  if (!data) {
    return (
      <Card title="Compliance">
        <div className="loading-screen">
          <Spinner />
        </div>
      </Card>
    );
  }

  const { overview } = data;
  if (overview.expected === 0) {
    return (
      <Callout title="Nothing is due yet">
        You have no reports expected in any open reporting period. New
        obligations appear here once the Bureau opens a period for a report your
        laboratory is required to submit.
      </Callout>
    );
  }

  return <Ready data={data} router={router} />;
}

function Ready({
  data,
  router,
}: {
  data: DashboardAnalytics;
  router: ReturnType<typeof useRouter>;
}) {
  const { overview } = data;
  const slots = data.expectedSlots ?? [];

  // Next upcoming deadline among reports not yet submitted (and not overdue).
  const nextDeadline = useMemo(() => {
    const now = Date.now();
    const upcoming = slots
      .filter((s) => !s.overdue && !isSubmitted(s.status))
      .map((s) => new Date(s.dueDate).getTime())
      .filter((t) => t >= now)
      .sort((a, b) => a - b);
    return upcoming[0] ?? null;
  }, [slots]);

  const revisionRate = overview.submitted > 0 ? overview.revisionRequired / overview.submitted : 0;
  const complianceSeries = data.trends.map((t) => t.complianceRate);

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="toolbar" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
        <AnalyticsExport basePath="/analytics/my-lab/export" />
      </div>
      {data.benchmark && <BenchmarkLine benchmark={data.benchmark} rate={overview.complianceRate} />}
      <div className="kpi-row">
        <Kpi
          icon={<CheckCircle2 size={15} />}
          label="Reporting compliance"
          value={pct(overview.complianceRate)}
          valueTone="accent"
          foot={`${overview.submitted} of ${overview.expected} expected submitted`}
          spark={complianceSeries.length > 1 ? complianceSeries : undefined}
        />
        <Kpi
          icon={<AlertTriangle size={15} />}
          label="Overdue"
          value={overview.overdue}
          valueTone={overview.overdue > 0 ? 'danger' : undefined}
          foot="Past due and not submitted"
        />
        <Kpi
          icon={<RotateCcw size={15} />}
          label="Needs your action"
          value={overview.revisionRequired}
          valueTone={overview.revisionRequired > 0 ? 'danger' : undefined}
          foot="Sent back for revision"
        />
        <Kpi
          icon={<CalendarClock size={15} />}
          label="Next deadline"
          value={nextDeadline ? countdownLabel(nextDeadline) : '—'}
          foot={nextDeadline ? new Date(nextDeadline).toLocaleDateString() : 'Nothing outstanding'}
        />
        <Kpi
          icon={<BadgeCheck size={15} />}
          label="Approved"
          value={overview.approved}
          valueTone={overview.approved > 0 ? 'accent' : undefined}
          foot="Accepted by the Bureau"
        />
      </div>

      <Card
        title="What's due"
        desc="Reports your laboratory is expected to submit for open reporting periods."
      >
        <WhatsDue slots={slots} router={router} />
      </Card>

      <Card title="Status mix" desc="How your expected submissions currently stand.">
        <StatusMeter counts={overview} />
      </Card>

      <Card
        title="Your reporting trend"
        desc={`Compliance across your recent reporting periods${
          overview.submitted > 0 ? ` · ${pct(revisionRate)} of submitted reports were sent back for revision` : ''
        }.`}
      >
        <Trend data={data} />
      </Card>
    </div>
  );
}

/**
 * One anonymized line placing this lab against the region (Phase 19). Shows only
 * aggregates the API returns — the regional median and this lab's rank — never
 * another laboratory's name or figures.
 */
function BenchmarkLine({ benchmark, rate }: { benchmark: RegionalBenchmark; rate: number }) {
  const delta = Math.round((rate - benchmark.regionalMedianComplianceRate) * 100);
  const standing =
    delta > 0 ? `${delta} pts above` : delta < 0 ? `${Math.abs(delta)} pts below` : 'level with';
  return (
    <div
      className="callout"
      style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}
      role="note"
    >
      <Award size={18} style={{ color: 'var(--primary-accent)', flexShrink: 0 }} />
      <span className="text-sm">
        Your compliance is <b>{pct(rate)}</b> — {standing} the regional median of{' '}
        <b>{pct(benchmark.regionalMedianComplianceRate)}</b>. You rank{' '}
        <b>
          {benchmark.regionalRank} of {benchmark.totalRankedLabs}
        </b>{' '}
        laboratories.
      </span>
    </div>
  );
}

/** A per-slot "what's due" list with a start/continue action for each report. */
function WhatsDue({
  slots,
  router,
}: {
  slots: ExpectedSlot[];
  router: ReturnType<typeof useRouter>;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (slots.length === 0) {
    return <div className="table__empty">Nothing is currently expected of your laboratory.</div>;
  }

  async function open(slot: ExpectedSlot) {
    if (slot.submissionId) {
      router.push(`/lab/submissions/${slot.submissionId}`);
      return;
    }
    // Not started yet — create the draft, then open it.
    const slotKey = `${slot.reportTypeId}|${slot.periodId}`;
    setError(null);
    setBusyKey(slotKey);
    try {
      const created = await api.post<{ id: string }>('/submissions', {
        reportTypeId: slot.reportTypeId,
        reportingPeriodId: slot.periodId,
      });
      router.push(`/lab/submissions/${created.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start this report');
      setBusyKey(null);
    }
  }

  return (
    <>
      {error && (
        <div style={{ marginBottom: 12 }}>
          <Callout tone="danger">{error}</Callout>
        </div>
      )}
      <table className="table">
        <thead>
          <tr>
            <th>Report</th>
            <th>Period</th>
            <th>Due</th>
            <th>Status</th>
            <th aria-label="Action" />
          </tr>
        </thead>
        <tbody>
          {slots.map((s) => {
            const slotKey = `${s.reportTypeId}|${s.periodId}`;
            const started = !!s.submissionId;
            return (
              <tr key={slotKey}>
                <td style={{ fontWeight: 600 }}>{s.reportTypeName}</td>
                <td>{s.periodLabel}</td>
                <td className="text-sm muted">
                  {new Date(s.dueDate).toLocaleDateString()}
                </td>
                <td>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    {s.status ? (
                      <StatusPill status={s.status} />
                    ) : (
                      <span className="pill pill--slate">
                        <span className="pill__dot" />
                        Not started
                      </span>
                    )}
                    {s.overdue && (
                      <span className="pill pill--red">
                        <span className="pill__dot" />
                        Overdue
                      </span>
                    )}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyKey === slotKey}
                    onClick={() => open(s)}
                  >
                    {started ? (
                      <>
                        {s.status === ReportStatus.REVISION_REQUIRED ? 'Fix' : 'Continue'}
                        <ArrowRight size={15} />
                      </>
                    ) : (
                      <>
                        <FilePlus2 size={15} /> Start
                      </>
                    )}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

/** Stacked meter + labelled legend; color is never the sole carrier (each state
 *  carries a text label and an ink count). Shared with the Bureau dashboard. */
function StatusMeter({ counts }: { counts: ComplianceCounts }) {
  const total = counts.expected || 1;
  const segments = STATES.filter((s) => counts[s.key] > 0);
  return (
    <>
      <div className="meter" role="img" aria-label="Your report status distribution">
        {segments.map((s) => (
          <div
            key={s.key}
            className="meter__seg"
            style={{ width: `${(counts[s.key] / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${counts[s.key]}`}
          />
        ))}
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

function Kpi({
  icon,
  label,
  value,
  valueTone,
  foot,
  spark,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  valueTone?: 'accent' | 'danger';
  foot?: React.ReactNode;
  spark?: number[];
}) {
  const toneClass =
    valueTone === 'accent'
      ? ' kpi__value--accent'
      : valueTone === 'danger'
        ? ' kpi__value--danger'
        : '';
  return (
    <div className="kpi">
      <div className="kpi__top">
        <span className="kpi__label">{label}</span>
        <span className="kpi__chip">{icon}</span>
      </div>
      <div className={`kpi__value${toneClass}`}>{value}</div>
      {spark && <Sparkline values={spark} />}
      {foot && <div className="kpi__foot">{foot}</div>}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 120;
  const h = 34;
  const pad = 3;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg className="kpi__spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="var(--primary-accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function isSubmitted(status: ReportStatus | null): boolean {
  return status !== null && status !== ReportStatus.DRAFT;
}

/** Human countdown to a future deadline (today / N days). */
function countdownLabel(ts: number): string {
  const days = Math.ceil((ts - Date.now()) / DAY);
  if (days <= 0) return 'Due today';
  if (days === 1) return '1 day';
  return `${days} days`;
}
