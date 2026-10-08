'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Check, X } from 'lucide-react';
import { PeriodType } from '@ohb/shared';
import { api, ApiError } from '@/lib/api';
import type { ReportCategory, ReportType } from '@/lib/types';
import { slugifyKey } from '@/lib/slug';
import { Button, Callout, Card, Field, Pill, Spinner } from '@/components/ui';

export default function ReportTypesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<ReportCategory[] | null>(null);
  const [types, setTypes] = useState<ReportType[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const [cats, rts] = await Promise.all([
      api.get<ReportCategory[]>('/report-categories'),
      api.get<ReportType[]>('/report-types'),
    ]);
    setCategories(cats);
    setTypes(rts);
  }

  useEffect(() => {
    reload().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  if (error) return <Callout tone="danger" title="Could not load">{error}</Callout>;
  if (!categories || !types)
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );

  return (
    <>
      <div className="page-head">
        <div className="page-head__row">
          <div>
            <div className="micro-label">Report Builder</div>
            <h1>Reports</h1>
            <p>Create a report type, then author and publish its structure.</p>
          </div>
        </div>
      </div>

      <div className="split">
        <div>
          <CategoriesCard categories={categories} onChanged={reload} />
          <NewReportTypeCard categories={categories} onCreated={reload} />
        </div>

        <Card title="Report types" desc="Open a report to author versions and publish.">
          {types.length === 0 ? (
            <div className="table__empty">No report types yet. Create one on the left.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Category</th>
                  <th>Frequency</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr
                    key={t.id}
                    className="clickable"
                    onClick={() => router.push(`/admin/report-types/${t.id}`)}
                  >
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td className="mono">{t.code}</td>
                    <td>{t.category?.name ?? '—'}</td>
                    <td>
                      <Pill tone="slate">{t.defaultFrequency.toLowerCase()}</Pill>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {!t.isActive && <Pill tone="amber">inactive</Pill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}

function CategoriesCard({
  categories,
  onChanged,
}: {
  categories: ReportCategory[];
  onChanged: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Card title="Categories" desc="Group report types. Rename or edit the description inline.">
      {categories.length > 0 && (
        <table className="table" style={{ marginBottom: 16 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Reports</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {categories.map((c) =>
              editingId === c.id ? (
                <EditCategoryRow
                  key={c.id}
                  category={c}
                  onDone={async () => {
                    setEditingId(null);
                    await onChanged();
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    {c.description && <div className="text-sm muted">{c.description}</div>}
                  </td>
                  <td>
                    <Pill tone="slate">{c._count?.reportTypes ?? 0}</Pill>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(c.id)}>
                      <Pencil size={14} /> Edit
                    </Button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
      <NewCategoryForm onCreated={onChanged} />
    </Card>
  );
}

function EditCategoryRow({
  category,
  onDone,
  onCancel,
}: {
  category: ReportCategory;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await api.patch(`/report-categories/${category.id}`, {
        name: name.trim(),
        description: description.trim(),
      });
      await onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save category');
      setBusy(false);
    }
  }

  return (
    <tr>
      <td colSpan={2}>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={2}
          maxLength={120}
          required
          style={{ marginBottom: 6 }}
        />
        <input
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          placeholder="Description (optional)"
        />
        {error && <div className="field__error">{error}</div>}
      </td>
      <td style={{ textAlign: 'right', verticalAlign: 'top' }}>
        <div style={{ display: 'inline-flex', gap: 4 }}>
          <Button variant="ghost" size="sm" onClick={save} disabled={busy || name.trim().length < 2}>
            <Check size={14} /> Save
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            <X size={14} />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function NewCategoryForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/report-categories', { name: name.trim() });
      setName('');
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create category');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && (
        <div style={{ marginBottom: 12 }}>
          <Callout tone="danger">{error}</Callout>
        </div>
      )}
      <Field label="New category" hint="e.g. Routine Lab Report">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Routine Lab Report"
          required
        />
      </Field>
      <Button type="submit" variant="secondary" size="sm" disabled={busy || !name.trim()}>
        <Plus size={15} /> Add category
      </Button>
    </form>
  );
}

function NewReportTypeCard({
  categories,
  onCreated,
}: {
  categories: ReportCategory[];
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [frequency, setFrequency] = useState<PeriodType>(PeriodType.MONTHLY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effectiveCode = codeTouched ? code : slugifyKey(name);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!categoryId) {
      setError('Choose a category first (create one above if needed).');
      return;
    }
    setBusy(true);
    try {
      await api.post('/report-types', {
        categoryId,
        code: effectiveCode,
        name: name.trim(),
        defaultFrequency: frequency,
      });
      setName('');
      setCode('');
      setCodeTouched(false);
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create report type');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="New report type">
      <form onSubmit={submit}>
        {error && (
          <div style={{ marginBottom: 12 }}>
            <Callout tone="danger">{error}</Callout>
          </div>
        )}
        <Field label="Report name" hint="e.g. HIV Viral Load">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="HIV Viral Load"
            required
          />
        </Field>
        <Field label="Code" hint="lower_snake_case · used in APIs and field paths">
          <input
            className="input mono"
            value={effectiveCode}
            onChange={(e) => {
              setCode(e.target.value);
              setCodeTouched(true);
            }}
            placeholder="hiv_viral_load"
            required
          />
        </Field>
        <Field label="Category">
          <select
            className="select"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
          >
            <option value="">— Select category —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Default frequency">
          <select
            className="select"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as PeriodType)}
          >
            {Object.values(PeriodType).map((p) => (
              <option key={p} value={p}>
                {p.toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" disabled={busy || !name.trim()}>
          <Plus size={16} /> Create report type
        </Button>
      </form>
    </Card>
  );
}
