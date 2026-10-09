'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Flag, MessageSquare, PlayCircle, RotateCcw, ShieldCheck } from 'lucide-react';
import { ReportStatus } from '@ohb/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { MentionableUser, SubmissionDetail } from '@/lib/types';
import { Button, Callout, Card, Field, Input, Pill, Select, Spinner, StatusPill, Textarea } from '@/components/ui';
import { ReportRenderer } from '@/components/report/ReportRenderer';
import { FeedbackList } from '@/components/report/FeedbackList';
import { MentionTextarea, extractMentionIds } from '@/components/report/MentionTextarea';
import { VersionHistory } from '@/components/report/VersionHistory';
import { SubmissionTimeline } from '@/components/report/SubmissionTimeline';
import { SignOffCard } from '@/components/report/SignOffCard';
import { ExportMenu } from '@/components/report/ExportMenu';
import { AttachmentsPanel } from '@/components/report/AttachmentsPanel';
import { anchorOptions } from '@/components/report/anchors';

export default function AdminSubmissionDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [commentAnchor, setCommentAnchor] = useState('');
  const [revision, setRevision] = useState('');
  const [revisionAnchor, setRevisionAnchor] = useState('');
  const [signName, setSignName] = useState('');
  const [signNote, setSignNote] = useState('');
  const [mentionables, setMentionables] = useState<MentionableUser[]>([]);

  const load = useCallback(async () => {
    const d = await api.get<SubmissionDetail>(`/submissions/${id}`);
    setDetail(d);
  }, [id]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [load]);

  useEffect(() => {
    api
      .get<MentionableUser[]>(`/submissions/${id}/mentionable-users`)
      .then(setMentionables)
      .catch(() => setMentionables([]));
  }, [id]);

  const anchors = useMemo(() => anchorOptions(detail?.renderModel ?? null), [detail?.renderModel]);

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

  const anchorPayload = useCallback(
    (anchorId: string) => {
      const a = anchors.find((o) => o.id === anchorId);
      return { sectionKey: a?.sectionKey, fieldKey: a?.fieldKey };
    },
    [anchors],
  );

  const onReply = useCallback(
    (parentId: string, message: string, mentions: string[]) =>
      act(() => api.post(`/submissions/${id}/feedback`, { parentId, message, mentions })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );

  const onResolve = useCallback(
    (rootId: string, resolved: boolean) =>
      act(() => api.post(`/submissions/${id}/feedback/${rootId}/resolve`, { resolved })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );

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
  const flags = detail.flags ?? [];

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
              {flags.length > 0 && (
                <Pill tone="amber">
                  <Flag size={12} /> {flags.length} flag{flags.length > 1 ? 's' : ''}
                </Pill>
              )}
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
        <div className="stack" style={{ gap: 20 }}>
          <Card
            title="Report data"
            actions={
              detail.renderModel ? (
                <ExportMenu submissionId={id} onError={(m) => setError(m || null)} />
              ) : undefined
            }
          >
            {detail.renderModel ? (
              <ReportRenderer model={detail.renderModel} data={detail.data} mode="read" />
            ) : (
              <Callout tone="danger">This submission has no usable schema.</Callout>
            )}
          </Card>

          <Card title="Supporting documents" desc="Files the laboratory attached to this report.">
            <AttachmentsPanel submissionId={id} />
          </Card>

          <Card title="Submission history" desc="Every submit and resubmit, kept immutably.">
            <VersionHistory
              submissionId={id}
              renderModel={detail.renderModel}
              refreshKey={detail.currentVersion}
            />
          </Card>

          <Card title="Activity timeline" desc="Every step in this report's lifecycle, in order.">
            <SubmissionTimeline
              submissionId={id}
              refreshKey={`${detail.status}:${detail.currentVersion}:${detail.feedback.length}`}
            />
          </Card>
        </div>

        <div className="stack" style={{ gap: 20 }}>
          <SignOffCard signOffs={detail.signOffs} />

          {flags.length > 0 && (
            <Card title="Flagged for review">
              <div className="text-sm muted" style={{ marginBottom: 10 }}>
                Advisory rule outcomes recorded when the report was submitted. They do not block
                approval — use them to decide whether a revision is needed.
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {flags.map((f, i) => (
                  <div
                    key={`${f.ruleKey}:${i}`}
                    className="builder-section"
                    style={{ margin: 0, background: 'var(--surface-muted)' }}
                  >
                    <div className="toolbar" style={{ marginBottom: 4 }}>
                      <Pill tone="amber">
                        <Flag size={12} /> flag
                      </Pill>
                      <span className="spacer" />
                      {f.fieldPath && <span className="text-sm mono muted">{f.fieldPath}</span>}
                    </div>
                    <div className="text-sm">{f.message}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

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
                <Field
                  label="Approve &amp; sign off"
                  hint="Completing the review records an accountable, dated sign-off. Type your full name to confirm."
                >
                  <Input
                    value={signName}
                    onChange={(e) => setSignName(e.target.value)}
                    placeholder={user?.fullName ?? 'Your full name'}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Sign-off note (optional)">
                  <Textarea
                    value={signNote}
                    onChange={(e) => setSignNote(e.target.value)}
                    placeholder="Any note to accompany the approval…"
                  />
                </Field>
                <Button
                  block
                  disabled={busy || !signName.trim()}
                  onClick={() =>
                    act(async () => {
                      await api.post(`/submissions/${id}/review/approve`, {
                        confirmName: signName.trim(),
                        note: signNote.trim() || undefined,
                      });
                      setSignName('');
                      setSignNote('');
                    })
                  }
                >
                  <ShieldCheck size={16} /> Approve &amp; sign off
                </Button>
                <div className="divider" />
                <Field label="Request revision" hint="Explain what needs to change.">
                  <Textarea
                    value={revision}
                    onChange={(e) => setRevision(e.target.value)}
                    placeholder="Describe the corrections required…"
                  />
                </Field>
                <Field label="Applies to">
                  <Select value={revisionAnchor} onChange={(e) => setRevisionAnchor(e.target.value)}>
                    {anchors.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button
                  block
                  variant="danger"
                  disabled={busy || !revision.trim()}
                  onClick={() =>
                    act(async () => {
                      await api.post(`/submissions/${id}/review/request-revision`, {
                        message: revision.trim(),
                        ...anchorPayload(revisionAnchor),
                      });
                      setRevision('');
                      setRevisionAnchor('');
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
              <FeedbackList
                feedback={detail.feedback}
                model={detail.renderModel}
                onReply={onReply}
                onResolve={onResolve}
                users={mentionables}
                busy={busy}
              />
            </div>
            <div className="divider" />
            <Field label="Add a comment" hint="Type @ to mention the laboratory or a colleague.">
              <MentionTextarea
                value={comment}
                onChange={setComment}
                users={mentionables}
                placeholder="Leave a note for the laboratory…"
              />
            </Field>
            <Field label="Applies to">
              <Select value={commentAnchor} onChange={(e) => setCommentAnchor(e.target.value)}>
                {anchors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              variant="secondary"
              disabled={busy || !comment.trim()}
              onClick={() =>
                act(async () => {
                  await api.post(`/submissions/${id}/feedback`, {
                    message: comment.trim(),
                    mentions: extractMentionIds(comment, mentionables),
                    ...anchorPayload(commentAnchor),
                  });
                  setComment('');
                  setCommentAnchor('');
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
