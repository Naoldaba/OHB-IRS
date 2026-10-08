'use client';

/**
 * Structure editor for the `simple` layout: sections of typed fields. Keys are
 * lower_snake_case (shared KEY_PATTERN) and form the stable field path
 * "<sectionKey>.<fieldKey>".
 */

import { Plus, Trash2 } from 'lucide-react';
import type {
  SelectOption,
  SimpleFieldDef,
  SimpleFieldSchema,
  SimpleFieldType,
  SimpleSectionDef,
} from '@ohb/shared';
import { Button, Field } from '@/components/ui';
import { slugifyKey } from '@/lib/slug';
import { removeAt, replaceAt } from './schema-helpers';

const FIELD_TYPES: { value: SimpleFieldType; label: string }[] = [
  { value: 'integer', label: 'Whole number' },
  { value: 'number', label: 'Number (decimal)' },
  { value: 'text', label: 'Text' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
];

export function SimpleBuilder({
  schema,
  readOnly,
  onChange,
}: {
  schema: SimpleFieldSchema;
  readOnly: boolean;
  onChange: (schema: SimpleFieldSchema) => void;
}) {
  function setSections(sections: SimpleSectionDef[]) {
    onChange({ ...schema, sections });
  }
  function updateSection(i: number, next: SimpleSectionDef) {
    setSections(replaceAt(schema.sections, i, next));
  }
  function addSection() {
    const n = schema.sections.length + 1;
    setSections([...schema.sections, { key: `section_${n}`, label: `Section ${n}`, fields: [] }]);
  }
  function addField(si: number) {
    const section = schema.sections[si];
    const n = section.fields.length + 1;
    updateSection(si, {
      ...section,
      fields: [
        ...section.fields,
        { key: `field_${n}`, label: `Field ${n}`, type: 'integer', required: false },
      ],
    });
  }
  function updateField(si: number, fi: number, next: SimpleFieldDef) {
    const section = schema.sections[si];
    updateSection(si, { ...section, fields: replaceAt(section.fields, fi, next) });
  }
  function removeField(si: number, fi: number) {
    const section = schema.sections[si];
    updateSection(si, { ...section, fields: removeAt(section.fields, fi) });
  }

  return (
    <div>
      {schema.sections.map((section, si) => (
        <div className="builder-section" key={si}>
          <div className="row-inline" style={{ marginBottom: 12 }}>
            <Field label="Section label">
              <input
                className="input"
                disabled={readOnly}
                value={section.label}
                onChange={(e) => {
                  const label = e.target.value;
                  updateSection(si, { ...section, label, key: section.key || slugifyKey(label) });
                }}
              />
            </Field>
            <Field label="Key">
              <input
                className="input mono"
                disabled={readOnly}
                value={section.key}
                onChange={(e) => updateSection(si, { ...section, key: e.target.value })}
              />
            </Field>
            {!readOnly && schema.sections.length > 1 && (
              <Button variant="danger" size="sm" onClick={() => setSections(removeAt(schema.sections, si))}>
                <Trash2 size={14} />
              </Button>
            )}
          </div>

          <div className="stack" style={{ gap: 14 }}>
            {section.fields.length === 0 && (
              <div className="table__empty">No fields in this section yet.</div>
            )}
            {section.fields.map((field, fi) => (
              <FieldEditor
                key={fi}
                field={field}
                readOnly={readOnly}
                onChange={(next) => updateField(si, fi, next)}
                onRemove={() => removeField(si, fi)}
              />
            ))}
          </div>

          {!readOnly && (
            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" size="sm" onClick={() => addField(si)}>
                <Plus size={14} /> Add field
              </Button>
            </div>
          )}
        </div>
      ))}

      {!readOnly && (
        <Button variant="secondary" size="sm" onClick={addSection}>
          <Plus size={14} /> Add section
        </Button>
      )}
    </div>
  );
}

function FieldEditor({
  field,
  readOnly,
  onChange,
  onRemove,
}: {
  field: SimpleFieldDef;
  readOnly: boolean;
  onChange: (next: SimpleFieldDef) => void;
  onRemove: () => void;
}) {
  const isNumeric = field.type === 'number' || field.type === 'integer';
  return (
    <div className="builder-section" style={{ margin: 0, background: 'var(--surface-muted)' }}>
      <div className="row-inline">
        <Field label="Field label">
          <input
            className="input"
            disabled={readOnly}
            value={field.label}
            onChange={(e) => {
              const label = e.target.value;
              onChange({ ...field, label, key: field.key || slugifyKey(label) });
            }}
          />
        </Field>
        <Field label="Key">
          <input
            className="input mono"
            disabled={readOnly}
            value={field.key}
            onChange={(e) => onChange({ ...field, key: e.target.value })}
          />
        </Field>
        <Field label="Type">
          <select
            className="select"
            disabled={readOnly}
            value={field.type}
            onChange={(e) => onChange({ ...field, type: e.target.value as SimpleFieldType })}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Required">
          <label className="checkbox-row" style={{ padding: '9px 0' }}>
            <input
              type="checkbox"
              disabled={readOnly}
              checked={field.required ?? false}
              onChange={(e) => onChange({ ...field, required: e.target.checked })}
            />
            <span className="text-sm muted">at submit</span>
          </label>
        </Field>
        {!readOnly && (
          <Button variant="danger" size="sm" onClick={onRemove}>
            <Trash2 size={14} />
          </Button>
        )}
      </div>

      {isNumeric && (
        <div className="row-inline" style={{ marginTop: 10 }}>
          <Field label="Min">
            <input
              className="input input--inline"
              type="number"
              disabled={readOnly}
              value={field.min ?? ''}
              onChange={(e) =>
                onChange({ ...field, min: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Max">
            <input
              className="input input--inline"
              type="number"
              disabled={readOnly}
              value={field.max ?? ''}
              onChange={(e) =>
                onChange({ ...field, max: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </Field>
        </div>
      )}

      {field.type === 'select' && (
        <OptionsEditor
          options={field.options ?? []}
          readOnly={readOnly}
          onChange={(options) => onChange({ ...field, options })}
        />
      )}
    </div>
  );
}

function OptionsEditor({
  options,
  readOnly,
  onChange,
}: {
  options: SelectOption[];
  readOnly: boolean;
  onChange: (options: SelectOption[]) => void;
}) {
  function add() {
    const n = options.length + 1;
    onChange([...options, { value: `option_${n}`, label: `Option ${n}` }]);
  }
  return (
    <div style={{ marginTop: 10 }}>
      <div className="micro-label" style={{ marginBottom: 6 }}>
        Dropdown options
      </div>
      <div className="stack">
        {options.map((opt, i) => (
          <div className="row-inline" key={i}>
            <Field label="Label">
              <input
                className="input"
                disabled={readOnly}
                value={opt.label}
                onChange={(e) => {
                  const label = e.target.value;
                  onChange(replaceAt(options, i, { label, value: opt.value || slugifyKey(label) }));
                }}
              />
            </Field>
            <Field label="Value">
              <input
                className="input mono"
                disabled={readOnly}
                value={opt.value}
                onChange={(e) => onChange(replaceAt(options, i, { ...opt, value: e.target.value }))}
              />
            </Field>
            {!readOnly && (
              <Button variant="danger" size="sm" onClick={() => onChange(removeAt(options, i))}>
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        ))}
      </div>
      {!readOnly && (
        <div style={{ marginTop: 8 }}>
          <Button variant="ghost" size="sm" onClick={add}>
            <Plus size={14} /> Add option
          </Button>
        </div>
      )}
    </div>
  );
}
