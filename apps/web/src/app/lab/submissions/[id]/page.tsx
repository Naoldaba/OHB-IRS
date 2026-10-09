'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, Send } from 'lucide-react';
import { ReportStatus, canEditData } from '@ohb/shared';
import { api, ApiError } from '@/lib/api';
import type { Feedback, MentionableUser, SaveDraftResponse, SubmissionDetail } from '@/lib/types';
import { Button, Callout, Card, Spinner, StatusPill } from '@/components/ui';
import { ReportRenderer } from '@/components/report/ReportRenderer';
import { ValidationSummary } from '@/components/report/ValidationSummary';
import { FeedbackList } from '@/components/report/FeedbackList';
import { VersionHistory } from '@/components/report/VersionHistory';
import { SubmissionTimeline } from '@/components/report/SubmissionTimeline';
import { SignOffCard } from '@/components/report/SignOffCard';
import { ExportMenu } from '@/components/report/ExportMenu';
import { AttachmentsPanel } from '@/components/report/AttachmentsPanel';
import { sectionOptions } from '@/components/report/anchors';

const AUTOSAVE_DELAY_MS = 1500;
const LEAVE_PROMPT = 'You have unsaved changes. Leave this report and discard them?';

function toErrorMap(errors: { path: string; message: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const e of errors) map[e.path] = e.message;
  return map;
}

type AutosaveState =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved'; ok: boolean }
  | { state: 'error' };

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
  const [autosave, setAutosave] = useState<AutosaveState>({ state: 'idle' });
  const [mentionables, setMentionables] = useState<MentionableUser[]>([]);

  const editable = !!detail && canEditData(detail.status);

  const load = useCallback(async () => {
    const d = await api.get<SubmissionDetail>(`/submissions/${id}`);
    setDetail(d);
    setData(d.data ?? {});
    setDirty(false);
  }, [id]);

  useEffect(() => {
    load().catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load'));
  }, [load]);

  useEffect(() => {
    api
      .get<MentionableUser[]>(`/submissions/${id}/mentionable-users`)
      .then(setMentionables)
      .catch(() => setMentionables([]));
  }, [id]);

  // Persist the draft and refresh the validator diagnostics. The response's
  // `validation.errors` are non-blocking on a draft PATCH; they drive both the
  // per-cell markers and the pre-submit summary.
  const persist = useCallback(async () => {
    const res = await api.patch<SaveDraftResponse>(`/submissions/${id}`, { data });
    setErrors(toErrorMap(res.validation.errors));
    setDirty(false);
    return res;
  }, [id, data]);

  // Debounced autosave — quiet, no big banner, never on read-only submissions.
  const autosaveNow = useCallback(async () => {
    setAutosave({ state: 'saving' });
    try {
      const res = await persist();
      setAutosave({ state: 'saved', ok: res.validation.ok });
    } catch {
      setAutosave({ state: 'error' });
    }
  }, [persist]);

  useEffect(() => {
    if (!editable || !dirty || busy) return;
    const t = setTimeout(() => void autosaveNow(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [editable, dirty, busy, autosaveNow]);

  // Warn before a full page unload (refresh / close / hard navigation) while
  // there are edits the autosave has not yet flushed.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // In-app navigation guard: intercept link clicks (header/sidebar) while dirty.
  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]') as
        | HTMLAnchorElement
        | null;
      if (!anchor || anchor.target === '_blank') return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (!window.confirm(LEAVE_PROMPT)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty]);

  if (loadError && !detail) return <Callout tone="danger" title="Could not load">{loadError}</Callout>;
  if (!detail)
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );

  async function save(): Promise<boolean> {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const res = await persist();
      setAutosave({ state: 'idle' });
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

  function leave() {
    if (dirty && !window.confirm(LEAVE_PROMPT)) return;
    router.push('/lab');
  }

  async function refreshFeedback() {
    // Refresh only the feedback so any in-progress draft edits are preserved.
    const feedback = await api.get<Feedback[]>(`/submissions/${id}/feedback`);
    setDetail((d) => (d ? { ...d, feedback } : d));
  }

  async function reply(parentId: string, message: string, mentions: string[]) {
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/submissions/${id}/feedback`, { parentId, message, mentions });
      await refreshFeedback();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to send reply');
    } finally {
      setBusy(false);
    }
  }

  async function resolve(rootId: string, resolved: boolean) {
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/submissions/${id}/feedback/${rootId}/resolve`, { resolved });
      await refreshFeedback();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to update thread');
    } finally {
      setBusy(false);
    }
  }

  const submitLabel = detail.status === ReportStatus.REVISION_REQUIRED ? 'Resubmit' : 'Submit';

  return (
    <>
      <div className="page-head">
        <Button variant="ghost" size="sm" onClick={leave}>
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
              <AutosaveIndicator state={autosave} dirty={dirty} />
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

      {editable && <ValidationSummary model={detail.renderModel} errors={errors} />}

      {detail.signOffs.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <SignOffCard signOffs={detail.signOffs} />
        </div>
      )}

      <div className="split" style={{ gridTemplateColumns: '1fr 340px' }}>
        <Card
          title={editable ? 'Fill in the report' : 'Report data'}
          desc={editable ? 'Your draft saves automatically as you type.' : undefined}
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
            onResolve={resolve}
            users={mentionables}
            busy={busy}
          />
        </Card>
      </div>

      <div style={{ marginTop: 20 }}>
        <Card
          title="Supporting documents"
          desc={
            editable
              ? 'Attach files that support this report. They can be added or removed while the report is editable.'
              : 'Files attached to this report.'
          }
        >
          <AttachmentsPanel
            submissionId={id}
            canManage={editable}
            sections={sectionOptions(detail.renderModel)}
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

      <div style={{ marginTop: 20 }}>
        <Card title="Activity timeline" desc="Every step in this report's lifecycle, in order.">
          <SubmissionTimeline
            submissionId={id}
            refreshKey={`${detail.status}:${detail.currentVersion}:${detail.feedback.length}`}
          />
        </Card>
      </div>
    </>
  );
}

function AutosaveIndicator({ state, dirty }: { state: AutosaveState; dirty: boolean }) {
  let label: string | null = null;
  let error = false;
  if (state.state === 'saving') label = 'Saving…';
  else if (dirty) label = 'Unsaved changes';
  else if (state.state === 'saved')
    label = state.ok ? 'Saved' : 'Saved — some cells to fix';
  else if (state.state === 'error') {
    label = 'Autosave failed — use Save draft';
    error = true;
  }
  if (!label) return null;
  return (
    <span className={`autosave${error ? ' autosave--error' : ''}`} role="status" aria-live="polite">
      {label}
    </span>
  );
}
