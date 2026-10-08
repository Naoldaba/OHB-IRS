'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { ReportType, ReportingPeriod, SubmissionSummary } from '@/lib/types';
import { Button, Callout, Card, Field, Spinner, StatusPill } from '@/components/ui';

export default function LabHome() {
  const router = useRouter();
  const [subs, setSubs] = useState<SubmissionSummary[] | null>(null);
  const [types, setTypes] = useState<ReportType[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  if (error && !subs) return <Callout tone="danger" title="Could not load">{error}</Callout>;
  if (!subs)
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );

  return (
    <>
      <div className="page-head">
        <div className="micro-label">Regional Laboratory</div>
        <h1>My reports</h1>
        <p>Create a report for a period, fill it in, and submit it for review.</p>
      </div>

      <div className="split">
        <NewSubmissionCard
          types={types}
          onCreated={(subId) => router.push(`/lab/submissions/${subId}`)}
        />

        <Card title="Submissions">
          {subs.length === 0 ? (
            <div className="table__empty">No reports yet. Start one on the left.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
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

function NewSubmissionCard({
  types,
  onCreated,
}: {
  types: ReportType[];
  onCreated: (submissionId: string) => void;
}) {
  const [reportTypeId, setReportTypeId] = useState('');
  const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
  const [periodId, setPeriodId] = useState('');
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const created = await api.post<SubmissionSummary>('/submissions', {
        reportTypeId,
        reportingPeriodId: periodId,
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
        <Button type="submit" disabled={busy || !reportTypeId || !periodId}>
          <FilePlus2 size={16} /> Create draft
        </Button>
      </form>
    </Card>
  );
}
