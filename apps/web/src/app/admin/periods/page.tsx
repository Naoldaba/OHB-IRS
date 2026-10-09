'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { PeriodType, ETHIOPIAN_MONTHS, toEthiopian } from '@ohb/shared';

/** Current Ethiopian year, used as the default when opening a new period. */
const CURRENT_ETHIOPIAN_YEAR = toEthiopian(new Date()).year;
import { api, ApiError } from '@/lib/api';
import type { ReportType, ReportingPeriod } from '@/lib/types';
import { Button, Callout, Card, Field, Pill, Spinner } from '@/components/ui';

export default function PeriodsPage() {
  const [types, setTypes] = useState<ReportType[] | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
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

  if (error && !types) return <Callout tone="danger" title="Could not load">{error}</Callout>;
  if (!types)
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );

  const selectedType = types.find((t) => t.id === selectedTypeId);

  return (
    <>
      <div className="page-head">
        <div className="micro-label">Reporting Periods</div>
        <h1>Periods</h1>
        <p>Open the Ethiopian-calendar periods laboratories report against.</p>
      </div>

      {types.length === 0 ? (
        <Callout title="No report types yet">
          Create a report type first under <strong>Reports</strong>.
        </Callout>
      ) : (
        <>
          <Card>
            <Field label="Report type">
              <select
                className="select"
                value={selectedTypeId}
                onChange={(e) => setSelectedTypeId(e.target.value)}
              >
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.defaultFrequency.toLowerCase()})
                  </option>
                ))}
              </select>
            </Field>
          </Card>

          <div className="split" style={{ marginTop: 18 }}>
            {selectedType && (
              <NewPeriodCard
                reportType={selectedType}
                onCreated={() => loadPeriods(selectedTypeId)}
              />
            )}

            <Card title="Open periods">
              {periods.length === 0 ? (
                <div className="table__empty">No periods yet for this report.</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Year</th>
                      <th>Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.label}</td>
                        <td>
                          <Pill tone="slate">{p.year} E.C.</Pill>
                        </td>
                        <td className="text-sm muted">
                          {new Date(p.dueDate).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function NewPeriodCard({
  reportType,
  onCreated,
}: {
  reportType: ReportType;
  onCreated: () => Promise<void>;
}) {
  const [periodType, setPeriodType] = useState<PeriodType>(reportType.defaultFrequency);
  const [year, setYear] = useState(CURRENT_ETHIOPIAN_YEAR);
  const [periodNumber, setPeriodNumber] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create period');
    } finally {
      setBusy(false);
    }
  }

  const maxPeriod = periodType === PeriodType.MONTHLY ? 13 : periodType === PeriodType.QUARTERLY ? 4 : 1;

  return (
    <Card title="Open a new period">
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
          <input
            className="input"
            type="number"
            min={2010}
            max={2200}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            placeholder={String(CURRENT_ETHIOPIAN_YEAR)}
            required
          />
        </Field>
        <Field
          label={periodType === PeriodType.MONTHLY ? 'Month' : periodType === PeriodType.QUARTERLY ? 'Quarter' : 'Period'}
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
        <Button type="submit" disabled={busy}>
          <Plus size={16} /> Open period
        </Button>
      </form>
    </Card>
  );
}
