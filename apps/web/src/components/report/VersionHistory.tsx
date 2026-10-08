'use client';

/**
 * Version-history viewer. Each submit / resubmit writes an immutable
 * SubmissionVersion snapshot (never overwritten). This lists them newest-first
 * and lets a reviewer expand any one to see exactly the data that was submitted,
 * rendered read-only through the same shared renderer as the live form.
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { RenderModel } from '@ohb/shared';
import { api } from '@/lib/api';
import type { SubmissionVersionRow } from '@/lib/types';
import { Spinner, StatusPill } from '@/components/ui';
import { ReportRenderer } from './ReportRenderer';

export function VersionHistory({
  submissionId,
  renderModel,
  /** Bump to refetch (e.g. after a resubmit adds a snapshot). */
  refreshKey,
}: {
  submissionId: string;
  renderModel: RenderModel | null;
  refreshKey?: unknown;
}) {
  const [versions, setVersions] = useState<SubmissionVersionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<SubmissionVersionRow[]>(`/submissions/${submissionId}/versions`)
      .then(setVersions)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load history'));
  }, [submissionId]);

  useEffect(() => {
    setVersions(null);
    load();
  }, [load, refreshKey]);

  if (error) return <div className="text-sm muted">{error}</div>;
  if (!versions) return <Spinner />;
  if (versions.length === 0) {
    return <div className="table__empty">No submitted versions yet.</div>;
  }

  const ordered = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);

  return (
    <div className="stack" style={{ gap: 10 }}>
      {ordered.map((v) => {
        const open = openId === v.id;
        return (
          <div key={v.id} className="builder-section" style={{ margin: 0 }}>
            <button
              className="btn btn--ghost"
              style={{ width: '100%', justifyContent: 'flex-start', gap: 8 }}
              onClick={() => setOpenId(open ? null : v.id)}
            >
              {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              <strong>v{v.versionNumber}</strong>
              <StatusPill status={v.status} />
              <span className="spacer" />
              <span className="text-sm muted">
                {v.submittedBy?.fullName ?? 'Lab'} · {new Date(v.submittedAt).toLocaleString()}
              </span>
            </button>
            {open && (
              <div style={{ marginTop: 12 }}>
                {renderModel ? (
                  <ReportRenderer model={renderModel} data={v.data} mode="read" />
                ) : (
                  <div className="text-sm muted">No schema available to render this snapshot.</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
