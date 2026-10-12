'use client';

/**
 * Structure editor for the `document` (attachment-only) layout. There are no
 * fields — the admin writes the instructions the lab sees, sets how many files
 * are required to submit, and optionally restricts the accepted file types.
 */

import { FILE_TYPE_CATEGORIES, type DocumentFieldSchema } from '@ohb/shared';
import { Field } from '@/components/ui';

export function DocumentBuilder({
  schema,
  readOnly,
  onChange,
}: {
  schema: DocumentFieldSchema;
  readOnly: boolean;
  onChange: (schema: DocumentFieldSchema) => void;
}) {
  function patch(part: Partial<DocumentFieldSchema>) {
    onChange({ ...schema, ...part });
  }

  const selected = new Set(schema.allowedFileTypes ?? []);
  function toggleType(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    patch({ allowedFileTypes: [...next] });
  }

  return (
    <div className="builder-section">
      <Field label="Instructions for the lab" hint="What should they upload? Shown above the attachment panel.">
        <textarea
          className="input"
          rows={4}
          disabled={readOnly}
          placeholder="e.g. Upload the signed monthly report as a single PDF."
          value={schema.instructions ?? ''}
          onChange={(e) => patch({ instructions: e.target.value })}
        />
      </Field>

      <Field label="Minimum files required to submit">
        <input
          className="input input--inline"
          type="number"
          min={0}
          disabled={readOnly}
          value={schema.minAttachments ?? 1}
          onChange={(e) => patch({ minAttachments: Math.max(0, Number(e.target.value) || 0) })}
        />
      </Field>

      <div style={{ marginTop: 6 }}>
        <div className="micro-label" style={{ marginBottom: 6 }}>
          Accepted file types <span className="muted text-sm">(none selected = any supported type)</span>
        </div>
        <div className="chip-row">
          {FILE_TYPE_CATEGORIES.map((cat) => {
            const on = selected.has(cat.key);
            return (
              <label
                key={cat.key}
                className={`pill ${on ? 'pill--green' : 'pill--slate'}`}
                style={{ cursor: readOnly ? 'default' : 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={readOnly}
                  onChange={() => toggleType(cat.key)}
                  style={{ margin: 0 }}
                />
                {cat.label}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
