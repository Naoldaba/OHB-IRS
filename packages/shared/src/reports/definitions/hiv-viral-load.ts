/**
 * Report definition: "HIV Viral Load" (category: Routine Lab Report).
 *
 * Source of truth: the provided spreadsheet image. Rows are the "Type of tests"
 * column; the two column groups are the sample transport means ("by alternative
 * means" and "Through Postal"); each group repeats the same seven metrics.
 * The applicable-metric mask reproduces the grey (not-applicable) cells exactly
 * as they appear in the source.
 *
 * NOTE (flagged ambiguity): the source does not consistently make the viral
 * load buckets sum to Total, so no cross-field total validation is applied.
 */

import { PeriodType } from '../../enums';
import { MatrixReportDefinition } from '../matrix-types';

export const HIV_VIRAL_LOAD_CODE = 'hiv_viral_load';

export const hivViralLoadDefinition: MatrixReportDefinition = {
  kind: 'matrix',
  code: HIV_VIRAL_LOAD_CODE,
  name: 'HIV Viral Load',
  category: 'Routine Lab Report',
  defaultFrequency: PeriodType.MONTHLY,
  columnGroups: [
    { key: 'alternative', label: 'By alternative means' },
    { key: 'postal', label: 'Through Postal' },
  ],
  metrics: [
    { key: 'total', label: 'Total', type: 'integer' },
    { key: 'positive', label: 'Positive', type: 'integer' },
    { key: 'negative', label: 'Negative', type: 'integer' },
    { key: 'rr', label: '# RR', type: 'integer' },
    { key: 'vl_lt50', label: '# HIV Viral Load <50 copies/ml', type: 'integer' },
    { key: 'vl_50_1000', label: '# HIV Viral Load 50 to 1000 copies/ml', type: 'integer' },
    { key: 'vl_gt1000', label: '# HIV Viral Load >1000 copies/ml', type: 'integer' },
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
    {
      key: 'cd4',
      label: 'CD4',
      srNo: 5,
      applicableMetrics: ['total'],
    },
    {
      key: 'viral_load',
      label: 'Viral Load',
      srNo: 4,
      applicableMetrics: ['total', 'vl_lt50', 'vl_50_1000', 'vl_gt1000'],
    },
  ],
  notes: [
    'Grey cells in the source sheet are not applicable for that test type and are disabled.',
    'Viral load buckets are not required to sum to Total (per the source data).',
  ],
};
