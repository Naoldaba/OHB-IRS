'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, UploadCloud, Grid3x3, ListTree } from 'lucide-react';
import {
  ReportDefinitionStatus,
  buildRenderModel,
  validateFieldSchema,
  type FieldSchema,
  type MatrixFieldSchema,
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

  async function save(): Promise<boolean> {
    if (!schema) return false;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/report-types/${id}/definition-versions/${versionId}/schema`, {
        fieldSchema: schema,
      });
      setDirty(false);
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
          onChoose={(layout) =>
            update(layout === 'matrix' ? emptyMatrixSchema() : emptySimpleSchema())
          }
          onHivTemplate={() => update(hivViralLoadTemplate())}
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
            <div className="toolbar" style={{ marginBottom: 12 }}>
              <span className="micro-label">
                Layout: {schema.layout === 'matrix' ? 'Matrix grid' : 'Simple sections'}
              </span>
              {dirty && <span className="pill pill--amber">unsaved changes</span>}
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
  onChoose,
  onHivTemplate,
}: {
  disabled: boolean;
  onChoose: (layout: 'simple' | 'matrix') => void;
  onHivTemplate: () => void;
}) {
  const [layout, setLayout] = useState<'simple' | 'matrix'>('matrix');
  return (
    <Card title="Choose a layout" desc="Pick the structure that matches the source report.">
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
        <Button onClick={() => onChoose(layout)} disabled={disabled}>
          Start with {layout === 'matrix' ? 'a matrix' : 'simple sections'}
        </Button>
        <Button variant="secondary" onClick={onHivTemplate} disabled={disabled}>
          Prefill HIV Viral Load template
        </Button>
      </div>
    </Card>
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
