'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button, Callout } from '@/components/ui';

/**
 * Download control for compliance dashboards (Phase 19). Streams the current
 * view's figures — honouring the active report-type filter — as CSV or Excel via
 * the credentialed `api.download`; the server is the single source of the
 * numbers, so the file always matches what's on screen. Used on both the Bureau
 * dashboard (`/analytics/dashboard/export`) and the lab dashboard
 * (`/analytics/my-lab/export`, scoped server-side to the user's own lab).
 */
export function AnalyticsExport({
  basePath,
  reportTypeId,
  disabled,
}: {
  basePath: string;
  reportTypeId?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState<'csv' | 'xlsx' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(format: 'csv' | 'xlsx') {
    if (busy) return;
    setError(null);
    setBusy(format);
    const params = new URLSearchParams({ format });
    if (reportTypeId) params.set('reportTypeId', reportTypeId);
    try {
      await api.download(`${basePath}?${params.toString()}`, `compliance.${format}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not download the file.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack" style={{ gap: 6, alignItems: 'flex-end' }}>
      <div className="toolbar" style={{ gap: 8 }} role="group" aria-label="Download compliance data">
        <span className="micro-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Download size={13} /> Export
        </span>
        <Button variant="secondary" size="sm" disabled={disabled || !!busy} onClick={() => run('csv')}>
          <FileText size={14} /> {busy === 'csv' ? 'Preparing…' : 'CSV'}
        </Button>
        <Button variant="secondary" size="sm" disabled={disabled || !!busy} onClick={() => run('xlsx')}>
          <FileSpreadsheet size={14} /> {busy === 'xlsx' ? 'Preparing…' : 'Excel'}
        </Button>
      </div>
      {error && (
        <div style={{ maxWidth: 280 }}>
          <Callout tone="danger">{error}</Callout>
        </div>
      )}
    </div>
  );
}
