'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Check, X, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import { PeriodType } from '@ohb/shared';
import { api, ApiError } from '@/lib/api';
import type { ReportCategory, ReportType } from '@/lib/types';
import { slugifyKey } from '@/lib/slug';
import { Button, Callout, Card, Field, Pill, Spinner } from '@/components/ui';

/** Orders categories as a depth-first tree, annotating each with its depth. */
function toTree(
  categories: ReportCategory[],
): { category: ReportCategory; depth: number }[] {
  const byParent = new Map<string | null, ReportCategory[]>();
  for (const c of categories) {
    const key = c.parentId ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(c);
    byParent.set(key, arr);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
  const out: { category: ReportCategory; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const c of byParent.get(parentId) ?? []) {
      out.push({ category: c, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** "Parent / Child / Grandchild" path for a category, for dropdown labels. */
function categoryPath(
  c: ReportCategory,
  byId: Map<string, ReportCategory>,
): string {
  const parts: string[] = [];
  let cur: ReportCategory | undefined = c;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    parts.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return parts.join(' / ');
}

/** Self + all descendants of `id` — invalid parent choices when re-parenting. */
function selfAndDescendants(id: string, categories: ReportCategory[]): Set<string> {
  const byParent = new Map<string | null, ReportCategory[]>();
  for (const c of categories) {
    const key = c.parentId ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(c);
    byParent.set(key, arr);
  }
  const result = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop() as string;
    for (const child of byParent.get(cur) ?? []) {
      result.add(child.id);
      stack.push(child.id);
    }
  }
  return result;
}

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
        <div style={{ minWidth: 0 }}>
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Children grouped by parent (null = roots), each list sorted by name.
  const childrenOf = useMemo(() => {
    const m = new Map<string | null, ReportCategory[]>();
    for (const c of categories) {
      const key = c.parentId ?? null;
      const arr = m.get(key) ?? [];
      arr.push(c);
      m.set(key, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return m;
  }, [categories]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const roots = childrenOf.get(null) ?? [];

  const renderNode = (c: ReportCategory, depth: number): ReactNode => {
    if (editingId === c.id) {
      return (
        <EditCategoryRow
          key={c.id}
          category={c}
          categories={categories}
          depth={depth}
          onDone={async () => {
            setEditingId(null);
            await onChanged();
          }}
          onCancel={() => setEditingId(null)}
        />
      );
    }
    const kids = childrenOf.get(c.id) ?? [];
    const hasKids = kids.length > 0;
    const isOpen = expanded.has(c.id);
    return (
      <div key={c.id}>
        <div className="cat-row">
          <div className="cat-row__main" style={{ paddingLeft: depth * 18 }}>
            {hasKids ? (
              <button
                type="button"
                className="cat-row__toggle"
                onClick={() => toggle(c.id)}
                aria-expanded={isOpen}
                aria-label={isOpen ? 'Collapse sub-categories' : 'Show sub-categories'}
                title={isOpen ? 'Collapse' : 'Show sub-categories'}
              >
                {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
            ) : (
              <span className="cat-row__toggle cat-row__toggle--leaf" aria-hidden />
            )}
            <div className="cat-row__text">
              <div className="cat-row__name">{c.name}</div>
              {c.description && <div className="cat-row__desc">{c.description}</div>}
            </div>
          </div>
          <div className="cat-row__actions">
            <Pill tone="slate">{c._count?.reportTypes ?? 0}</Pill>
            {hasKids && <Pill tone="slate">{kids.length} sub</Pill>}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditingId(c.id)}
              title="Edit category"
            >
              <Pencil size={14} />
            </Button>
            <DeleteCategoryButton category={c} onDeleted={onChanged} />
          </div>
        </div>
        {hasKids && isOpen && kids.map((k) => renderNode(k, depth + 1))}
      </div>
    );
  };

  return (
    <Card
      title="Categories"
      desc="Group report types into a tree. Click a ⌄ to reveal sub-categories; nest, rename, re-parent or remove."
    >
      {roots.length > 0 && (
        <div className="cat-tree" style={{ marginBottom: 16 }}>
          {roots.map((r) => renderNode(r, 0))}
        </div>
      )}
      <NewCategoryForm categories={categories} onCreated={onChanged} />
    </Card>
  );
}

function DeleteCategoryButton({
  category,
  onDeleted,
}: {
  category: ReportCategory;
  onDeleted: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const blocked =
    (category._count?.reportTypes ?? 0) > 0 || (category._count?.children ?? 0) > 0;

  async function remove() {
    if (!window.confirm(`Delete category "${category.name}"?`)) return;
    setBusy(true);
    try {
      await api.del(`/report-categories/${category.id}`);
      await onDeleted();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Failed to delete');
      setBusy(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={remove}
      disabled={busy || blocked}
      title={
        blocked
          ? 'Move its sub-categories and report types elsewhere first'
          : 'Delete this category'
      }
    >
      <Trash2 size={14} />
    </Button>
  );
}

function ParentSelect({
  value,
  onChange,
  options,
  byId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ReportCategory[];
  byId: Map<string, ReportCategory>;
}) {
  const ordered = useMemo(() => toTree(options), [options]);
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Top level (no parent) —</option>
      {ordered.map(({ category: c }) => (
        <option key={c.id} value={c.id}>
          {categoryPath(c, byId)}
        </option>
      ))}
    </select>
  );
}

function EditCategoryRow({
  category,
  categories,
  depth,
  onDone,
  onCancel,
}: {
  category: ReportCategory;
  categories: ReportCategory[];
  depth: number;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description ?? '');
  const [parentId, setParentId] = useState(category.parentId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byId = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  // A category may not be re-parented under itself or any of its descendants.
  const invalid = useMemo(
    () => selfAndDescendants(category.id, categories),
    [category.id, categories],
  );
  const parentOptions = useMemo(
    () => categories.filter((c) => !invalid.has(c.id)),
    [categories, invalid],
  );

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await api.patch(`/report-categories/${category.id}`, {
        name: name.trim(),
        description: description.trim(),
        parentId: parentId || null,
      });
      await onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save category');
      setBusy(false);
    }
  }

  return (
    <div className="cat-edit" style={{ marginLeft: depth * 18 }}>
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
        style={{ marginBottom: 6 }}
      />
      <ParentSelect
        value={parentId}
        onChange={setParentId}
        options={parentOptions}
        byId={byId}
      />
      {error && <div className="field__error">{error}</div>}
      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        <Button variant="ghost" size="sm" onClick={save} disabled={busy || name.trim().length < 2}>
          <Check size={14} /> Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          <X size={14} /> Cancel
        </Button>
      </div>
    </div>
  );
}

function NewCategoryForm({
  categories,
  onCreated,
}: {
  categories: ReportCategory[];
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byId = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/report-categories', {
        name: name.trim(),
        parentId: parentId || null,
      });
      setName('');
      setParentId('');
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
      {categories.length > 0 && (
        <Field label="Parent" hint="Leave as top level, or nest under a category">
          <ParentSelect
            value={parentId}
            onChange={setParentId}
            options={categories}
            byId={byId}
          />
        </Field>
      )}
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
  const byId = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const ordered = useMemo(() => toTree(categories), [categories]);

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
            {ordered.map(({ category: c }) => (
              <option key={c.id} value={c.id}>
                {categoryPath(c, byId)}
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
