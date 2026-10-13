import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  ETHIOPIAN_MONTHS,
  GregorianRange,
  PeriodType,
  ethiopianMonthRange,
  ethiopianQuarterRange,
  ethiopianYearRange,
} from '@ohb/shared';
import { uniqueConflict } from '../common/prisma-errors';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportingPeriodDto, UpdateReportingPeriodDto } from './dto';

@Injectable()
export class ReportingPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(reportTypeId?: string) {
    return this.prisma.reportingPeriod.findMany({
      where: reportTypeId ? { reportTypeId } : undefined,
      orderBy: [{ year: 'desc' }, { periodNumber: 'desc' }],
      include: { reportType: { select: { id: true, name: true, code: true } } },
    });
  }

  async get(id: string) {
    const period = await this.prisma.reportingPeriod.findUnique({
      where: { id },
      include: { reportType: { select: { id: true, name: true, code: true } } },
    });
    if (!period) throw new NotFoundException('Reporting period not found');
    return period;
  }

  async create(dto: CreateReportingPeriodDto, actorId?: string) {
    const reportType = await this.prisma.reportType.findUnique({ where: { id: dto.reportTypeId } });
    if (!reportType) throw new BadRequestException('Report type not found');

    this.assertPeriodNumber(dto.periodType, dto.periodNumber);
    const range = this.rangeFor(dto.periodType, dto.year, dto.periodNumber);
    const label = dto.label?.trim() || this.defaultLabel(dto.periodType, dto.year, dto.periodNumber);
    // Default due date: the day the period closes (first day after it ends).
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : range.endExclusive;

    let created;
    try {
      created = await this.prisma.reportingPeriod.create({
        data: {
          reportTypeId: dto.reportTypeId,
          periodType: dto.periodType,
          year: dto.year,
          periodNumber: dto.periodNumber,
          label,
          startDate: range.start,
          endDate: range.endExclusive,
          dueDate,
        },
      });
    } catch (e) {
      throw uniqueConflict(e, 'A reporting period for this report type, year and period already exists');
    }

    await this.audit.record({
      action: AuditAction.PERIOD_CREATED,
      actorId,
      entityType: 'ReportingPeriod',
      entityId: created.id,
      metadata: { reportTypeId: created.reportTypeId, label: created.label, year: created.year },
    });
    return created;
  }

  /**
   * Update a period. `label` and `dueDate` are always editable; the calendar
   * identity (periodType/year/periodNumber, which the date ranges derive from)
   * may only change while the period has **no submissions**, so historical data
   * is never silently re-dated.
   */
  async update(id: string, dto: UpdateReportingPeriodDto, actorId?: string) {
    const period = await this.prisma.reportingPeriod.findUnique({ where: { id } });
    if (!period) throw new NotFoundException('Reporting period not found');

    const periodType = (dto.periodType ?? period.periodType) as PeriodType;
    const year = dto.year ?? period.year;
    const periodNumber = dto.periodNumber ?? period.periodNumber;
    const identityChange =
      periodType !== period.periodType ||
      year !== period.year ||
      periodNumber !== period.periodNumber;

    if (identityChange) {
      const submissions = await this.prisma.reportSubmission.count({
        where: { reportingPeriodId: id },
      });
      if (submissions > 0) {
        throw new ConflictException(
          "This period's calendar identity can't be changed because reports have already been submitted against it. Edit the label or due date instead.",
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (identityChange) {
      this.assertPeriodNumber(periodType, periodNumber);
      const range = this.rangeFor(periodType, year, periodNumber);
      data.periodType = periodType;
      data.year = year;
      data.periodNumber = periodNumber;
      data.startDate = range.start;
      data.endDate = range.endExclusive;
      data.label = dto.label?.trim() || this.defaultLabel(periodType, year, periodNumber);
      data.dueDate = dto.dueDate ? new Date(dto.dueDate) : range.endExclusive;
    } else {
      if (dto.label !== undefined) data.label = dto.label.trim() || period.label;
      if (dto.dueDate !== undefined) data.dueDate = new Date(dto.dueDate);
    }

    let updated;
    try {
      updated = await this.prisma.reportingPeriod.update({ where: { id }, data });
    } catch (e) {
      throw uniqueConflict(e, 'A reporting period for this report type, year and period already exists');
    }

    await this.audit.record({
      action: AuditAction.PERIOD_UPDATED,
      actorId,
      entityType: 'ReportingPeriod',
      entityId: id,
      metadata: { changed: Object.keys(data), identityChange },
    });
    return updated;
  }

  /**
   * Delete a period, but only when nothing depends on it. A period that already
   * has submissions is part of the audit trail and is blocked (409). The
   * idempotency markers in `ReminderDispatch` (plain columns, regenerable) are
   * cleaned up in the same transaction.
   */
  async remove(id: string, actorId?: string) {
    const period = await this.prisma.reportingPeriod.findUnique({ where: { id } });
    if (!period) throw new NotFoundException('Reporting period not found');

    const submissions = await this.prisma.reportSubmission.count({
      where: { reportingPeriodId: id },
    });
    if (submissions > 0) {
      throw new ConflictException(
        `This period can't be deleted because ${submissions} report submission(s) are recorded against it.`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.reminderDispatch.deleteMany({ where: { reportingPeriodId: id } }),
      this.prisma.reportingPeriod.delete({ where: { id } }),
    ]);

    await this.audit.record({
      action: AuditAction.PERIOD_DELETED,
      actorId,
      entityType: 'ReportingPeriod',
      entityId: id,
      metadata: { reportTypeId: period.reportTypeId, label: period.label, year: period.year },
    });
    return { ok: true };
  }

  private assertPeriodNumber(periodType: PeriodType, periodNumber: number): void {
    const max = periodType === PeriodType.MONTHLY ? 13 : periodType === PeriodType.QUARTERLY ? 4 : 1;
    if (periodNumber < 1 || periodNumber > max) {
      throw new BadRequestException(
        `periodNumber must be between 1 and ${max} for a ${periodType} period`,
      );
    }
  }

  private rangeFor(periodType: PeriodType, year: number, periodNumber: number): GregorianRange {
    switch (periodType) {
      case PeriodType.MONTHLY:
        return ethiopianMonthRange(year, periodNumber);
      case PeriodType.QUARTERLY:
        return ethiopianQuarterRange(year, periodNumber);
      case PeriodType.YEARLY:
        return ethiopianYearRange(year);
    }
  }

  private defaultLabel(periodType: PeriodType, year: number, periodNumber: number): string {
    switch (periodType) {
      case PeriodType.MONTHLY:
        return `${ETHIOPIAN_MONTHS[periodNumber - 1]} ${year}`;
      case PeriodType.QUARTERLY:
        return `Q${periodNumber} ${year} (EC)`;
      case PeriodType.YEARLY:
        return `${year} (EC)`;
    }
  }
}
