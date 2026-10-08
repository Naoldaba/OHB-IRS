/**
 * Report Registry: the single place that maps a report code (ReportType.schemaKey)
 * to its definition. Implementing a new report = adding its definition module and
 * registering it here. No other part of the system hard-codes report fields.
 */

import { MatrixReportDefinition } from './matrix-types';
import { MatrixFieldSchema } from './field-schema';
import { hivViralLoadDefinition } from './definitions/hiv-viral-load';

export type ReportDefinition = MatrixReportDefinition; // union grows with new kinds

/**
 * Projects a registry report definition down to the structural `fieldSchema`
 * stored in a definition version (dropping report identity, which lives on the
 * ReportType). Used to seed example/demo `REGISTRY` definitions.
 */
export function toFieldSchema(def: ReportDefinition): MatrixFieldSchema {
  return {
    layout: 'matrix',
    columnGroups: def.columnGroups,
    metrics: def.metrics,
    rows: def.rows,
    notes: def.notes,
  };
}

const REGISTRY: Record<string, ReportDefinition> = {
  [hivViralLoadDefinition.code]: hivViralLoadDefinition,
};

export function getReportDefinition(code: string): ReportDefinition | undefined {
  return REGISTRY[code];
}

export function requireReportDefinition(code: string): ReportDefinition {
  const def = REGISTRY[code];
  if (!def) {
    throw new Error(`No report definition registered for code "${code}"`);
  }
  return def;
}

export function listReportDefinitions(): ReportDefinition[] {
  return Object.values(REGISTRY);
}
