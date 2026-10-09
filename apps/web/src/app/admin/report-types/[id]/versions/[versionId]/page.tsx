'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, UploadCloud, Grid3x3, ListTree, FileSpreadsheet } from 'lucide-react';
import {
  ReportDefinitionStatus,
  buildRenderModel,
  validateFieldSchema,
  type FieldSchema,
  type ImportSummary,
  type MatrixFieldSchema,
  type ReportImportResult,
  type SimpleFieldSchema,
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
import { RuleBuilder } from '@/components/builder/RuleBuilder';
import {
  emptyMatrixSchema,
  emptySimpleSchema,
  hivViralLoadTemplate,
} from '@/components/builder/schema-helpers';

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
  const reimportInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const v = await api.get<DefinitionVersion>(
      `/report-types/${id}/definition-versions/${versionId}`,
    );
    setVersion(v);
    const fs = v.fieldSchema as Partial<FieldSchema>;
    setSchema(fs && (fs.layout === 'simple' || fs.layout === 'matrix') ? (fs as FieldSchema) : null);
  }, [id, versionId]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [load]);

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
  async function onImport(file: File) {
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
      const result = await api.upload<ReportImportResult>('/report-import/parse', form);
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
          onChoose={(layout) =>
            update(layout === 'matrix' ? emptyMatrixSchema() : emptySimpleSchema())
          }
          onHivTemplate={() => update(hivViralLoadTemplate())}
          onImport={onImport}
        />
      ) : tab === 'rules' ? (
        dirty ? (
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
        <div className="split" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div>
            {importSummary && (
              <div style={{ marginBottom: 12 }}>
                <ImportSummaryCallout summary={importSummary} />
              </div>
            )}
            <div className="toolbar" style={{ marginBottom: 12 }}>
              <span className="micro-label">
                Layout: {schema.layout === 'matrix' ? 'Matrix grid' : 'Simple sections'}
              </span>
              {dirty && <span className="pill pill--amber">unsaved changes</span>}
              {!readOnly && (
                <>
                  <input
                    ref={reimportInput}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onImport(file);
                      e.target.value = '';
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => reimportInput.current?.click()}
                    disabled={busy}
                    title="Replace this draft's structure from an Excel file"
                  >
                    <FileSpreadsheet size={15} /> {busy ? 'Importing…' : 'Import from Excel'}
                  </Button>
                </>
              )}
            </div>

            {schema.layout === 'matrix' ? (
              <MatrixBuilder
                schema={schema as MatrixFieldSchema}
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
  onHivTemplate,
  onImport,
}: {
  disabled: boolean;
  busy: boolean;
  onChoose: (layout: 'simple' | 'matrix') => void;
  onHivTemplate: () => void;
  onImport: (file: File) => void;
}) {
  const [layout, setLayout] = useState<'simple' | 'matrix'>('matrix');
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <Card title="Choose a layout" desc="Pick the structure that matches the source report, or import it from an Excel file.">
      <SegmentedToggle
        options={[
          { value: 'matrix', label: 'Matrix grid' },
          { value: 'simple', label: 'Simple sections' },
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
              Rows (tests/indicators) × column groups × metrics, with a per-row
              applicable mask (greyed cells). Used by HIV Viral Load.
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
      </div>
      <div className="toolbar" style={{ marginTop: 18 }}>
        <Button onClick={() => onChoose(layout)} disabled={disabled || busy}>
          Start with {layout === 'matrix' ? 'a matrix' : 'simple sections'}
        </Button>
        <Button variant="secondary" onClick={onHivTemplate} disabled={disabled || busy}>
          Prefill HIV Viral Load template
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
            if (file) onImport(file);
            e.target.value = '';
          }}
        />
        <Button
          variant="secondary"
          onClick={() => fileInput.current?.click()}
          disabled={disabled || busy}
        >
          <FileSpreadsheet size={16} /> {busy ? 'Importing…' : 'Import from Excel'}
        </Button>
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
      </p>
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
