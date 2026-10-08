'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Paperclip, Trash2, Upload } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { Attachment } from '@/lib/types';
import { Button, Callout, Field, Select, Spinner } from '@/components/ui';

/** A selectable report section the attachment can be anchored to. */
export interface SectionOption {
  key: string;
  label: string;
}

interface Props {
  submissionId: string;
  /** When true, the owning lab may upload and remove (report is editable). */
  canManage?: boolean;
  /** Sections offered as an optional anchor on upload. */
  sections?: SectionOption[];
}

/** Human-readable file size. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Addis_Ababa',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

export function AttachmentsPanel({ submissionId, canManage = false, sections = [] }: Props) {
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.get<Attachment[]>(`/submissions/${submissionId}/attachments`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load attachments');
    }
  }, [submissionId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onUpload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (section) form.append('sectionKey', section);
      await api.upload(`/submissions/${submissionId}/attachments`, form);
      setSection('');
      if (fileInput.current) fileInput.current.value = '';
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function onDownload(att: Attachment) {
    setError(null);
    try {
      await api.download(`/submissions/${submissionId}/attachments/${att.id}/download`, att.fileName);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Download failed');
    }
  }

  async function onRemove(att: Attachment) {
    setBusy(true);
    setError(null);
    try {
      await api.del(`/submissions/${submissionId}/attachments/${att.id}`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not remove attachment');
    } finally {
      setBusy(false);
    }
  }

  const sectionLabel = (key?: string | null) =>
    key ? sections.find((s) => s.key === key)?.label ?? key : null;

  if (!items) return <Spinner />;

  return (
    <div className="stack" style={{ gap: 12 }}>
      {error && <Callout tone="danger">{error}</Callout>}

      {items.length === 0 ? (
        <div className="text-sm muted">No supporting documents attached.</div>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {items.map((att) => (
            <div
              key={att.id}
              className="builder-section"
              style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <Paperclip size={16} className="muted" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="text-sm" style={{ fontWeight: 600, wordBreak: 'break-word' }}>
                  {att.fileName}
                </div>
                <div className="text-sm muted">
                  {formatBytes(att.size)}
                  {att.uploadedBy ? ` · ${att.uploadedBy.fullName}` : ''}
                  {` · ${formatDate(att.createdAt)}`}
                  {sectionLabel(att.sectionKey) ? ` · ${sectionLabel(att.sectionKey)}` : ''}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onDownload(att)} title="Download">
                <Download size={15} />
              </Button>
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(att)}
                  disabled={busy}
                  title="Remove"
                >
                  <Trash2 size={15} />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <>
          <div className="divider" />
          {sections.length > 0 && (
            <Field label="Relates to (optional)">
              <Select value={section} onChange={(e) => setSection(e.target.value)}>
                <option value="">General — the whole report</option>
                {sections.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <input
            ref={fileInput}
            type="file"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
            }}
          />
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={15} /> {busy ? 'Uploading…' : 'Add attachment'}
          </Button>
          <div className="text-sm muted">
            PDF, image, Excel, Word, CSV or text. Up to 10 MB.
          </div>
        </>
      )}
    </div>
  );
}
