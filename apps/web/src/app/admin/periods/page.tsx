'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, CalendarClock, CalendarDays } from 'lucide-react';
import {
  PeriodType,
  ETHIOPIAN_MONTHS,
  toEthiopian,
  toGregorianDate,
} from '@ohb/shared';
import { api, ApiError } from '@/lib/api';
import type { ReportType, ReportingPeriod } from '@/lib/types';
import { Button, Callout, Card, Field, Pill, Spinner } from '@/components/ui';

/** Current Ethiopian year, used as the default for the matrix and new periods. */
const CURRENT_ETHIOPIAN_YEAR = toEthiopian(new Date()).year;

/** Which Ethiopian months fall in each quarter — mirrors the shared convention
 *  (Q4 folds in the short 13th month, Qaammee/Pagume). */
const QUARTER_MONTHS: Record<number, number[]> = {
  1: [1, 2, 3],
  2: [4, 5, 6],
  3: [7, 8, 9],
  4: [10, 11, 12, 13],
};

/** Report names can repeat across categories, so qualify labels with the
 *  category when it's known. */
function typeName(t: ReportType) {
  return t.category?.name ? `${t.category.name} · ${t.name}` : t.name;
}
function typeLabel(t: ReportType) {
  return `${typeName(t)} (${t.defaultFrequency.toLowerCase()})`;
}

type CycleStatus = 'open' | 'upcoming' | 'closed';

/** A reporting cycle's lifecycle derived purely from its real dates (EAT). */
function cycleStatus(p: ReportingPeriod, now: Date): CycleStatus {
  const start = new Date(p.startDate).getTime();
  const due = new Date(p.dueDate).getTime();
  const t = now.getTime();
  if (t < start) return 'upcoming';
  if (t > due) return 'closed';
  return 'open';
}

const STATUS_LABEL: Record<CycleStatus, string> = {
  open: 'Open · Accepting',
  upcoming: 'Upcoming',
  closed: 'Closed · Archived',
};
const STATUS_TONE: Record<CycleStatus, 'green' | 'amber' | 'slate'> = {
  open: 'green',
  upcoming: 'amber',
  closed: 'slate',
};

