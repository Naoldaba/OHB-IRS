/**
 * Starter schemas and the HIV Viral Load content-spec template. These shape the
 * admin-authored `fieldSchema`; the server still validates whatever is saved.
 * The HIV Viral Load template reproduces IMPLEMENTATION_PLAN §5 so an admin can
 * build the acceptance report quickly, then adjust it — all through the engine,
 * no per-report code.
 */

import type { MatrixFieldSchema, SimpleFieldSchema } from '@ohb/shared';

export function emptySimpleSchema(): SimpleFieldSchema {
  return {
    layout: 'simple',
    sections: [{ key: 'section_1', label: 'Section 1', fields: [] }],
  };
}

export function emptyMatrixSchema(): MatrixFieldSchema {
  return {
    layout: 'matrix',
    columnGroups: [{ key: 'group_1', label: 'Group 1' }],
    metrics: [{ key: 'total', label: 'Total', type: 'integer' }],
    rows: [],
    notes: [],
  };
}

export function hivViralLoadTemplate(): MatrixFieldSchema {
  return {
    layout: 'matrix',
    columnGroups: [
      { key: 'alternative', label: 'By alternative means' },
      { key: 'postal', label: 'Through Postal' },
    ],
    metrics: [
      { key: 'total', label: 'Total', type: 'integer' },
      { key: 'positive', label: 'Positive', type: 'integer' },
      { key: 'negative', label: 'Negative', type: 'integer' },
      { key: 'rr', label: '# RR', type: 'integer' },
      { key: 'vl_lt50', label: '<50', type: 'integer' },
      { key: 'vl_50_1000', label: '50–1000', type: 'integer' },
      { key: 'vl_gt1000', label: '>1000 copies/ml', type: 'integer' },
    ],
    rows: [
      {
        key: 'tb_genexpert',
        label: 'TB genxpert',
        srNo: 1,
        applicableMetrics: ['total', 'positive', 'negative', 'rr'],
      },
      {
        key: 'tb_culture_dst',
        label: 'TB (Culture, DST)',
        srNo: 2,
        applicableMetrics: ['total', 'positive', 'negative', 'rr'],
      },
      {
        key: 'eid_dbs',
        label: 'EID-DBS',
        srNo: 3,
        applicableMetrics: ['total', 'positive', 'negative'],
      },
      { key: 'cd4', label: 'CD4', srNo: 5, applicableMetrics: ['total'] },
      {
        key: 'viral_load',
        label: 'Viral Load',
        srNo: 4,
        applicableMetrics: ['total', 'vl_lt50', 'vl_50_1000', 'vl_gt1000'],
      },
    ],
    notes: [
      'Every applicable cell is a non-negative whole number. Greyed cells do not apply to that row.',
    ],
  };
}

/** Replace item at index immutably. */
export function replaceAt<T>(list: T[], index: number, next: T): T[] {
  return list.map((item, i) => (i === index ? next : item));
}

/** Remove item at index immutably. */
export function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}
