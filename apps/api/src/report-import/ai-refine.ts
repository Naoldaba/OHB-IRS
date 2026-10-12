/**
 * Phase 29 — the optional LLM refinement step for the Excel importer.
 *
 * It runs *after* the heuristic parser and improves only the **structure** the
 * heuristics cannot: field types, select options, a trimmed per-row applicable
 * mask, and clearer labels. It is a *draft generator, never an authority*:
 *
 *   - **Tier S (structure/labels only).** The model is sent only the candidate
 *     {@link FieldSchema} — keys, labels, types, the grid shape. That object
 *     holds **no report data value** (the parser never puts cell data in it), so
 *     this is provably value-free; see {@link assertNoDataValues}.
 *   - **Merge, never replace.** The model's output is applied key-by-key onto the
 *     heuristic schema; unknown keys are ignored and nothing is invented or
 *     dropped. The merged schema is then checked by the authoritative
 *     {@link validateFieldSchema}; if it fails, the AI result is discarded and the
 *     heuristic schema stands.
 *   - **No publish.** The admin still reviews everything in the builder and the
 *     publish gate is unchanged.
 */

import {
  isMatrixSchema,
  isSimpleSchema,
  validateFieldSchema,
  type FieldSchema,
  type ImportNote,
  type MatrixFieldSchema,
  type SelectOption,
  type SimpleFieldSchema,
  type SimpleFieldType,
} from '@ohb/shared';
import type { AiJsonRequest } from '../ai/ai.provider';

const SIMPLE_TYPES: readonly SimpleFieldType[] = ['number', 'integer', 'text', 'date', 'select'];

/** The structured shape we ask the model for (all keys reference existing ones). */
interface AiRefineOutput {
  fields?: {
    key: string;
    label?: string;
    type?: string;
    required?: boolean;
    options?: { value?: string; label?: string }[];
  }[];
  rows?: { key: string; applicableMetrics?: string[] }[];
  metrics?: { key: string; label?: string }[];
  columnGroups?: { key: string; label?: string }[];
  notes?: string[];
}

export interface AiRefineResult {
  schema: FieldSchema;
  /** What the AI changed vs the heuristic schema (to verify). */
  suggestions: ImportNote[];
  /** AI caveats + any "ignored because invalid" note. */
  notes: ImportNote[];
}

/**
 * Defence-in-depth: the schema must not carry anything that looks like entered
 * data. The parser never does, but this guards against a future change leaking
 * values to the model. Throwing here would surface as a normal import (the
 * caller swallows it and keeps the heuristic result).
 */
export function assertNoDataValues(schema: FieldSchema): void {
  const banned = ['value', 'values', 'data', 'cells'];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (banned.includes(k)) {
          throw new Error(`Schema unexpectedly contains a "${k}" key; refusing to send to the model.`);
        }
        walk(v);
      }
    }
  };
  walk(schema);
}

const SYSTEM_PROMPT = [
  'You refine the STRUCTURE of a report form that was auto-extracted from a spreadsheet.',
  'You are given a candidate schema of fields/labels only — never any entered data.',
  'Improve only what a label implies: a better field "type", dropdown "options" for a',
  'field that is clearly a fixed choice, a clearer "label", and for matrix reports a',
  'trimmed per-row "applicableMetrics" list where a metric plainly does not apply to a row.',
  '',
  'Hard rules:',
  '- Keep every "key" exactly as given. Never invent, rename, drop, add, or reorder fields,',
  '  rows, metrics, or column groups. Only annotate existing keys.',
  '- Only suggest "options" when the label names a small fixed set (e.g. Sex -> Male/Female).',
  '  Do NOT guess options from imagined data. If unsure, leave the field as text.',
  '- "applicableMetrics" may only narrow the existing set (a subset of existing metric keys).',
  '- Field "type" must be one of: number, integer, text, date, select.',
  '- Put anything you are unsure about in "notes" instead of acting on it.',
  '',
  'Return ONLY JSON of this shape (omit keys you are not changing):',
  '{ "fields":[{"key":"","label":"","type":"","required":false,"options":[{"value":"","label":""}]}],',
  '  "rows":[{"key":"","applicableMetrics":[""]}],',
  '  "metrics":[{"key":"","label":""}],',
  '  "columnGroups":[{"key":"","label":""}],',
  '  "notes":[""] }',
].join('\n');

/** Build the request. The user payload is the candidate schema (labels only). */
export function buildRefineRequest(schema: FieldSchema, maxTokens: number): AiJsonRequest {
  assertNoDataValues(schema);
  const shape = isMatrixSchema(schema) ? 'matrix' : 'simple';
  return {
    system: SYSTEM_PROMPT,
    user: `Report layout: ${shape}\nCandidate schema:\n${JSON.stringify(schema, null, 2)}`,
    maxTokens,
  };
}

/**
 * Merge the model's suggestions onto the heuristic schema (known keys only),
 * validate the result, and report what changed. Pure — no I/O.
 */
