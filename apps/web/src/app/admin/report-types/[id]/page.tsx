'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FilePlus2, Pencil, Eye, UploadCloud, ArrowLeft } from 'lucide-react';
import { ReportDefinitionStatus } from '@ohb/shared';
import { api, ApiError } from '@/lib/api';
import type { DefinitionVersionSummary, ReportType } from '@/lib/types';
import {
  Button,
  Callout,
  Card,
  DefinitionStatusPill,
  Pill,
  Spinner,
} from '@/components/ui';

export default function ReportTypeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [reportType, setReportType] = useState<ReportType | null>(null);
  const [versions, setVersions] = useState<DefinitionVersionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function createDraft(cloneFromVersionId?: string) {
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<DefinitionVersionSummary>(
        `/report-types/${id}/definition-versions`,
        cloneFromVersionId ? { cloneFromVersionId } : {},
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
          <Button
            onClick={() => createDraft(latest ? latest.id : undefined)}
            disabled={busy || hasDraft}
            title={hasDraft ? 'Finish or publish the existing draft first' : undefined}
          >
            <FilePlus2 size={16} />
            {latest ? 'New draft from latest' : 'Start first draft'}
          </Button>
        </div>
      </div>

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
