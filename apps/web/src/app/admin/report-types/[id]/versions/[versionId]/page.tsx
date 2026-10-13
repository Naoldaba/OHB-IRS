'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, UploadCloud, Grid3x3, ListTree, FileSpreadsheet, Paperclip } from 'lucide-react';
import {
  ReportDefinitionStatus,
  buildRenderModel,
  validateFieldSchema,
  type DocumentFieldSchema,
  type FieldSchema,
  type ImportSummary,
  type MatrixFieldSchema,
  type ReportImportResult,
  type SimpleFieldSchema,
  type TableFieldSchema,
} from '@ohb/shared';
import { api, ApiError } from '@/lib/api';
import type { DefinitionVersion } from '@/lib/types';
import {
  Button,
  Callout,
  Card,
  DefinitionStatusPill,
  Field,
  SegmentedToggle,
  Spinner,
} from '@/components/ui';
import { ReportRenderer } from '@/components/report/ReportRenderer';
import { MatrixBuilder } from '@/components/builder/MatrixBuilder';
import { SimpleBuilder } from '@/components/builder/SimpleBuilder';
import { TableBuilder } from '@/components/builder/TableBuilder';
import { DocumentBuilder } from '@/components/builder/DocumentBuilder';
import { RuleBuilder } from '@/components/builder/RuleBuilder';
import {
  emptyDocumentSchema,
  emptyMatrixSchema,
  emptySimpleSchema,
  emptyTableSchema,
} from '@/components/builder/schema-helpers';

type BuilderLayout = 'simple' | 'matrix' | 'table' | 'document';

function emptySchemaFor(layout: BuilderLayout): FieldSchema {
  if (layout === 'matrix') return emptyMatrixSchema();
  if (layout === 'table') return emptyTableSchema();
  if (layout === 'document') return emptyDocumentSchema();
  return emptySimpleSchema();
}

