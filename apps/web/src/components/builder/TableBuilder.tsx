'use client';

/**
 * Structure editor for the `table` layout: per-row dimension columns (the inputs
 * a lab fills on every row, e.g. Zone / Woreda / facility), plus grouped metric
 * columns (reused from the matrix contract). Rows are open-ended at fill time, so
 * there is no row list here — the lab adds rows in the renderer. Keys are
 * lower_snake_case and double as the stable field path.
 */

import { Plus, Trash2 } from 'lucide-react';
import type {
  ColumnGroupDef,
  MetricDef,
  SelectOption,
  SimpleFieldType,
  TableDimensionColumn,
  TableFieldSchema,
} from '@ohb/shared';
import { Button, Field } from '@/components/ui';
import { slugifyKey } from '@/lib/slug';
import { removeAt, replaceAt } from './schema-helpers';

const DIM_TYPES: SimpleFieldType[] = ['text', 'integer', 'number', 'date', 'select'];

export function TableBuilder({
  schema,
  readOnly,
  onChange,
}: {
  schema: TableFieldSchema;
  readOnly: boolean;
  onChange: (schema: TableFieldSchema) => void;
}) {
  function patch(part: Partial<TableFieldSchema>) {
    onChange({ ...schema, ...part });
  }

  /* ---- Dimensions ---- */
  function addDimension() {
    const n = schema.dimensions.length + 1;
    patch({ dimensions: [...schema.dimensions, { key: `column_${n}`, label: `Column ${n}`, type: 'text' }] });
  }
  function updateDimension(i: number, next: TableDimensionColumn) {
    patch({ dimensions: replaceAt(schema.dimensions, i, next) });
  }
  function removeDimension(i: number) {
    patch({ dimensions: removeAt(schema.dimensions, i) });
  }

  /* ---- Column groups ---- */
  function addGroup() {
    const n = schema.columnGroups.length + 1;
    patch({ columnGroups: [...schema.columnGroups, { key: `group_${n}`, label: `Group ${n}` }] });
  }
  function updateGroup(i: number, next: ColumnGroupDef) {
    patch({ columnGroups: replaceAt(schema.columnGroups, i, next) });
  }
  function removeGroup(i: number) {
    patch({ columnGroups: removeAt(schema.columnGroups, i) });
  }

  /* ---- Metrics ---- */
  function addMetric() {
    const n = schema.metrics.length + 1;
    patch({ metrics: [...schema.metrics, { key: `metric_${n}`, label: `Metric ${n}`, type: 'integer' }] });
  }
  function updateMetric(i: number, next: MetricDef) {
    patch({ metrics: replaceAt(schema.metrics, i, next) });
  }
  function removeMetric(i: number) {
    patch({ metrics: removeAt(schema.metrics, i) });
  }

  return (
    <div>
      {/* Dimension columns */}
      <div className="builder-section">
        <div className="builder-section__head">
          <h3 className="card__title" style={{ fontSize: 15 }}>
            Row columns <span className="muted text-sm">(entered once per row)</span>
          </h3>
          {!readOnly && (
            <Button variant="secondary" size="sm" onClick={addDimension}>
              <Plus size={14} /> Add column
            </Button>
          )}
        </div>
        <div className="stack" style={{ gap: 12 }}>
          {schema.dimensions.map((dim, i) => (
            <DimensionRow
              key={i}
              dim={dim}
              readOnly={readOnly}
              onChange={(next) => updateDimension(i, next)}
              onRemove={schema.dimensions.length > 1 ? () => removeDimension(i) : undefined}
            />
          ))}
        </div>
      </div>

      {/* Column groups */}
      <div className="builder-section">
        <div className="builder-section__head">
          <h3 className="card__title" style={{ fontSize: 15 }}>
            Column groups
          </h3>
          {!readOnly && (
            <Button variant="secondary" size="sm" onClick={addGroup}>
              <Plus size={14} /> Add group
            </Button>
          )}
        </div>
        <div className="stack">
          {schema.columnGroups.map((g, i) => (
            <KeyLabelRow
              key={i}
              item={g}
              readOnly={readOnly}
              onChange={(next) => updateGroup(i, { ...g, ...next })}
              onRemove={schema.columnGroups.length > 1 ? () => removeGroup(i) : undefined}
            />
          ))}
        </div>
      </div>

      {/* Metrics */}
      <div className="builder-section">
        <div className="builder-section__head">
          <h3 className="card__title" style={{ fontSize: 15 }}>
            Metrics <span className="muted text-sm">(repeated in every column group)</span>
          </h3>
          {!readOnly && (
            <Button variant="secondary" size="sm" onClick={addMetric}>
              <Plus size={14} /> Add metric
            </Button>
          )}
        </div>
        <div className="stack">
          {schema.metrics.map((m, i) => (
            <KeyLabelRow
              key={i}
              item={m}
              readOnly={readOnly}
              onChange={(next) => updateMetric(i, { ...m, ...next })}
              onRemove={schema.metrics.length > 1 ? () => removeMetric(i) : undefined}
            />
          ))}
        </div>
      </div>

      {/* Min rows */}
      <div className="builder-section">
        <Field label="Minimum rows required to submit">
          <input
            className="input input--inline"
            type="number"
            min={0}
            disabled={readOnly}
            value={schema.minRows ?? 0}
            onChange={(e) => patch({ minRows: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>
      </div>
    </div>
  );
}

function DimensionRow({
  dim,
  readOnly,
  onChange,
  onRemove,
}: {
  dim: TableDimensionColumn;
  readOnly: boolean;
  onChange: (next: TableDimensionColumn) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="builder-section" style={{ margin: 0, background: 'var(--surface-muted)' }}>
      <div className="row-inline">
        <Field label="Column label">
          <input
            className="input"
            disabled={readOnly}
            value={dim.label}
            onChange={(e) => {
              const label = e.target.value;
              onChange({ ...dim, label, key: dim.key || slugifyKey(label) });
            }}
          />
        </Field>
        <Field label="Key">
          <input
            className="input mono"
            disabled={readOnly}
            value={dim.key}
            onChange={(e) => onChange({ ...dim, key: e.target.value })}
          />
        </Field>
        <Field label="Type">
          <select
            className="select"
            disabled={readOnly}
            value={dim.type}
            onChange={(e) => onChange({ ...dim, type: e.target.value as SimpleFieldType })}
          >
            {DIM_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Required">
          <input
            type="checkbox"
            disabled={readOnly}
            checked={dim.required ?? false}
            onChange={(e) => onChange({ ...dim, required: e.target.checked })}
          />
        </Field>
        {!readOnly && onRemove && (
          <Button variant="danger" size="sm" onClick={onRemove}>
            <Trash2 size={14} />
          </Button>
        )}
      </div>
      {dim.type === 'select' && (
        <div style={{ marginTop: 8 }}>
          <Field label="Options (one per line, value = label)">
            <textarea
              className="input"
              rows={3}
              disabled={readOnly}
              value={(dim.options ?? []).map((o) => o.label).join('\n')}
              onChange={(e) => onChange({ ...dim, options: parseOptions(e.target.value) })}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function parseOptions(text: string): SelectOption[] {
  const seen = new Set<string>();
  const out: SelectOption[] = [];
  for (const line of text.split('\n')) {
    const label = line.trim();
    if (!label) continue;
    const value = slugifyKey(label) || label;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ value, label });
  }
  return out;
}

function KeyLabelRow({
  item,
  readOnly,
  onChange,
  onRemove,
}: {
  item: { key: string; label: string };
  readOnly: boolean;
  onChange: (next: { key: string; label: string }) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="row-inline">
      <Field label="Label">
        <input
          className="input"
          disabled={readOnly}
          value={item.label}
          onChange={(e) => {
            const label = e.target.value;
            onChange({ label, key: item.key || slugifyKey(label) });
          }}
        />
      </Field>
      <Field label="Key">
        <input
          className="input mono"
          disabled={readOnly}
          value={item.key}
          onChange={(e) => onChange({ ...item, key: e.target.value })}
        />
      </Field>
      {!readOnly && onRemove && (
        <Button variant="danger" size="sm" onClick={onRemove}>
          <Trash2 size={14} />
        </Button>
      )}
    </div>
  );
}
