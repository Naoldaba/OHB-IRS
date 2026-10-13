/**
 * The field catalog: the bridge between a rule's stable **field path** and the
 * actual value inside a submission's `data` object, which differs by layout:
 *
 *   - `simple` — path `"<sectionKey>.<fieldKey>"`, value at `data.values[fieldKey]`.
 *   - `matrix` — path `"rows.<rowKey>.<groupKey>.<metricKey>"`, value at the same
 *     nested location in `data`.
 *
 * Only *applicable* matrix cells appear in the catalog (disabled cells are not
 * valid rule targets). The catalog also carries each field's value-type so the
 * config validator can check operator/type compatibility, and it powers the
 * `GET .../fields` endpoint that the Rule Builder (Phase 6) uses as its field
 * selector. This is the single place that knows how data is laid out per layout.
 */

import { FieldSchema, isDocumentSchema, isMatrixSchema, isTableSchema } from '../field-schema';
import { FieldValueType } from './rule-ast';

export interface FieldCatalogEntry {
  /** Canonical rule field reference. */
  path: string;
  /** Human-readable label (for the builder and diagnostics). */
  label: string;
  type: FieldValueType;
  /** Location of this field's value within the submission `data` object. */
  dataPath: string[];
}

export function buildFieldCatalog(schema: FieldSchema): FieldCatalogEntry[] {
  const entries: FieldCatalogEntry[] = [];

  if (isMatrixSchema(schema)) {
    for (const row of schema.rows) {
      const applicable = new Set(row.applicableMetrics);
      for (const group of schema.columnGroups) {
        for (const metric of schema.metrics) {
          if (!applicable.has(metric.key)) continue; // disabled cells are not addressable
          entries.push({
            path: `rows.${row.key}.${group.key}.${metric.key}`,
            label: `${row.label} / ${group.label} / ${metric.label}`,
            type: 'integer',
            dataPath: ['rows', row.key, group.key, metric.key],
          });
        }
      }
    }
    return entries;
  }

  // `table` rows are open-ended, so there are no fixed, addressable field paths
  // for the rule engine to target. Business rules on table reports are deferred
  // (a later enhancement would introduce row-scoped rules); the structural
  // validator still enforces dimension types, required-ness and metric cells.
  if (isTableSchema(schema) || isDocumentSchema(schema)) {
    return entries;
  }

  for (const section of schema.sections) {
    for (const field of section.fields) {
      entries.push({
        path: `${section.key}.${field.key}`,
        label: `${section.label} / ${field.label}`,
        type: field.type,
        dataPath: ['values', field.key],
      });
    }
  }
  return entries;
}

export function buildCatalogMap(schema: FieldSchema): Map<string, FieldCatalogEntry> {
  const map = new Map<string, FieldCatalogEntry>();
  for (const entry of buildFieldCatalog(schema)) map.set(entry.path, entry);
  return map;
}

/** Read a value at a data path; returns `undefined` if any segment is missing. */
export function getAtDataPath(data: unknown, dataPath: string[]): unknown {
  let cur: unknown = data;
  for (const key of dataPath) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Write a value at a data path, creating intermediate objects as needed. */
export function setAtDataPath(
  data: Record<string, unknown>,
  dataPath: string[],
  value: unknown,
): void {
  let cur: Record<string, unknown> = data;
  for (let i = 0; i < dataPath.length - 1; i++) {
    const key = dataPath[i];
    const next = cur[key];
    if (next === null || typeof next !== 'object' || Array.isArray(next)) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[dataPath[dataPath.length - 1]] = value;
}