export default function BuilderPage() {
  const { id, versionId } = useParams<{ id: string; versionId: string }>();
  const router = useRouter();

  const [version, setVersion] = useState<DefinitionVersion | null>(null);
  const [schema, setSchema] = useState<FieldSchema | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'structure' | 'rules'>('structure');
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const reimportInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const v = await api.get<DefinitionVersion>(
      `/report-types/${id}/definition-versions/${versionId}`,
    );
    setVersion(v);
    const fs = v.fieldSchema as Partial<FieldSchema>;
    const layout = fs?.layout;
    const known =
      layout === 'simple' || layout === 'matrix' || layout === 'table' || layout === 'document';
    setSchema(known ? (fs as FieldSchema) : null);
  }, [id, versionId]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [load]);

  // Only offer the "Assist with AI" toggle when a provider is configured server-side.
  useEffect(() => {
    api
      .get<{ aiAvailable: boolean }>('/report-import/capabilities')
      .then((c) => setAiAvailable(Boolean(c.aiAvailable)))
      .catch(() => setAiAvailable(false));
  }, []);

  const readOnly = version?.status !== ReportDefinitionStatus.DRAFT;

  const localValidation = useMemo(
    () => (schema ? validateFieldSchema(schema) : null),
    [schema],
  );

  function update(next: FieldSchema) {
    setSchema(next);
    setDirty(true);
    setNotice(null);
  }

  /**
   * Import an uploaded Excel file into a candidate schema. The parser is
   * best-effort: it drops the result into the normal builder (as an unsaved
   * draft) with a summary of what to review — it never publishes on its own.
   */
  async function onImport(file: File, assist: boolean, layout?: BuilderLayout) {
    // Importing over an existing structure is destructive — confirm first. (A
    // fresh draft has no schema yet, so this only prompts on a started draft.)
    if (schemaHasContent(schema)) {
      const ok = window.confirm(
        'Importing will replace the current structure of this draft. Continue?',
      );
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const params = new URLSearchParams();
      if (assist) params.set('assist', 'ai');
      if (layout) params.set('layout', layout);
      const qs = params.toString();
      const path = `/report-import/parse${qs ? `?${qs}` : ''}`;
      const result = await api.upload<ReportImportResult>(path, form);
      setSchema(result.schema);
      setImportSummary(result.summary);
      setDirty(true);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<boolean> {
    if (!schema) return false;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/report-types/${id}/definition-versions/${versionId}/schema`, {
        fieldSchema: schema,
      });
      setDirty(false);
      setImportSummary(null);
      setNotice('Structure saved.');
      return true;
    } catch (err) {
      setError(formatError(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (dirty) {
      const ok = await save();
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/report-types/${id}/definition-versions/${versionId}/publish`);
      router.push(`/admin/report-types/${id}`);
    } catch (err) {
      setError(formatError(err));
      setBusy(false);
    }
  }

  if (error && !version)
    return <Callout tone="danger" title="Could not load">{error}</Callout>;
  if (!version)
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );

  return (
    <>
      <div className="page-head">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/admin/report-types/${id}`)}>
          <ArrowLeft size={15} /> Back to report
        </Button>
        <div className="page-head__row" style={{ marginTop: 8 }}>
          <div>
            <div className="micro-label">
              Report Builder · {tab === 'rules' ? 'Rules' : 'Structure'}
            </div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              Version {version.version} <DefinitionStatusPill status={version.status} />
            </h1>
            <p>
              {tab === 'rules'
                ? 'Attach validation, cross-field, conditional and calculation rules. They are frozen when the version is published.'
                : 'Author the field structure. It is saved as a draft and validated, then published so laboratories can fill it.'}
            </p>
          </div>
          {!readOnly && (
            <div className="toolbar">
              {tab === 'structure' && (
                <Button variant="secondary" onClick={save} disabled={busy || !dirty || !schema}>
                  <Save size={16} /> Save
                </Button>
              )}
              <Button
                onClick={publish}
                disabled={busy || !schema || !(localValidation?.ok ?? false)}
                title={!localValidation?.ok ? 'Fix the structure issues first' : undefined}
              >
                <UploadCloud size={16} /> Publish
              </Button>
            </div>
          )}
        </div>
      </div>

      {schema && (
        <div style={{ marginBottom: 16 }}>
          <SegmentedToggle
            options={[
              { value: 'structure', label: 'Structure' },
              { value: 'rules', label: 'Rules' },
            ]}
            value={tab}
            onChange={(v) => setTab(v)}
          />
        </div>
      )}

      {readOnly && (
        <div style={{ marginBottom: 16 }}>
          <Callout title="Read-only">
            This version is {version.status.toLowerCase()} and can no longer be edited.
            Create a new draft from the report page to make changes.
          </Callout>
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="danger" title="Could not save">
            {error}
          </Callout>
        </div>
      )}
      {notice && (
        <div style={{ marginBottom: 16 }}>
          <Callout title="Saved">{notice}</Callout>
        </div>
      )}

      {!schema ? (
        <LayoutChooser
          disabled={readOnly}
          busy={busy}
          onChoose={(layout) => update(emptySchemaFor(layout))}
          onImport={onImport}
          aiAvailable={aiAvailable}
          useAi={useAi}
          onToggleAi={setUseAi}
        />
      ) : tab === 'rules' ? (
        schema.layout === 'table' ? (
          <Callout title="Business rules aren’t available for data tables yet">
            Data-table reports have open-ended rows, so field-level business rules are a
            later enhancement. Structure validation (dimension types, required columns and
            metric cells) is still enforced on submit.
          </Callout>
        ) : dirty ? (
          <Callout title="Save your structure first">
            You have unsaved structure changes. Save them before authoring rules so
            the field catalog stays in sync.
          </Callout>
        ) : (
          <RuleBuilder
            reportTypeId={id}
            versionId={versionId}
            schema={schema}
            readOnly={readOnly}
          />
        )
      ) : (
        <div className="split" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
          <div>
            {importSummary && (
              <div style={{ marginBottom: 12 }}>
                <ImportSummaryCallout summary={importSummary} />
              </div>
            )}
            <div className="toolbar" style={{ marginBottom: 12 }}>
              <span className="micro-label">
                Layout:{' '}
                {schema.layout === 'matrix'
                  ? 'Matrix grid'
                  : schema.layout === 'table'
                    ? 'Data table'
                    : schema.layout === 'document'
                      ? 'Attachment only'
                      : 'Simple sections'}
              </span>
              {dirty && <span className="pill pill--amber">unsaved changes</span>}
              {!readOnly && schema.layout !== 'document' && (
                <>
                  <input
                    ref={reimportInput}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onImport(file, useAi, schema.layout);
                      e.target.value = '';
                    }}
                  />
                  <div className="toolbar" style={{ marginLeft: 'auto', gap: 10 }}>
                    {aiAvailable && (
                      <label
                        className="micro-label"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                        title="Let the configured AI refine field types, options and the mask (structure only — no report data is sent)"
                      >
                        <input
                          type="checkbox"
                          checked={useAi}
                          onChange={(e) => setUseAi(e.target.checked)}
                          disabled={busy}
                        />
                        Assist with AI
                      </label>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => reimportInput.current?.click()}
                      disabled={busy}
                      title="Replace this draft's structure from an Excel file"
                    >
                      <FileSpreadsheet size={15} /> {busy ? 'Importing…' : 'Import from Excel'}
                    </Button>
                  </div>
                </>
              )}
            </div>

            {schema.layout === 'matrix' ? (
              <MatrixBuilder
                schema={schema as MatrixFieldSchema}
                readOnly={readOnly}
                onChange={(s) => update(s)}
              />
            ) : schema.layout === 'table' ? (
              <TableBuilder
                schema={schema as TableFieldSchema}
                readOnly={readOnly}
                onChange={(s) => update(s)}
              />
            ) : schema.layout === 'document' ? (
              <DocumentBuilder
                schema={schema as DocumentFieldSchema}
                readOnly={readOnly}
                onChange={(s) => update(s)}
              />
            ) : (
              <SimpleBuilder
                schema={schema as SimpleFieldSchema}
                readOnly={readOnly}
                onChange={(s) => update(s)}
              />
            )}

            {localValidation && !localValidation.ok && (
              <div style={{ marginTop: 12 }}>
                <Callout tone="danger" title="Structure issues to fix before publishing">
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {localValidation.errors.map((e, i) => (
                      <li key={i}>
                        <span className="mono">{e.path || '(root)'}</span> — {e.message}
                      </li>
                    ))}
                  </ul>
                </Callout>
              </div>
            )}
          </div>

          <PreviewPanel schema={schema} valid={localValidation?.ok ?? false} />
        </div>
      )}
    </>
  );
}

function LayoutChooser({
  disabled,
  busy,
  onChoose,
  onImport,
  aiAvailable,
  useAi,
  onToggleAi,
}: {
  disabled: boolean;
  busy: boolean;
  onChoose: (layout: BuilderLayout) => void;
  onImport: (file: File, assist: boolean, layout?: BuilderLayout) => void;
  aiAvailable: boolean;
  useAi: boolean;
  onToggleAi: (v: boolean) => void;
}) {
  const [layout, setLayout] = useState<BuilderLayout>('matrix');
  const [importLayout, setImportLayout] = useState<'auto' | BuilderLayout>('auto');
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <Card title="Choose a layout" desc="Pick the structure that matches the source report, or import it from an Excel file.">
      <SegmentedToggle
        options={[
          { value: 'matrix', label: 'Matrix grid' },
          { value: 'table', label: 'Data table' },
          { value: 'simple', label: 'Simple sections' },
          { value: 'document', label: 'Attachment only' },
        ]}
        value={layout}
        onChange={setLayout}
        disabled={disabled}
      />
      <div className="grid grid--2" style={{ marginTop: 16 }}>
        <div className="callout">
          <Grid3x3 className="callout__icon" size={18} />
          <div>
            <div className="callout__title">Matrix grid</div>
            <div className="callout__body">
              A <strong>fixed</strong> set of rows (tests/indicators) × column groups ×
              metrics, with a per-row applicable mask (greyed cells). Used by HIV Viral Load.
            </div>
          </div>
        </div>
        <div className="callout">
          <Grid3x3 className="callout__icon" size={18} />
          <div>
            <div className="callout__title">Data table</div>
            <div className="callout__body">
              <strong>Open-ended rows</strong> the lab adds one at a time (e.g. one per
              facility): per-row input columns (Zone, Woreda, …) plus grouped metric columns.
            </div>
          </div>
        </div>
        <div className="callout">
          <ListTree className="callout__icon" size={18} />
          <div>
            <div className="callout__title">Simple sections</div>
            <div className="callout__body">
              Sections of typed fields: number, integer, text, date, and select
              dropdowns.
            </div>
          </div>
        </div>
        <div className="callout">
          <Paperclip className="callout__icon" size={18} />
          <div>
            <div className="callout__title">Attachment only</div>
            <div className="callout__body">
              <strong>No form</strong> — the lab just uploads file(s) (e.g. a signed PDF or an
              Excel workbook). You set the instructions, how many files are required, and the
              accepted types.
            </div>
          </div>
        </div>
      </div>
      <div className="toolbar" style={{ marginTop: 18 }}>
        <Button onClick={() => onChoose(layout)} disabled={disabled || busy}>
          Start with{' '}
          {layout === 'matrix'
            ? 'a matrix'
            : layout === 'table'
              ? 'a data table'
              : layout === 'document'
                ? 'an attachment-only report'
                : 'simple sections'}
        </Button>
      </div>

      <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <div className="micro-label">Or import from a file</div>
        <p style={{ margin: '4px 0 10px', color: 'var(--text-muted)', fontSize: 13 }}>
          Upload an Excel (.xlsx) report and we&apos;ll map what we can into an editable
          draft. You review and fix it here before publishing — nothing is published
          automatically.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImport(file, useAi, importLayout === 'auto' ? undefined : importLayout);
            e.target.value = '';
          }}
        />
        <div className="toolbar" style={{ gap: 12, flexWrap: 'wrap' }}>
          <label className="micro-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Import as
            <select
              className="select"
              style={{ width: 'auto' }}
              value={importLayout}
              onChange={(e) => setImportLayout(e.target.value as 'auto' | BuilderLayout)}
              disabled={disabled || busy}
            >
              <option value="auto">Detect automatically</option>
              <option value="matrix">Matrix grid</option>
              <option value="table">Data table</option>
              <option value="simple">Simple sections</option>
            </select>
          </label>
          <Button
            variant="secondary"
            onClick={() => fileInput.current?.click()}
            disabled={disabled || busy}
          >
            <FileSpreadsheet size={16} /> {busy ? 'Importing…' : 'Import from Excel'}
          </Button>
          {aiAvailable && (
            <label
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}
              title="Let the configured AI refine field types, dropdown options and the applicable mask. Only the report's structure and labels are sent — never any report data."
            >
              <input
                type="checkbox"
                checked={useAi}
                onChange={(e) => onToggleAi(e.target.checked)}
                disabled={disabled || busy}
              />
              Assist with AI
            </label>
          )}
        </div>
        {aiAvailable && useAi && (
          <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
            AI refines structure and labels only — no report data is sent. Every suggestion is
            shown for you to review, and nothing is published automatically.
          </p>
        )}
      </div>
    </Card>
  );
}

/** Human-readable summary of a best-effort Excel import, shown above the builder. */
function ImportSummaryCallout({ summary }: { summary: ImportSummary }) {
  const toneByConfidence = { high: 'success', medium: 'default', low: 'danger' } as const;
  const mapped = summary.mapped
    .filter((m) => m.count > 0)
    .map((m) => `${m.count} ${m.label.toLowerCase()}`)
    .join(', ');
  return (
    <Callout
      tone={toneByConfidence[summary.confidence]}
      title={`Imported from "${summary.sheetName}" as ${summary.detectedLayout === 'matrix' ? 'a matrix grid' : 'simple sections'} (${summary.confidence} confidence)`}
    >
      <p style={{ margin: '2px 0' }}>
        Mapped {mapped || 'nothing'}. Review the structure below and correct anything the
        importer got wrong before publishing.
        {summary.aiAssisted ? ' AI assist refined the structure — verify its suggestions below.' : ''}
      </p>
      {summary.aiSuggestions && summary.aiSuggestions.length > 0 && (
        <>
          <div className="micro-label" style={{ marginTop: 8 }}>AI suggestions — please verify</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {summary.aiSuggestions.map((s, i) => (
              <li key={i}>
                {s.message}
                {s.location ? ` (${s.location})` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
      {summary.aiNotes && summary.aiNotes.length > 0 && (
        <>
          <div className="micro-label" style={{ marginTop: 8 }}>AI notes</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {summary.aiNotes.map((n, i) => (
              <li key={i}>
                {n.message}
                {n.location ? ` (${n.location})` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
      {summary.warnings.length > 0 && (
        <>
          <div className="micro-label" style={{ marginTop: 8 }}>Please review</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {summary.warnings.map((w, i) => (
              <li key={i}>
                {w.message}
                {w.location ? ` (${w.location})` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
      {summary.skipped.length > 0 && (
        <>
          <div className="micro-label" style={{ marginTop: 8 }}>Skipped</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {summary.skipped.map((s, i) => (
              <li key={i}>
                {s.message}
                {s.location ? ` (${s.location})` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </Callout>
  );
}

function PreviewPanel({ schema, valid }: { schema: FieldSchema; valid: boolean }) {
  let model: ReturnType<typeof buildRenderModel> | null = null;
  try {
    model = buildRenderModel(schema);
  } catch {
    model = null;
  }
  return (
    <Card title="Live preview" desc="Exactly what a laboratory will see when filling this report.">
      {!valid && (
        <div style={{ marginBottom: 12 }}>
          <Callout>
            Preview reflects the current draft; resolve the listed issues before publishing.
          </Callout>
        </div>
      )}
      {model ? (
        <ReportRenderer model={model} data={{}} mode="read" />
      ) : (
        <div className="table__empty">Add structure to see a preview.</div>
      )}
    </Card>
  );
}

/** True when a schema already holds structure worth warning before we overwrite it. */
function schemaHasContent(schema: FieldSchema | null): boolean {
  if (!schema) return false;
  if (schema.layout === 'matrix') {
    return schema.rows.length > 0 || schema.metrics.length > 0 || schema.columnGroups.length > 0;
  }
  if (schema.layout === 'table') {
    return (
      schema.dimensions.length > 0 || schema.metrics.length > 0 || schema.columnGroups.length > 0
    );
  }
  if (schema.layout === 'document') {
    return Boolean(schema.instructions) || (schema.allowedFileTypes?.length ?? 0) > 0;
  }
  return schema.sections.some((s) => s.fields.length > 0);
}

function formatError(err: unknown): string {
  if (err instanceof ApiError) {
    const fieldErrs = err.fieldErrors;
    if (fieldErrs.length) {
      return `${err.message}: ${fieldErrs.map((e) => `${e.path} ${e.message}`).join('; ')}`;
    }
    return err.message;
  }
  return 'Something went wrong';
}
