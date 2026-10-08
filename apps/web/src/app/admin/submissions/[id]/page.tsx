'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Check, MessageSquare, PlayCircle, RotateCcw } from 'lucide-react';
import { ReportStatus } from '@ohb/shared';
import { api, ApiError } from '@/lib/api';
import type { SubmissionDetail } from '@/lib/types';
import { Button, Callout, Card, Field, Spinner, StatusPill, Textarea } from '@/components/ui';
import { ReportRenderer } from '@/components/report/ReportRenderer';
import { FeedbackList } from '@/components/report/FeedbackList';

export default function AdminSubmissionDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [revision, setRevision] = useState('');

  const load = useCallback(async () => {
    const d = await api.get<SubmissionDetail>(`/submissions/${id}`);
    setDetail(d);
  }, [id]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  if (error && !detail) return <Callout tone="danger" title="Could not load">{error}</Callout>;
  if (!detail)
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );

  const status = detail.status;
  const canStart = status === ReportStatus.SUBMITTED || status === ReportStatus.RESUBMITTED;
  const canReview = status === ReportStatus.UNDER_REVIEW;

  return (
    <>
      <div className="page-head">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/submissions')}>
          <ArrowLeft size={15} /> Review queue
        </Button>
        <div className="page-head__row" style={{ marginTop: 8 }}>
          <div>
            <div className="micro-label">{detail.laboratory?.name ?? 'Laboratory'}</div>
            <h1 style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {detail.reportType?.name} <StatusPill status={status} />
            </h1>
            <p>
              {detail.reportingPeriod?.label}
              {detail.definitionVersion ? ` · definition v${detail.definitionVersion.version}` : ''}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="danger">{error}</Callout>
        </div>
      )}

      <div className="split" style={{ gridTemplateColumns: '1fr 360px' }}>
        <div>
          <Card title="Report data">
            {detail.renderModel ? (
              <ReportRenderer model={detail.renderModel} data={detail.data} mode="read" />
            ) : (
              <Callout tone="danger">This submission has no usable schema.</Callout>
            )}
          </Card>
        </div>

        <div>
          <Card title="Review actions">
            {canStart && (
              <Button
                block
                onClick={() => act(() => api.post(`/submissions/${id}/review/start`))}
                disabled={busy}
              >
                <PlayCircle size={16} /> Start review
              </Button>
            )}

            {canReview && (
              <div className="stack">
                <Button
                  block
                  onClick={() => act(() => api.post(`/submissions/${id}/review/approve`))}
                  disabled={busy}
                >
                  <Check size={16} /> Approve
                </Button>
                <div className="divider" />
                <Field label="Request revision" hint="Explain what needs to change.">
                  <Textarea
                    value={revision}
                    onChange={(e) => setRevision(e.target.value)}
                    placeholder="Describe the corrections required…"
                  />
                </Field>
                <Button
                  block
                  variant="danger"
                  disabled={busy || !revision.trim()}
                  onClick={() =>
                    act(async () => {
                      await api.post(`/submissions/${id}/review/request-revision`, {
                        message: revision.trim(),
                      });
                      setRevision('');
                    })
                  }
                >
                  <RotateCcw size={16} /> Request revision
                </Button>
              </div>
            )}

            {!canStart && !canReview && (
              <div className="text-sm muted">
                No actions available while this report is {status.toLowerCase().replace('_', ' ')}.
              </div>
            )}
          </Card>

          <Card title="Feedback">
            <div style={{ marginBottom: 14 }}>
              <FeedbackList feedback={detail.feedback} />
            </div>
            <div className="divider" />
            <Field label="Add a comment">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Leave a note for the laboratory…"
              />
            </Field>
            <Button
              variant="secondary"
              disabled={busy || !comment.trim()}
              onClick={() =>
                act(async () => {
                  await api.post(`/submissions/${id}/feedback`, { message: comment.trim() });
                  setComment('');
                })
              }
            >
              <MessageSquare size={15} /> Add comment
            </Button>
          </Card>
        </div>
      </div>
    </>
  );
}