/** Ethiopian-calendar parts for a stored (Gregorian) date string. */
function ec(dateStr: string) {
  const d = toEthiopian(new Date(dateStr));
  return { day: d.day, month: d.month, name: ETHIOPIAN_MONTHS[d.month - 1], year: d.year };
}
function fmtEc(dateStr: string) {
  const d = ec(dateStr);
  return `${d.day} ${d.name} ${d.year} E.C.`;
}
function fmtGc(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
function daysBetween(fromMs: number, toMs: number) {
  return Math.ceil((toMs - fromMs) / 86_400_000);
}

export default function PeriodsPage() {
  const [types, setTypes] = useState<ReportType[] | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
  const [matrixYear, setMatrixYear] = useState(CURRENT_ETHIOPIAN_YEAR);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ReportType[]>('/report-types')
      .then((t) => {
        setTypes(t);
        if (t[0]) setSelectedTypeId(t[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  async function loadPeriods(typeId: string) {
    if (!typeId) {
      setPeriods([]);
      return;
    }
    const p = await api.get<ReportingPeriod[]>(`/reporting-periods?reportTypeId=${typeId}`);
    setPeriods(p);
  }

  useEffect(() => {
    if (selectedTypeId) void loadPeriods(selectedTypeId).catch(() => setPeriods([]));
  }, [selectedTypeId]);

  const now = useMemo(() => new Date(), []);
  const selectedType = types?.find((t) => t.id === selectedTypeId);

  // Active cycle: the open window, else the nearest upcoming, else the most recent.
  const activeCycle = useMemo(() => {
    const byStatus = (s: CycleStatus) => periods.filter((p) => cycleStatus(p, now) === s);
    const open = byStatus('open').sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );
    if (open.length) return open[0];
    const upcoming = byStatus('upcoming').sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );
    if (upcoming.length) return upcoming[0];
    const closed = byStatus('closed').sort(
      (a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime(),
    );
    return closed[0] ?? null;
  }, [periods, now]);

  // Which period (if any) covers each Ethiopian month of the matrix year.
  const monthMap = useMemo(() => {
    const map = new Map<number, { period: ReportingPeriod; status: CycleStatus }>();
    for (const p of periods) {
      if (p.year !== matrixYear) continue;
      const status = cycleStatus(p, now);
      let months: number[];
      if (p.periodType === PeriodType.MONTHLY) months = [p.periodNumber];
      else if (p.periodType === PeriodType.QUARTERLY) months = QUARTER_MONTHS[p.periodNumber] ?? [];
      else months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]; // YEARLY
      for (const m of months) map.set(m, { period: p, status });
    }
    return map;
  }, [periods, matrixYear, now]);

  if (error && !types)
    return (
      <Callout tone="danger" title="Could not load">
        {error}
      </Callout>
    );
  if (!types)
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );

  return (
    <>
      <div className="page-head">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          Bureau Administration Console <span>›</span> Calendar Governance{' '}
          <span>›</span> <b>Reporting Periods</b>
        </nav>
        <div className="page-head__row">
          <div>
            <div className="micro-label">Reporting Periods</div>
            <h1>Reporting Periods &amp; Calendar Governance</h1>
            <p>
              Open and monitor the Ethiopian-calendar (E.C.) submission windows that
              regional laboratories report against.
            </p>
          </div>
          {types.length > 0 && (
            <div className="periods-typepick">
              <Field label="Laboratory program / module">
                <select
                  className="select"
                  value={selectedTypeId}
                  onChange={(e) => setSelectedTypeId(e.target.value)}
                >
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {typeLabel(t)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </div>
      </div>

      {types.length === 0 ? (
        <Callout title="No report types yet">
          Create a report type first under <strong>Reports</strong>.
        </Callout>
      ) : (
        <>
          <ActiveCycleBanner cycle={activeCycle} type={selectedType} now={now} />

          <div className="periods-grid">
            {selectedType && (
              <NewPeriodCard
                reportType={selectedType}
                defaultYear={matrixYear}
                onCreated={async (year) => {
                  setMatrixYear(year);
                  await loadPeriods(selectedTypeId);
                }}
              />
            )}

            <CalendarMatrix
              year={matrixYear}
              monthMap={monthMap}
              onYear={setMatrixYear}
            />
          </div>

          <GovernanceLedger
            periods={periods}
            type={selectedType}
            now={now}
          />
        </>
      )}
    </>
  );
}

function ActiveCycleBanner({
  cycle,
  type,
  now,
}: {
  cycle: ReportingPeriod | null;
  type?: ReportType;
  now: Date;
}) {
  if (!cycle) {
    return (
      <Callout title="No reporting cycle yet">
        No periods have been opened for this program. Use the Period Orchestrator
        below to open the first submission window.
      </Callout>
    );
  }
  const status = cycleStatus(cycle, now);
  const dueMs = new Date(cycle.dueDate).getTime();
  const days = daysBetween(now.getTime(), dueMs);

  return (
    <div className={`periods-banner periods-banner--${status}`}>
      <div className="periods-banner__icon" aria-hidden>
        <CalendarClock size={22} />
      </div>
      <div className="periods-banner__body">
        <div className="periods-banner__eyebrow">
          Active reporting cycle{type ? ` · ${typeName(type)}` : ''}
        </div>
        <div className="periods-banner__title">
          {cycle.label} <span>· {cycle.year} E.C.</span>
        </div>
        <div className="periods-banner__meta">
          Submission window: {fmtEc(cycle.startDate)} – {fmtEc(cycle.endDate)} (
          {fmtGc(cycle.startDate)} – {fmtGc(cycle.endDate)}).
        </div>
      </div>
      <div className="periods-banner__status">
        <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>
        <div className="periods-banner__due">
          {status === 'open' && days >= 0 && (
            <>
              Closes in <b>{days}</b> day{days === 1 ? '' : 's'}
            </>
          )}
          {status === 'upcoming' && (
            <>
              Opens {fmtGc(cycle.startDate)}
            </>
          )}
          {status === 'closed' && <>Due {fmtGc(cycle.dueDate)}</>}
        </div>
      </div>
    </div>
  );
}

function CalendarMatrix({
  year,
  monthMap,
  onYear,
}: {
  year: number;
  monthMap: Map<number, { period: ReportingPeriod; status: CycleStatus }>;
  onYear: (year: number) => void;
}) {
  // Gregorian span of the Ethiopian year, for the sub-label (Meskerem 1 → Pagume).
  const gStart = toGregorianDate(year, 1, 1).getUTCFullYear();
  const gEnd = toGregorianDate(year, 13, 1).getUTCFullYear();

  return (
    <Card className="cal-card">
      <div className="cal-card__head">
        <div>
          <h2 className="card__title">
            <CalendarDays size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />
            Ethiopian Calendar Matrix
          </h2>
          <div className="card__desc" style={{ margin: 0 }}>
            13 months (Ji&apos;oottan) · {gStart}/{gEnd} G.C.
          </div>
        </div>
        <div className="cal-year">
          <button
            type="button"
            className="cal-year__btn"
            onClick={() => onYear(year - 1)}
            aria-label="Previous year"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="cal-year__value">{year} E.C.</span>
          <button
            type="button"
            className="cal-year__btn"
            onClick={() => onYear(year + 1)}
            aria-label="Next year"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="legend" style={{ marginTop: 4, marginBottom: 14 }}>
        <span className="legend__item">
          <span className="legend__swatch" style={{ background: 'var(--state-approved)' }} />
          Open / Active
        </span>
        <span className="legend__item">
          <span className="legend__swatch" style={{ background: 'var(--state-review)' }} />
          Upcoming
        </span>
        <span className="legend__item">
          <span className="legend__swatch" style={{ background: 'var(--state-pending)' }} />
          Closed / Archived
        </span>
        <span className="legend__item">
          <span className="legend__swatch" style={{ background: 'var(--border)' }} />
          Not scheduled
        </span>
      </div>

      <div className="cal-quarters">
        {[1, 2, 3, 4].map((q) => (
          <div className="quarter-col" key={q}>
            <div className="quarter-col__head">Q{q}</div>
            {QUARTER_MONTHS[q].map((m) => {
              const hit = monthMap.get(m);
              const state: CycleStatus | 'none' = hit ? hit.status : 'none';
              return (
                <div className={`month-card is-${state}`} key={m}>
                  <div className="month-card__num">
                    {String(m).padStart(2, '0')}
                  </div>
                  <div className="month-card__name">{ETHIOPIAN_MONTHS[m - 1]}</div>
                  <div className="month-card__state">
                    {state === 'none' ? '—' : STATUS_LABEL[state].split(' · ')[0]}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}

function GovernanceLedger({
  periods,
  type,
  now,
}: {
  periods: ReportingPeriod[];
  type?: ReportType;
  now: Date;
}) {
  const rows = useMemo(
    () =>
      [...periods].sort(
        (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
      ),
    [periods],
  );

  return (
    <Card className="periods-ledger" title="Governance Ledger — Master Reporting Windows">
      {rows.length === 0 ? (
        <div className="table__empty">No periods yet for this program.</div>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Cycle (E.C. month)</th>
                <th>Program module</th>
                <th>Submission window</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const status = cycleStatus(p, now);
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.label}</div>
                      <div className="text-sm muted">{p.year} E.C.</div>
                    </td>
                    <td className="text-sm">{type ? typeName(type) : '—'}</td>
                    <td className="text-sm muted">
                      {fmtEc(p.startDate)} – {fmtEc(p.endDate)}
                      <br />
                      <span className="mono">
                        {fmtGc(p.startDate)} – {fmtGc(p.endDate)}
                      </span>
                    </td>
                    <td className="text-sm muted">{fmtGc(p.dueDate)}</td>
                    <td>
                      <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function NewPeriodCard({
  reportType,
  defaultYear,
  onCreated,
}: {
  reportType: ReportType;
  defaultYear: number;
  onCreated: (year: number) => Promise<void>;
}) {
  const [periodType, setPeriodType] = useState<PeriodType>(reportType.defaultFrequency);
  const [year, setYear] = useState(defaultYear);
  const [periodNumber, setPeriodNumber] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset the frequency default when the selected report type changes.
  useEffect(() => {
    setPeriodType(reportType.defaultFrequency);
    setPeriodNumber(1);
  }, [reportType.id, reportType.defaultFrequency]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/reporting-periods', {
        reportTypeId: reportType.id,
        periodType,
        year,
        periodNumber,
      });
      await onCreated(year);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create period');
    } finally {
      setBusy(false);
    }
  }

  const maxPeriod =
    periodType === PeriodType.MONTHLY ? 13 : periodType === PeriodType.QUARTERLY ? 4 : 1;

  return (
    <Card className="orchestrator" title="Period Orchestrator">
      <div className="card__desc" style={{ marginTop: -8 }}>
        Initialize a new submission window for <strong>{typeName(reportType)}</strong>.
      </div>
      <form onSubmit={submit}>
        {error && (
          <div style={{ marginBottom: 12 }}>
            <Callout tone="danger">{error}</Callout>
          </div>
        )}
        <Field label="Frequency">
          <select
            className="select"
            value={periodType}
            onChange={(e) => {
              setPeriodType(e.target.value as PeriodType);
              setPeriodNumber(1);
            }}
          >
            {Object.values(PeriodType).map((p) => (
              <option key={p} value={p}>
                {p.toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ethiopian year" hint={`e.g. ${CURRENT_ETHIOPIAN_YEAR} E.C.`}>
          <div className="year-stepper">
            <button
              type="button"
              className="cal-year__btn"
              onClick={() => setYear((y) => y - 1)}
              aria-label="Previous year"
            >
              <ChevronLeft size={16} />
            </button>
            <input
              className="input"
              type="number"
              min={2010}
              max={2200}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              required
            />
            <button
              type="button"
              className="cal-year__btn"
              onClick={() => setYear((y) => y + 1)}
              aria-label="Next year"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </Field>
        <Field
          label={
            periodType === PeriodType.MONTHLY
              ? 'Month'
              : periodType === PeriodType.QUARTERLY
                ? 'Quarter'
                : 'Period'
          }
        >
          <select
            className="select"
            value={periodNumber}
            onChange={(e) => setPeriodNumber(Number(e.target.value))}
          >
            {Array.from({ length: maxPeriod }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {periodType === PeriodType.MONTHLY ? `${n} — ${ETHIOPIAN_MONTHS[n - 1]}` : n}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" disabled={busy} block>
          <Plus size={16} /> Open reporting period
        </Button>
      </form>
    </Card>
  );
}
