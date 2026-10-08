/**
 * Feedback anchoring helpers. Feedback can be tied to a part of the report
 * (CLAUDE.md: "associated with a specific section or field rather than only the
 * report as a whole"). These derive the selectable anchors — and a readable
 * label for a stored anchor — from the shared RenderModel, so the admin picks a
 * real section/field/row/column rather than typing a raw key.
 *
 * The stored anchor is the Feedback model's (sectionKey, fieldKey) pair:
 *   simple layout → sectionKey = section, fieldKey = field
 *   matrix layout → sectionKey = row,     fieldKey = metric (column)
 */

import type { RenderModel } from '@ohb/shared';

export interface AnchorOption {
  /** Opaque id for the <select>; encodes the section/field pair. */
  id: string;
  label: string;
  sectionKey?: string;
  fieldKey?: string;
}

export const GENERAL_ANCHOR: AnchorOption = { id: '', label: 'General — the whole report' };

export function anchorOptions(model: RenderModel | null): AnchorOption[] {
  if (!model) return [GENERAL_ANCHOR];
  const out: AnchorOption[] = [GENERAL_ANCHOR];

  if (model.layout === 'simple') {
    for (const section of model.sections) {
      out.push({ id: `s:${section.key}`, label: section.label, sectionKey: section.key });
      for (const field of section.fields) {
        out.push({
          id: `f:${section.key}.${field.key}`,
          label: `${section.label} › ${field.label}`,
          sectionKey: section.key,
          fieldKey: field.key,
        });
      }
    }
    return out;
  }

  // matrix
  for (const row of model.rows) {
    out.push({ id: `r:${row.key}`, label: `Row: ${row.label}`, sectionKey: row.key });
  }
  for (const metric of model.metrics) {
    out.push({ id: `m:${metric.key}`, label: `Column: ${metric.label}`, fieldKey: metric.key });
  }
  return out;
}

/**
 * Report sections an attachment can be anchored to. Only the simple layout has
 * named sections; a matrix report has no section list, so this returns none and
 * the attachment stays general.
 */
export function sectionOptions(model: RenderModel | null): { key: string; label: string }[] {
  if (!model || model.layout !== 'simple') return [];
  return model.sections.map((s) => ({ key: s.key, label: s.label }));
}

/** Human-readable label for a stored (sectionKey, fieldKey) anchor. */
export function anchorLabel(
  model: RenderModel | null | undefined,
  sectionKey?: string | null,
  fieldKey?: string | null,
): string | null {
  if (!sectionKey && !fieldKey) return null;
  if (model) {
    const match = anchorOptions(model).find(
      (o) => (o.sectionKey ?? undefined) === (sectionKey ?? undefined) &&
        (o.fieldKey ?? undefined) === (fieldKey ?? undefined),
    );
    if (match && match.id) return match.label;
  }
  // Fall back to the raw keys if the schema no longer describes this anchor.
  return [sectionKey, fieldKey].filter(Boolean).join(' · ');
}
