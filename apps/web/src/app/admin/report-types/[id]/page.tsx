'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FilePlus2, Pencil, Eye, UploadCloud, ArrowLeft, Copy, X } from 'lucide-react';
import { ReportDefinitionStatus } from '@ohb/shared';
import { api, ApiError } from '@/lib/api';
import type { DefinitionVersionSummary, ReportType } from '@/lib/types';
import {
  Button,
  Callout,
  Card,
  DefinitionStatusPill,
  Pill,
  Select,
  Spinner,
} from '@/components/ui';

export default function ReportTypeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [reportType, setReportType] = useState<ReportType | null>(null);
  const [versions, setVersions] = useState<DefinitionVersionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showClone, setShowClone] = useState(false);

  const reload = useCallback(async () => {
    const [rt, vs] = await Promise.all([
      api.get<ReportType>(`/report-types/${id}`),
      api.get<DefinitionVersionSummary[]>(`/report-types/${id}/definition-versions`),
    ]);
    setReportType(rt);
    setVersions(vs);
  }, [id]);

  useEffect(() => {
    reload().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [reload]);

  async function createDraft(body: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<DefinitionVersionSummary>(
        `/report-types/${id}/definition-versions`,
        body,
      );
      router.push(`/admin/report-types/${id}/versions/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create draft');
      setBusy(false);
    }
  }

  async function publish(versionId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/report-types/${id}/definition-versions/${versionId}/publish`);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to publish');
    } finally {
      setBusy(false);
    }
  }

  if (error && !reportType)
    return <Callout tone="danger" title="Could not load">{error}</Callout>;
  if (!reportType || !versions)
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );

  const hasDraft = versions.some((v) => v.status === ReportDefinitionStatus.DRAFT);
  const latest = versions[0];

  return (
    <>
      <div className="page-head">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/report-types')}>
          <ArrowLeft size={15} /> Reports
        </Button>
        <div className="page-head__row" style={{ marginTop: 8 }}>
          <div>
            <div className="micro-label">{reportType.category?.name ?? 'Report type'}</div>
            <h1>{reportType.name}</h1>
            <p>
              <span className="mono">{reportType.code}</span> ·{' '}
              {reportType.defaultFrequency.toLowerCase()}
            </p>
          </div>
          <div className="toolbar">
            <Button
              variant="secondary"
              onClick={() => setShowClone((s) => !s)}
              disabled={busy || hasDraft}
              title={hasDraft ? 'Finish or publish the existing draft first' : 'Copy another report’s structure + rules'}
            >
              {showClone ? <X size={16} /> : <Copy size={16} />}
              Start from an existing report
            </Button>
            <Button
              onClick={() => createDraft(latest ? { cloneFromVersionId: latest.id } : {})}
              disabled={busy || hasDraft}
              title={hasDraft ? 'Finish or publish the existing draft first' : undefined}
            >
              <FilePlus2 size={16} />
              {latest ? 'New draft from latest' : 'Start first draft'}
            </Button>
          </div>
        </div>
      </div>

      {showClone && !hasDraft && (
        <ClonePicker
          currentReportTypeId={id}
          busy={busy}
          onClone={(versionId) => createDraft({ cloneFromDefinitionVersionId: versionId })}
        />
      )}

      {error && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="danger">{error}</Callout>
        </div>
      )}

      {versions.length === 0 ? (
        <Callout title="No structure yet">
          This report has no definition versions. Start a draft to author its field
          structure, then publish it so laboratories can submit against it.
        </Callout>
      ) : (
        <Card title="Definition versions" desc="Only a draft can be edited. Publishing freezes a version and archives the previous active one.">
          <table className="table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Status</th>
                <th>Submissions</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 600 }}>v{v.version}</td>
                  <td>
                    <DefinitionStatusPill status={v.status} />
                  </td>
                  <td>{v._count?.submissions ?? 0}</td>
                  <td className="text-sm muted">
                    {new Date(v.createdAt).toLocaleDateString()}
                    {v.createdBy ? ` · ${v.createdBy.fullName}` : ''}
                  </td>
                  <td>
                    <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
                      {v.status === ReportDefinitionStatus.DRAFT ? (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              router.push(`/admin/report-types/${id}/versions/${v.id}`)
                            }
                          >
                            <Pencil size={14} /> Edit
                          </Button>
                          <Button size="sm" onClick={() => publish(v.id)} disabled={busy}>
                            <UploadCloud size={14} /> Publish
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            router.push(`/admin/report-types/${id}/versions/${v.id}`)
                          }
                        >
                          <Eye size={14} /> View
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {versions.some((v) => v.status === ReportDefinitionStatus.PUBLISHED) ? (
        <div style={{ marginTop: 16 }}>
          <Callout title="Ready for submissions">
            This report has a published version. Open a reporting period under{' '}
            <strong>Periods</strong>, then laboratories can create and submit it.
          </Callout>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <Pill tone="amber">Not yet published — labs cannot submit until a version is published</Pill>
        </div>
      )}
    </>
  );
}

