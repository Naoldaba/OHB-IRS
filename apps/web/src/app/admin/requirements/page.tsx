'use client';

/**
 * Reporting requirements: which laboratories are expected to submit each report
 * type. A requirement with no laboratory expects every active lab. These drive
 * the expected-vs-submitted / overdue / compliance figures on the dashboard, so
 * the trail here is what makes those analytics meaningful.
 */

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { Laboratory, ReportType, ReportingRequirement } from '@/lib/types';
import { Button, Callout, Card, Field, Pill, Spinner } from '@/components/ui';

const ALL_LABS = '__all__';

export default function RequirementsPage() {
  const [types, setTypes] = useState<ReportType[] | null>(null);
  const [labs, setLabs] = useState<Laboratory[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [requirements, setRequirements] = useState<ReportingRequirement[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<ReportType[]>('/report-types'),
      api.get<Laboratory[]>('/labs'),
    ])
      .then(([t, l]) => {
        setTypes(t);
        setLabs(l);
        if (t[0]) setSelectedTypeId(t[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  async function loadRequirements(typeId: string) {
    if (!typeId) {
      setRequirements([]);
      return;
    }
    const r = await api.get<ReportingRequirement[]>(`/reporting-requirements?reportTypeId=${typeId}`);
    setRequirements(r);
  }

  useEffect(() => {
    if (selectedTypeId) void loadRequirements(selectedTypeId).catch(() => setRequirements([]));
  }, [selectedTypeId]);

  if (error && !types) return <Callout tone="danger" title="Could not load">{error}</Callout>;
  if (!types)
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );

  const selectedType = types.find((t) => t.id === selectedTypeId);
  const activeLabs = labs.filter((l) => l.isActive);
  const hasAllLabsRule = requirements.some((r) => r.laboratoryId === null);
  const requiredLabIds = new Set(requirements.map((r) => r.laboratoryId).filter(Boolean) as string[]);

  return (
    <>
      <div className="page-head">
        <div className="micro-label">Administration</div>
        <h1>Reporting requirements</h1>
        <p>
          Define which laboratories are expected to submit each report. These expectations drive the
          compliance dashboard — expected-vs-submitted, overdue, and reporting rate.
        </p>
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
              <AddRequirementCard
                reportType={selectedType}
                labs={activeLabs}
                hasAllLabsRule={hasAllLabsRule}
                requiredLabIds={requiredLabIds}
                onChanged={() => loadRequirements(selectedTypeId)}
              />
            )}

            <Card title="Expected to submit">
              {requirements.length === 0 ? (
                <div className="table__empty">
                  No requirements yet. Nothing is counted as expected for this report.
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Laboratory</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {requirements.map((r) => (
                      <RequirementRow
                        key={r.id}
                        requirement={r}
                        onChanged={() => loadRequirements(selectedTypeId)}
                      />
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

function RequirementRow({
  requirement,
  onChanged,
}: {
  requirement: ReportingRequirement;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive() {
    setError(null);
    setBusy(true);
    try {
      await api.patch(`/reporting-requirements/${requirement.id}`, {
        isActive: !requirement.isActive,
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  const isAllLabs = requirement.laboratoryId === null;

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>
          {isAllLabs ? 'All active laboratories' : requirement.laboratory?.name ?? '—'}
        </div>
        {!isAllLabs && requirement.laboratory?.code && (
          <div className="text-sm muted mono">{requirement.laboratory.code}</div>
        )}
      </td>
      <td>
        <Pill tone={requirement.isActive ? 'green' : 'slate'}>
          {requirement.isActive ? 'Active' : 'Disabled'}
        </Pill>
        {error && <div className="field__error">{error}</div>}
      </td>
      <td style={{ textAlign: 'right' }}>
        <Button variant="ghost" size="sm" onClick={toggleActive} disabled={busy}>
          {requirement.isActive ? 'Disable' : 'Enable'}
        </Button>
      </td>
    </tr>
  );
}

function AddRequirementCard({
  reportType,
  labs,
  hasAllLabsRule,
  requiredLabIds,
  onChanged,
}: {
  reportType: ReportType;
  labs: Laboratory[];
  hasAllLabsRule: boolean;
  requiredLabIds: Set<string>;
  onChanged: () => Promise<void>;
}) {
  const [laboratoryId, setLaboratoryId] = useState(ALL_LABS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Labs that don't already have a specific requirement for this report type.
  const availableLabs = labs.filter((l) => !requiredLabIds.has(l.id));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/reporting-requirements', {
        reportTypeId: reportType.id,
        ...(laboratoryId === ALL_LABS ? {} : { laboratoryId }),
      });
      setLaboratoryId(ALL_LABS);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add requirement');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Add a requirement">
      <form onSubmit={submit}>
        {error && (
          <div style={{ marginBottom: 12 }}>
            <Callout tone="danger">{error}</Callout>
          </div>
        )}
        <Field
          label="Expected submitter"
          hint="“All active laboratories” expects every active lab; a single lab targets just that one."
        >
          <select
            className="select"
            value={laboratoryId}
            onChange={(e) => setLaboratoryId(e.target.value)}
          >
            <option value={ALL_LABS} disabled={hasAllLabsRule}>
              All active laboratories{hasAllLabsRule ? ' (already added)' : ''}
            </option>
            {availableLabs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Button
          type="submit"
          disabled={busy || (laboratoryId === ALL_LABS && hasAllLabsRule)}
        >
          <Plus size={16} /> Add requirement
        </Button>
      </form>
    </Card>
  );
}