export function applyAiRefinement(original: FieldSchema, raw: unknown): AiRefineResult {
  const out = (raw ?? {}) as AiRefineOutput;
  const suggestions: ImportNote[] = [];
  const notes: ImportNote[] = toNotes(out.notes);

  const merged: FieldSchema = structuredClone(original);

  if (isSimpleSchema(merged)) {
    mergeSimple(merged, out, suggestions);
  } else if (isMatrixSchema(merged)) {
    mergeMatrix(merged, out, suggestions);
  }

  // The merged schema must still pass the authoritative validator; otherwise the
  // AI result is discarded and the heuristic schema stands.
  const check = validateFieldSchema(merged);
  if (!check.ok) {
    return {
      schema: original,
      suggestions: [],
      notes: [
        ...notes,
        { message: 'The AI suggestions produced an invalid structure and were ignored; the imported structure is unchanged.' },
      ],
    };
  }

  return { schema: merged, suggestions, notes };
}

function mergeSimple(schema: SimpleFieldSchema, out: AiRefineOutput, suggestions: ImportNote[]): void {
  if (!out.fields?.length) return;
  const byKey = new Map(out.fields.map((f) => [f.key, f]));
  for (const section of schema.sections) {
    for (const field of section.fields) {
      const s = byKey.get(field.key);
      if (!s) continue;
      const where = `field "${field.label}"`;

      // Options imply a select; accept clean {value,label} pairs only.
      const options = cleanOptions(s.options);
      if (options.length > 0) {
        const wasType = field.type;
        field.type = 'select';
        field.options = options;
        suggestions.push({
          message:
            wasType === 'select'
              ? `Set ${options.length} dropdown option(s) on ${where}.`
              : `Changed ${where} to a dropdown with ${options.length} option(s) (was ${wasType}).`,
        });
      } else if (s.type && SIMPLE_TYPES.includes(s.type as SimpleFieldType) && s.type !== 'select') {
        const next = s.type as SimpleFieldType;
        if (next !== field.type) {
          suggestions.push({ message: `Changed ${where} type ${field.type} → ${next}.` });
          field.type = next;
          delete field.options;
        }
      }

      if (typeof s.required === 'boolean' && s.required !== Boolean(field.required)) {
        field.required = s.required;
        suggestions.push({ message: `Marked ${where} ${s.required ? 'required' : 'optional'}.` });
      }

      if (s.label && s.label.trim() && s.label.trim() !== field.label) {
        suggestions.push({ message: `Relabelled field "${field.label}" → "${s.label.trim()}".` });
        field.label = s.label.trim();
      }
    }
  }
}

function mergeMatrix(schema: MatrixFieldSchema, out: AiRefineOutput, suggestions: ImportNote[]): void {
  const metricKeys = new Set(schema.metrics.map((m) => m.key));

  if (out.rows?.length) {
    const byKey = new Map(out.rows.map((r) => [r.key, r]));
    for (const row of schema.rows) {
      const s = byKey.get(row.key);
      if (!s || !Array.isArray(s.applicableMetrics)) continue;
      // Narrow only: intersect with existing metric keys and the row's current set.
      const next = s.applicableMetrics.filter((k) => metricKeys.has(k) && row.applicableMetrics.includes(k));
      const uniqueNext = [...new Set(next)];
      if (uniqueNext.length > 0 && uniqueNext.length < row.applicableMetrics.length) {
        suggestions.push({
          message: `Trimmed applicable metrics on row "${row.label}" from ${row.applicableMetrics.length} to ${uniqueNext.length}.`,
        });
        row.applicableMetrics = uniqueNext;
      }
    }
  }

  if (out.metrics?.length) {
    const byKey = new Map(out.metrics.map((m) => [m.key, m]));
    for (const metric of schema.metrics) {
      const s = byKey.get(metric.key);
      if (s?.label && s.label.trim() && s.label.trim() !== metric.label) {
        suggestions.push({ message: `Relabelled metric "${metric.label}" → "${s.label.trim()}".` });
        metric.label = s.label.trim();
      }
    }
  }

  if (out.columnGroups?.length) {
    const byKey = new Map(out.columnGroups.map((g) => [g.key, g]));
    for (const group of schema.columnGroups) {
      const s = byKey.get(group.key);
      if (s?.label && s.label.trim() && s.label.trim() !== group.label) {
        suggestions.push({ message: `Relabelled column group "${group.label}" → "${s.label.trim()}".` });
        group.label = s.label.trim();
      }
    }
  }
}

function cleanOptions(options: { value?: string; label?: string }[] | undefined): SelectOption[] {
  if (!Array.isArray(options)) return [];
  const seen = new Set<string>();
  const out: SelectOption[] = [];
  for (const o of options) {
    const label = (o?.label ?? o?.value ?? '').trim();
    const value = (o?.value ?? o?.label ?? '').trim();
    if (!label || !value || seen.has(value)) continue;
    seen.add(value);
    out.push({ value, label });
  }
  return out;
}

function toNotes(messages: string[] | undefined): ImportNote[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((m) => (typeof m === 'string' ? m.trim() : ''))
    .filter((m) => m.length > 0)
    .slice(0, 20)
    .map((message) => ({ message }));
}