/**
 * Picker for "start from an existing report" (Phase 19): choose another report
 * type and one of its definition versions, and clone that version's structure
 * **and** business rules into a new DRAFT of this report type. The copy is fully
 * editable; the source version is untouched.
 */
function ClonePicker({
  currentReportTypeId,
  busy,
  onClone,
}: {
  currentReportTypeId: string;
  busy: boolean;
  onClone: (versionId: string) => void;
}) {
  const [reportTypes, setReportTypes] = useState<ReportType[] | null>(null);
  const [sourceTypeId, setSourceTypeId] = useState('');
  const [sourceVersions, setSourceVersions] = useState<DefinitionVersionSummary[] | null>(null);
  const [versionId, setVersionId] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ReportType[]>('/report-types')
      .then((all) => setReportTypes(all.filter((rt) => rt.id !== currentReportTypeId)))
      .catch(() => setReportTypes([]));
  }, [currentReportTypeId]);

  useEffect(() => {
    setSourceVersions(null);
    setVersionId('');
    if (!sourceTypeId) return;
    api
      .get<DefinitionVersionSummary[]>(`/report-types/${sourceTypeId}/definition-versions`)
      .then((vs) => {
        setSourceVersions(vs);
        // Default to the active published version, else the newest.
        const published = vs.find((v) => v.status === ReportDefinitionStatus.PUBLISHED);
        setVersionId((published ?? vs[0])?.id ?? '');
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : 'Failed to load versions'));
  }, [sourceTypeId]);

  return (
    <div style={{ marginBottom: 16 }}>
      <Card
        title="Start from an existing report"
        desc="Copy another report’s field structure and its business rules into a new editable draft of this report. The source is not changed."
      >
        {reportTypes && reportTypes.length === 0 ? (
          <Callout>There are no other reports to copy from yet.</Callout>
        ) : (
          <div className="grid grid--2" style={{ gap: 12, alignItems: 'end' }}>
            <div>
              <label className="micro-label" htmlFor="clone-src">Source report</label>
              <Select
                id="clone-src"
                value={sourceTypeId}
                onChange={(e) => setSourceTypeId(e.target.value)}
              >
                <option value="">Choose a report…</option>
                {(reportTypes ?? []).map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="micro-label" htmlFor="clone-ver">Version</label>
              <Select
                id="clone-ver"
                value={versionId}
                onChange={(e) => setVersionId(e.target.value)}
                disabled={!sourceVersions || sourceVersions.length === 0}
              >
                {!sourceVersions ? (
                  <option value="">{sourceTypeId ? 'Loading…' : 'Choose a report first'}</option>
                ) : sourceVersions.length === 0 ? (
                  <option value="">No versions to copy</option>
                ) : (
                  sourceVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version} · {v.status.toLowerCase()} · {v._count?.rules ?? 0} rules
                    </option>
                  ))
                )}
              </Select>
            </div>
          </div>
        )}
        {loadError && (
          <div style={{ marginTop: 12 }}>
            <Callout tone="danger">{loadError}</Callout>
          </div>
        )}
        <div className="toolbar" style={{ marginTop: 14 }}>
          <Button onClick={() => onClone(versionId)} disabled={busy || !versionId}>
            <Copy size={15} /> Create draft from this
          </Button>
        </div>
      </Card>
    </div>
  );
}
