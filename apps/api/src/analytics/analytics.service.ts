import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReportStatus } from '@ohb/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Compliance & analytics for the Bureau dashboard (Phase 8).
 *
 * Everything here is derived from *actual* data — reporting requirements, the
 * reporting periods that have opened, due dates, and real submissions. No
 * metric is fabricated or assumed (CLAUDE.md "Dashboard and Analytics").
 *
 * The compliance universe is a set of **expected submission slots**: for every
 * active {@link ReportingRequirement} we resolve the labs it expects (a specific
 * lab, or all active labs when `laboratoryId` is null) and cross them with the
 * report type's reporting periods that have already **opened** (`startDate <=
 * now`). A future period is not yet expected, so it never counts as missing.
 * Each slot is then matched against the one submission that can exist for its
 * (reportType, lab, period) triple and classified.
 */

/** A set of compliance tallies over some collection of expected slots. */
export interface ComplianceCounts {
  /** Expected submission slots in scope. */
  expected: number;
  /** Slots whose report has been submitted at least once (status past DRAFT). */
  submitted: number;
  /** Submitted and awaiting the Bureau: SUBMITTED / RESUBMITTED / UNDER_REVIEW. */
  pendingReview: number;
  /** Submitted and approved. */
  approved: number;
  /** Submitted but sent back for revision. */
  revisionRequired: number;
  /** Not yet submitted (missing or still a draft) and past the due date. */
  overdue: number;
  /** Not yet submitted (missing or still a draft) and not yet due. */
  pending: number;
  /** Informational: slots that exist only as an unsent DRAFT. */
  draft: number;
  /** submitted / expected, 0..1 (0 when nothing is expected). */
  complianceRate: number;
}

export interface OverviewAnalytics extends ComplianceCounts {
  totalLaboratories: number;
  totalReportTypes: number;
  /** Submissions carrying one or more FLAG-severity rule outcomes. */
  flagged: number;
}

export interface LabComplianceRow extends ComplianceCounts {
  laboratoryId: string;
  laboratoryName: string;
  laboratoryCode: string;
}

export interface TrendPoint extends ComplianceCounts {
  periodId: string;
  periodLabel: string;
  year: number;
  periodNumber: number;
  reportTypeId: string;
  reportTypeName: string;
  dueDate: string;
}

/**
 * One expected submission slot (a report a lab owes for an opened period) with
 * its current state. Returned only for the lab-scoped dashboard (Phase 13) so a
 * lab head sees exactly what is due and can jump straight to each report.
 */
export interface ExpectedSlot {
  reportTypeId: string;
  reportTypeName: string;
  periodId: string;
  periodLabel: string;
  year: number;
  periodNumber: number;
  startDate: string;
  dueDate: string;
  /** The matching submission's status, or null when nothing has been started. */
  status: ReportStatus | null;
  /** The submission to open/continue, or null when it must still be created. */
  submissionId: string | null;
  /** Not submitted (missing or still a draft) and past the due date. */
  overdue: boolean;
}

export interface DashboardAnalytics {
  generatedAt: string;
  overview: OverviewAnalytics;
  laboratories: LabComplianceRow[];
  trends: TrendPoint[];
  /** Per-slot "what's due" detail; present only when scoped to one laboratory. */
  expectedSlots?: ExpectedSlot[];
}

/**
 * One expected submission slot carrying the laboratory it belongs to, used by
 * the scheduled reminder sweep (Phase 17) which spans all labs. This is the same
 * "expected slot" the dashboard derives, exposed flat (per lab) with the raw
 * `dueDate` so the sweep can compare it against its lead window.
 */
export interface ReminderSlot {
  reportTypeId: string;
  reportTypeName: string;
  laboratoryId: string;
  periodId: string;
  periodLabel: string;
  /** Canonical due date (UTC) for the slot's reporting period. */
  dueDate: Date;
  /** The matching submission's status, or null when nothing has been started. */
  status: ReportStatus | null;
  /** The draft to continue, or null when the report must still be created. */
  submissionId: string | null;
  /** Not submitted (missing or still an unsent draft). */
  notSubmitted: boolean;
}

/** Statuses that mean the report has been submitted at least once. */
const SUBMITTED_STATUSES = new Set<ReportStatus>([
  ReportStatus.SUBMITTED,
  ReportStatus.RESUBMITTED,
  ReportStatus.UNDER_REVIEW,
  ReportStatus.REVISION_REQUIRED,
  ReportStatus.APPROVED,
]);

const PENDING_REVIEW_STATUSES = new Set<ReportStatus>([
  ReportStatus.SUBMITTED,
  ReportStatus.RESUBMITTED,
  ReportStatus.UNDER_REVIEW,
]);

interface MutableCounts {
  expected: number;
  submitted: number;
  pendingReview: number;
  approved: number;
  revisionRequired: number;
  overdue: number;
  pending: number;
  draft: number;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The whole dashboard in one pass. Optionally scoped to one report type and/or
   * one laboratory. When `laboratoryId` is set the entire compliance universe is
   * restricted to that lab (the lab portal view, Phase 13): the expected-slot
   * computation only resolves that lab, every tally covers it alone, and a
   * per-slot {@link ExpectedSlot} list ("what's due") is included. Callers that
   * expose this to a lab user MUST force `laboratoryId = user.laboratoryId`.
   */
  async dashboard(
    filter: { reportTypeId?: string; trendLimit?: number; laboratoryId?: string } = {},
  ): Promise<DashboardAnalytics> {
    const now = new Date();
    const labScoped = !!filter.laboratoryId;

    const { labs, labsByType, periods, subByKey, submissions, reportTypesCount } =
      await this.loadComplianceData(filter, now);

    const overview = emptyCounts();
    const perLab = new Map<string, MutableCounts>(labs.map((l) => [l.id, emptyCounts()]));
    const perPeriod: { period: (typeof periods)[number]; counts: MutableCounts }[] = [];
    // Per-slot detail, collected only for the lab-scoped view.
    const expectedSlots: ExpectedSlot[] = [];

    for (const period of periods) {
      const expectedLabs = labsByType.get(period.reportTypeId);
      if (!expectedLabs || expectedLabs.size === 0) continue; // nobody is required to report this → not expected
      const pastDue = now.getTime() > period.dueDate.getTime();
      const pc = emptyCounts();
      for (const labId of expectedLabs) {
        const sub = subByKey.get(slotKey(period.reportTypeId, labId, period.id)) ?? null;
        const status = sub?.status ?? null;
        classify(overview, status, pastDue);
        const labCounts = perLab.get(labId);
        if (labCounts) classify(labCounts, status, pastDue);
        classify(pc, status, pastDue);
        if (labScoped) {
          const notSubmitted = status === null || status === ReportStatus.DRAFT;
          expectedSlots.push({
            reportTypeId: period.reportType.id,
            reportTypeName: period.reportType.name,
            periodId: period.id,
            periodLabel: period.label,
            year: period.year,
            periodNumber: period.periodNumber,
            startDate: period.startDate.toISOString(),
            dueDate: period.dueDate.toISOString(),
            status,
            submissionId: sub?.id ?? null,
            overdue: notSubmitted && pastDue,
          });
        }
      }
      perPeriod.push({ period, counts: pc });
    }

    // Most recent (and most actionable) periods first for the "what's due" list.
    expectedSlots.sort(
      (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
    );

    const flagged = submissions.filter((s) => Array.isArray(s.flags) && (s.flags as Prisma.JsonArray).length > 0).length;

    const trendLimit = filter.trendLimit && filter.trendLimit > 0 ? filter.trendLimit : 12;
    // perPeriod is already ordered by startDate asc; keep the most recent `trendLimit`.
    const trends: TrendPoint[] = perPeriod.slice(-trendLimit).map(({ period, counts }) => ({
      ...finalize(counts),
      periodId: period.id,
      periodLabel: period.label,
      year: period.year,
      periodNumber: period.periodNumber,
      reportTypeId: period.reportType.id,
      reportTypeName: period.reportType.name,
      dueDate: period.dueDate.toISOString(),
    }));

    const laboratories: LabComplianceRow[] = labs.map((l) => ({
      ...finalize(perLab.get(l.id) ?? emptyCounts()),
      laboratoryId: l.id,
      laboratoryName: l.name,
      laboratoryCode: l.code,
    }));

    return {
      generatedAt: now.toISOString(),
      overview: {
        ...finalize(overview),
        totalLaboratories: labs.length,
        totalReportTypes: reportTypesCount,
        flagged,
      },
      laboratories,
      trends,
      ...(labScoped ? { expectedSlots } : {}),
    };
  }

  /**
   * Flat list of every expected submission slot across all active labs, for the
   * scheduled reminder sweep (Phase 17). Reuses the exact same derivation the
   * dashboard uses — opened periods (`startDate <= now`) crossed with the labs an
   * active {@link ReportingRequirement} resolves to — so reminders fire for the
   * same universe compliance is measured against (never a not-yet-opened period,
   * never an unrequired lab). Unscoped by design; the sweep spans the bureau.
   */
  async expectedSlotsForReminders(now = new Date()): Promise<ReminderSlot[]> {
    const { labsByType, periods, subByKey } = await this.loadComplianceData({}, now);

    const slots: ReminderSlot[] = [];
    for (const period of periods) {
      const expectedLabs = labsByType.get(period.reportTypeId);
      if (!expectedLabs || expectedLabs.size === 0) continue;
      for (const labId of expectedLabs) {
        const sub = subByKey.get(slotKey(period.reportTypeId, labId, period.id)) ?? null;
        const status = sub?.status ?? null;
        slots.push({
          reportTypeId: period.reportType.id,
          reportTypeName: period.reportType.name,
          laboratoryId: labId,
          periodId: period.id,
          periodLabel: period.label,
          dueDate: period.dueDate,
          status,
          submissionId: sub?.id ?? null,
          notSubmitted: status === null || status === ReportStatus.DRAFT,
        });
      }
    }
    return slots;
  }

  /**
   * Shared data load + requirement resolution behind {@link dashboard} and
   * {@link expectedSlotsForReminders}: the single source of truth for which
   * labs owe which report types for which opened periods.
   */
  private async loadComplianceData(
    filter: { reportTypeId?: string; laboratoryId?: string },
    now: Date,
  ) {
    const typeWhere = filter.reportTypeId ? { reportTypeId: filter.reportTypeId } : {};

    const [labs, requirements, periods, submissions, reportTypes] = await Promise.all([
      this.prisma.laboratory.findMany({
        // Lab-scoped: the universe is just the one laboratory, so every
        // requirement (incl. the all-labs ones) resolves to it and nothing else.
        where: { isActive: true, ...(filter.laboratoryId ? { id: filter.laboratoryId } : {}) },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true },
      }),
      this.prisma.reportingRequirement.findMany({
        where: { isActive: true, ...typeWhere },
        select: { reportTypeId: true, laboratoryId: true },
      }),
      this.prisma.reportingPeriod.findMany({
        // Only periods that have opened can be expected yet.
        where: { startDate: { lte: now }, ...typeWhere },
        orderBy: { startDate: 'asc' },
        include: { reportType: { select: { id: true, name: true } } },
      }),
      this.prisma.reportSubmission.findMany({
        where: { ...typeWhere, ...(filter.laboratoryId ? { laboratoryId: filter.laboratoryId } : {}) },
        select: {
          id: true,
          reportTypeId: true,
          laboratoryId: true,
          reportingPeriodId: true,
          status: true,
          flags: true,
        },
      }),
      this.prisma.reportType.findMany({
        where: { isActive: true, ...(filter.reportTypeId ? { id: filter.reportTypeId } : {}) },
        select: { id: true },
      }),
    ]);

    const activeLabIds = new Set(labs.map((l) => l.id));

    // Expected labs per report type, resolved from requirements (null lab = all active).
    const labsByType = new Map<string, Set<string>>();
    for (const req of requirements) {
      let set = labsByType.get(req.reportTypeId);
      if (!set) {
        set = new Set<string>();
        labsByType.set(req.reportTypeId, set);
      }
      if (req.laboratoryId) {
        if (activeLabIds.has(req.laboratoryId)) set.add(req.laboratoryId);
      } else {
        for (const id of activeLabIds) set.add(id);
      }
    }

    // One submission per (reportType, lab, period); index it for lookup.
    const subByKey = new Map<string, { id: string; status: ReportStatus }>();
    for (const s of submissions) {
      subByKey.set(slotKey(s.reportTypeId, s.laboratoryId, s.reportingPeriodId), {
        id: s.id,
        status: s.status as ReportStatus,
      });
    }

    return { labs, labsByType, periods, subByKey, submissions, reportTypesCount: reportTypes.length };
  }
}

/** Composite key for the one submission that can exist per (reportType, lab, period). */
function slotKey(reportTypeId: string, laboratoryId: string, periodId: string): string {
  return `${reportTypeId}|${laboratoryId}|${periodId}`;
}

function emptyCounts(): MutableCounts {
  return {
    expected: 0,
    submitted: 0,
    pendingReview: 0,
    approved: 0,
    revisionRequired: 0,
    overdue: 0,
    pending: 0,
    draft: 0,
  };
}

/**
 * Classify a single expected slot into the running tallies.
 * `status` is the matching submission's status, or null when none exists.
 */
function classify(acc: MutableCounts, status: ReportStatus | null, pastDue: boolean): void {
  acc.expected += 1;

  const isDraft = status === ReportStatus.DRAFT;
  const notSubmitted = status === null || isDraft;

  if (isDraft) acc.draft += 1;

  if (notSubmitted) {
    if (pastDue) acc.overdue += 1;
    else acc.pending += 1;
    return;
  }

  // Exists and has been submitted at least once.
  if (SUBMITTED_STATUSES.has(status)) acc.submitted += 1;
  if (PENDING_REVIEW_STATUSES.has(status)) acc.pendingReview += 1;
  if (status === ReportStatus.APPROVED) acc.approved += 1;
  if (status === ReportStatus.REVISION_REQUIRED) acc.revisionRequired += 1;
}

/** Freeze mutable tallies into the public shape, adding the derived rate. */
function finalize(c: MutableCounts): ComplianceCounts {
  return {
    ...c,
    complianceRate: c.expected > 0 ? c.submitted / c.expected : 0,
  };
}
