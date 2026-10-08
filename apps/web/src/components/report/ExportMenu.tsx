'use client';

/**
 * Export dropdown for a submission detail page. Offers the report as Excel,
 * Word or PDF; the file is generated server-side from the same definition the
 * page renders, downloaded credentialed via `api.download`. An optional
 * `version` exports a historical immutable snapshot instead of current data.
 */

import { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, FileType2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

const FORMATS = [
  { key: 'xlsx', label: 'Excel (.xlsx)', Icon: FileSpreadsheet },
  { key: 'docx', label: 'Word (.docx)', Icon: FileText },
  { key: 'pdf', label: 'PDF (.pdf)', Icon: FileType2 },
] as const;

export function ExportMenu({
  submissionId,
  version,
  onError,
}: {
  submissionId: string;
  version?: number;
  onError?: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function run(format: string) {
    setBusy(format);
    onError?.('');
    try {
      const q = new URLSearchParams({ format });
      if (version !== undefined) q.set('version', String(version));
      await api.download(`/submissions/${submissionId}/export?${q.toString()}`);
      setOpen(false);
    } catch (e) {
      onError?.(e instanceof ApiError ? e.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="export-menu" ref={rootRef}>
      <button
        type="button"
        className="btn btn--secondary"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy !== null}
      >
        <Download size={16} /> Export
      </button>
      {open && (
        <div className="export-menu__panel" role="menu">
          {FORMATS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              className="export-menu__item"
              disabled={busy !== null}
              onClick={() => void run(key)}
            >
              <Icon size={15} />
              <span>{label}</span>
              {busy === key && <span className="export-menu__spin">…</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
