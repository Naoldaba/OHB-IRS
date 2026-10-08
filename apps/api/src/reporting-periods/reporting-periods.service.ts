import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ETHIOPIAN_MONTHS,
  GregorianRange,
  PeriodType,
  ethiopianMonthRange,
  ethiopianQuarterRange,
  ethiopianYearRange,
} from '@ohb/shared';
import { uniqueConflict } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportingPeriodDto } from './dto';

@Injectable()
export class ReportingPeriodsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async create(dto: CreateReportingPeriodDto) {
    const reportType = await this.prisma.reportType.findUnique({ where: { id: dto.reportTypeId } });
    if (!reportType) throw new BadRequestException('Report type not found');

    this.assertPeriodNumber(dto.periodType, dto.periodNumber);
    const range = this.rangeFor(dto.periodType, dto.year, dto.periodNumber);
    const label = dto.label?.trim() || this.defaultLabel(dto.periodType, dto.year, dto.periodNumber);
    // Default due date: the day the period closes (first day after it ends).
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : range.endExclusive;

    try {
      return await this.prisma.reportingPeriod.create({
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
