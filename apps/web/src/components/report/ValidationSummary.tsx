'use client';

/**
 * Pre-submit validation roll-up (Phase 15). The report renderer already marks
 * each failing cell in place; this gathers those same diagnostics — the
 * validator `errors` the server returns from `PATCH /submissions/:id` and the
 * 422 on submit — into one "N issues across M sections, jump to each" panel so a
 * lab head does not have to hunt for them before submitting.
 *
 * It is purely a presentation of errors the server already returned; no new
 * backend. Each item deep-links to its control, which carries a DOM id equal to
 * its validator path (simple: "<section>.<field>"; matrix:
 * "<row>.<group>.<metric>") — the same path used as the `errors` map key.
 */

import { useMemo } from 'react';
import type { RenderModel } from '@ohb/shared';
import { Callout } from '@/components/ui';

export interface ValidationSummaryProps {
  model: RenderModel | null;
  /** validator-path -> message, as held by the page and passed to the renderer. */
  errors: Record<string, string>;
}

interface Issue {
  path: string;
  message: string;
  /** Field/metric label. */
  label: string;
  /** Section (simple) or row (matrix) the field belongs to. */
  group: string;
}

/** path -> { label, group }, in the model's own display order. */
function buildLookup(model: RenderModel | null): Map<string, { label: string; group: string }> {
  const lookup = new Map<string, { label: string; group: string }>();
  if (!model) return lookup;

  if (model.layout === 'simple') {
    for (const section of model.sections) {
      for (const field of section.fields) {
        lookup.set(field.path, { label: field.label, group: section.label });
      }
    }
    return lookup;
  }

  // table rows are per-index and dynamic, so issues are parsed from the path
  // directly in buildTableIssues rather than pre-enumerated here.
  if (model.layout === 'table') return lookup;

  // document reports have no fields.
  if (model.layout === 'document') return lookup;

  // matrix: error path is "<rowKey>.<groupKey>.<metricKey>" (no "rows." prefix).
  const metricLabel = new Map(model.metrics.map((m) => [m.key, m.label]));
  for (const row of model.rows) {
    for (const g of model.columnGroups) {
      for (const m of model.metrics) {
        lookup.set(`${row.key}.${g.key}.${m.key}`, {
          label: `${g.label} · ${metricLabel.get(m.key) ?? m.key}`,
          group: row.label,
        });
      }
    }
  }
  return lookup;
}

/** Table issues: parse the row-indexed paths into readable labels. */
function buildTableIssues(
  model: Extract<RenderModel, { layout: 'table' }>,
  errors: Record<string, string>,
): Issue[] {
  const dimLabel = new Map(model.dimensions.map((d) => [d.key, d.label]));
  const groupLabel = new Map(model.columnGroups.map((g) => [g.key, g.label]));
  const metricLabel = new Map(model.metrics.map((m) => [m.key, m.label]));
  const issues: Issue[] = [];

  for (const [path, message] of Object.entries(errors)) {
    const dim = /^rows\[(\d+)\]\.dimensions\.(.+)$/.exec(path);
    if (dim) {
      issues.push({
        path,
        message,
        label: dimLabel.get(dim[2]) ?? dim[2],
        group: `Row ${Number(dim[1]) + 1}`,
      });
      continue;
    }
    const cell = /^rows\[(\d+)\]\.cells\.([^.]+)\.(.+)$/.exec(path);
    if (cell) {
      issues.push({
        path,
        message,
        label: `${groupLabel.get(cell[2]) ?? cell[2]} · ${metricLabel.get(cell[3]) ?? cell[3]}`,
        group: `Row ${Number(cell[1]) + 1}`,
      });
      continue;
    }
    issues.push({ path, message, label: path, group: 'Table' });
  }
  return issues;
}

function buildIssues(model: RenderModel | null, errors: Record<string, string>): Issue[] {
  if (model?.layout === 'table') return buildTableIssues(model, errors);
  const lookup = buildLookup(model);
  const errorPaths = new Set(Object.keys(errors));
  const issues: Issue[] = [];

  // Emit in the model's own order so the list reads top-to-bottom like the form.
  for (const [path, meta] of lookup) {
    const message = errors[path];
    if (message === undefined) continue;
    issues.push({ path, message, label: meta.label, group: meta.group });
    errorPaths.delete(path);
  }
  // Any error whose path the current model no longer describes (defensive).
  for (const path of errorPaths) {
    issues.push({ path, message: errors[path], label: path, group: 'Other' });
  }
  return issues;
}

/** Scroll the offending control into view and focus it for the jump link. */
function jumpTo(path: string) {
  const el = document.getElementById(path);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (el instanceof HTMLElement) el.focus({ preventScroll: true });
}

export function ValidationSummary({ model, errors }: ValidationSummaryProps) {
  const issues = useMemo(() => buildIssues(model, errors), [model, errors]);
  if (issues.length === 0) return null;

  const groups: { group: string; items: Issue[] }[] = [];
  for (const issue of issues) {
    const last = groups[groups.length - 1];
    if (last && last.group === issue.group) last.items.push(issue);
    else groups.push({ group: issue.group, items: [issue] });
  }

  const n = issues.length;
  const m = groups.length;
  const title = `${n} issue${n === 1 ? '' : 's'} across ${m} section${m === 1 ? '' : 's'} — fix before submitting`;

  return (
    <div style={{ marginBottom: 16 }}>
      <Callout tone="danger" title={title}>
        <div className="stack" style={{ gap: 12, marginTop: 4 }}>
          {groups.map((g) => (
            <div key={g.group}>
              <div className="micro-label" style={{ marginBottom: 4 }}>
                {g.group}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
                {g.items.map((it) => (
                  <li key={it.path}>
                    <button
                      type="button"
                      className="val-summary__item"
                      onClick={() => jumpTo(it.path)}
                    >
                      <span>
                        <strong>{it.label}</strong> — {it.message}
                      </span>
                      <span aria-hidden className="val-summary__jump">
                        Jump →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Callout>
    </div>
  );
}
