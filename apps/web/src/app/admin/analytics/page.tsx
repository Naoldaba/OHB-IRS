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
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { api } from '@/lib/api';
import type {
  ComplianceCounts,
  DashboardAnalytics,
  LabComplianceRow,
  ReportType,
} from '@/lib/types';
import { Callout, Card, Select, Spinner } from '@/components/ui';
import { AnalyticsExport } from '@/components/AnalyticsExport';

/** Compliance target the Bureau measures labs against (a policy constant, not data). */
const REGIONAL_MANDATE = 0.9;

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
          <div className="toolbar" style={{ gap: 10, alignItems: 'flex-end' }}>
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
            <AnalyticsExport basePath="/analytics/dashboard/export" reportTypeId={reportTypeId} disabled={!data} />
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

  // Compliance trend series (oldest → newest) for the hero sparkline.
  const complianceSeries = useMemo(
    () => data.trends.map((t) => t.complianceRate),
    [data.trends],
  );
  const deltaVsMandate = overview.complianceRate - REGIONAL_MANDATE;
  const revisionRate = overview.submitted > 0 ? overview.revisionRequired / overview.submitted : 0;

  return (
    <>
      {/* Headline KPI buckets */}
      <div className="kpi-row">
        <Kpi
          icon={<ClipboardList size={15} />}
          label="Expected submissions"
          value={overview.expected}
          foot={`Across ${overview.totalLaboratories} labs · opened periods`}
        />
        <Kpi
          icon={<CheckCircle2 size={15} />}
          label="Reporting compliance"
          value={hasExpectations ? pct(overview.complianceRate) : '—'}
          valueTone="accent"
          foot={
            hasExpectations ? (
              <Delta value={deltaVsMandate} suffix={`vs ${pct(REGIONAL_MANDATE)} mandate`} />
            ) : (
              'No expected submissions yet'
            )
          }
          spark={complianceSeries.length > 1 ? complianceSeries : undefined}
        />
        <Kpi
          icon={<Clock size={15} />}
          label="Pending review"
          value={overview.pendingReview}
          foot="Submitted, awaiting the Bureau"
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
          label="Revision required"
          value={overview.revisionRequired}
          foot={hasExpectations ? `${pct(revisionRate)} of submitted reports` : 'Sent back to labs'}
        />
      </div>

      {/* Secondary tallies */}
      <div className="grid grid--3" style={{ marginBottom: 18 }}>
        <Stat icon={<Building2 size={14} />} label="Active laboratories" value={overview.totalLaboratories} />
        <Stat
          icon={<CheckCircle2 size={14} />}
          label="Approved"
          value={overview.approved}
          dot="var(--state-approved)"
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
            title="Regional laboratory submission status"
            desc="Each bar's height is the number of reports expected of that lab (shared scale, tallest = busiest); the stack shows their current status and the % below is compliance (submitted ÷ expected)."
          >
            <LabStatusBars data={data} />
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

/** A headline "bucket" tile: big value, an icon chip, a footer (delta or caption),
 *  and an optional compliance sparkline. */
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

/** Signed change against a target, with a direction arrow and status color. */
function Delta({ value, suffix }: { value: number; suffix: string }) {
  const up = value >= 0;
  return (
    <>
      <span className={`kpi__delta ${up ? 'kpi__delta--up' : 'kpi__delta--down'}`}>
        {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
        {up ? '+' : ''}
        {Math.round(value * 100)}%
      </span>{' '}
      {suffix}
    </>
  );
}

/** Minimal inline-SVG sparkline (2px line, no axes) for the compliance series. */
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

/** The five mutually-exclusive states stacked per lab, bottom (good) → top (unmet). */
const LAB_SEGMENTS = [
  { key: 'approved', label: 'Approved', color: 'var(--state-approved)' },
  { key: 'pendingReview', label: 'In review', color: 'var(--state-review)' },
  { key: 'revisionRequired', label: 'Revision required', color: 'var(--state-revision)' },
  { key: 'overdue', label: 'Overdue', color: 'var(--state-overdue)' },
  { key: 'pending', label: 'Not yet due', color: 'var(--state-pending)' },
] as const;

/** Vertical stacked bars, one per laboratory; each bar's full height is that lab's
 *  expected slots, split by current status. A dashed line marks the regional mandate. */
function LabStatusBars({ data }: { data: DashboardAnalytics }) {
  const rows = useMemo(
    () =>
      data.laboratories
        .filter((l) => l.expected > 0)
        .sort((a, b) => b.complianceRate - a.complianceRate || b.expected - a.expected),
    [data.laboratories],
  );

  // Shared count scale: the tallest bar is the lab with the most expected reports,
  // so bar height encodes volume and bars are comparable across labs.
  const maxExpected = useMemo(() => Math.max(...rows.map((r) => r.expected), 1), [rows]);
  // Three gridlines (top / middle / baseline) carrying the report-count scale.
  const gridlines = [
    { frac: 1, count: maxExpected },
    { frac: 0.5, count: Math.round(maxExpected / 2) },
    { frac: 0, count: 0 },
  ];

  if (rows.length === 0) {
    return <div className="table__empty">No laboratory is currently expected to report.</div>;
  }

  return (
    <>
      <div className="labchart__scroll">
        <div className="labchart" role="img" aria-label="Submission status by laboratory (bar height = reports expected)">
          {gridlines.map((g) => (
            <div className="labchart__grid" key={g.frac} style={{ bottom: `${g.frac * 100}%` }}>
              <span className="labchart__grid-label">{g.count}</span>
            </div>
          ))}
          {rows.map((l) => (
            <LabBar key={l.laboratoryId} lab={l} maxExpected={maxExpected} />
          ))}
        </div>
        <div className="labaxis" aria-hidden="true">
          {rows.map((l) => (
            <div className="labaxis__tick" key={l.laboratoryId}>
              <span className="labaxis__pct">{pct(l.complianceRate)}</span>
              <span className="labaxis__code" title={l.laboratoryName}>
                {l.laboratoryCode}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="legend">
        {LAB_SEGMENTS.map((s) => (
          <span className="legend__item" key={s.key}>
            <span className="legend__swatch" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </>
  );
}

function LabBar({ lab, maxExpected }: { lab: LabComplianceRow; maxExpected: number }) {
  const total = lab.expected || 1;
  // Bar occupies a share of the plot equal to its expected volume vs the busiest lab.
  const barHeight = `${(lab.expected / maxExpected) * 100}%`;
  return (
    <div className="labcol" title={`${lab.laboratoryName}: ${lab.submitted} of ${lab.expected} expected submitted`}>
      <div className="labbar__stack" style={{ height: barHeight }}>
        {LAB_SEGMENTS.map((s) => {
          const n = lab[s.key];
          if (n <= 0) return null;
          return (
            <div
              key={s.key}
              className="labbar__seg"
              style={{ flexBasis: `${(n / total) * 100}%`, background: s.color }}
              title={`${s.label}: ${n}`}
            />
          );
        })}
      </div>
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
