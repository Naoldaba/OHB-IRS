'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, Send } from 'lucide-react';
import { ReportStatus, canEditData } from '@ohb/shared';
import { api, ApiError } from '@/lib/api';
import type { Feedback, SaveDraftResponse, SubmissionDetail } from '@/lib/types';
import { Button, Callout, Card, Spinner, StatusPill } from '@/components/ui';
import { ReportRenderer } from '@/components/report/ReportRenderer';
import { FeedbackList } from '@/components/report/FeedbackList';
import { VersionHistory } from '@/components/report/VersionHistory';
import { ExportMenu } from '@/components/report/ExportMenu';

function toErrorMap(errors: { path: string; message: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const e of errors) map[e.path] = e.message;
  return map;
}

export default function LabSubmissionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await api.get<SubmissionDetail>(`/submissions/${id}`);
    setDetail(d);
    setData(d.data ?? {});
    setDirty(false);
  }, [id]);

  useEffect(() => {
    load().catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load'));
  }, [load]);

  if (loadError && !detail) return <Callout tone="danger" title="Could not load">{loadError}</Callout>;
  if (!detail)
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );

  const editable = canEditData(detail.status);

  async function save(): Promise<boolean> {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const res = await api.patch<SaveDraftResponse>(`/submissions/${id}`, { data });
      setErrors(toErrorMap(res.validation.errors));
      setDirty(false);
      setNotice(
        res.validation.ok
          ? 'Draft saved — all required cells are filled.'
          : 'Draft saved. Some cells still need attention before you can submit.',
      );
      return true;
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to save');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    const saved = await save();
    if (!saved) return;
    setBusy(true);
    setActionError(null);
    try {
      const action = detail!.status === ReportStatus.REVISION_REQUIRED ? 'resubmit' : 'submit';
      await api.post(`/submissions/${id}/${action}`);
      setNotice(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setErrors(toErrorMap(err.fieldErrors));
        setActionError('Report is incomplete or invalid. Fix the highlighted cells and try again.');
      } else {
        setActionError(err instanceof ApiError ? err.message : 'Failed to submit');
      }
    } finally {
      setBusy(false);
    }
  }

  async function reply(parentId: string, message: string) {
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/submissions/${id}/feedback`, { parentId, message });
      // Refresh only the feedback so any in-progress draft edits are preserved.
      const feedback = await api.get<Feedback[]>(`/submissions/${id}/feedback`);
      setDetail((d) => (d ? { ...d, feedback } : d));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to send reply');
    } finally {
      setBusy(false);
    }
  }

  const submitLabel = detail.status === ReportStatus.REVISION_REQUIRED ? 'Resubmit' : 'Submit';

  return (
    <>
      <div className="page-head">
        <Button variant="ghost" size="sm" onClick={() => router.push('/lab')}>
          <ArrowLeft size={15} /> My reports
        </Button>
        <div className="page-head__row" style={{ marginTop: 8 }}>
          <div>
            <div className="micro-label">{detail.reportingPeriod?.label}</div>
            <h1 style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {detail.reportType?.name} <StatusPill status={detail.status} />
            </h1>
          </div>
          {editable && (
            <div className="toolbar">
              <Button variant="secondary" onClick={save} disabled={busy || !dirty}>
                <Save size={16} /> Save draft
              </Button>
              <Button onClick={submit} disabled={busy}>
                <Send size={16} /> {submitLabel}
              </Button>
            </div>
          )}
        </div>
      </div>

      {actionError && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="danger" title="Could not continue">
            {actionError}
          </Callout>
        </div>
      )}
      {notice && (
        <div style={{ marginBottom: 16 }}>
          <Callout title="Saved">{notice}</Callout>
        </div>
      )}
      {!editable && detail.status !== ReportStatus.APPROVED && (
        <div style={{ marginBottom: 16 }}>
          <Callout title="Submitted">
            This report is {detail.status.toLowerCase().replace('_', ' ')} and is now read-only
            until the Bureau responds.
          </Callout>
        </div>
      )}

      <div className="split" style={{ gridTemplateColumns: '1fr 340px' }}>
        <Card
          title={editable ? 'Fill in the report' : 'Report data'}
          desc={editable ? 'Export reflects the last saved draft — save before exporting to include recent edits.' : undefined}
          actions={
            detail.renderModel ? (
              <ExportMenu submissionId={id} onError={(m) => setActionError(m || null)} />
            ) : undefined
          }
        >
          {detail.renderModel ? (
            <ReportRenderer
              model={detail.renderModel}
              data={data}
              mode={editable ? 'edit' : 'read'}
              errors={errors}
              onChange={(next) => {
                setData(next);
                setDirty(true);
              }}
            />
          ) : (
            <Callout tone="danger">This report has no usable structure.</Callout>
          )}
        </Card>

        <Card title="Bureau feedback">
          <FeedbackList
            feedback={detail.feedback}
            model={detail.renderModel}
            onReply={reply}
            busy={busy}
          />
        </Card>
      </div>

      <div style={{ marginTop: 20 }}>
        <Card title="Submission history" desc="Each time you submit or resubmit, a copy is kept.">
          <VersionHistory
            submissionId={id}
            renderModel={detail.renderModel}
            refreshKey={detail.currentVersion}
          />
        </Card>
      </div>
    </>
  );
}
