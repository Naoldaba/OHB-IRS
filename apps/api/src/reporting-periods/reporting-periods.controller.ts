import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RoleName } from '@ohb/shared';
import { Roles } from '../common/decorators';
import { ReportingPeriodsService } from './reporting-periods.service';
import { CreateReportingPeriodDto } from './dto';

/**
 * Reporting periods. Listing/reading is open to any authenticated user (labs
 * pick a period to report against); creation is BUREAU_ADMIN-only.
 */
@Controller('reporting-periods')
export class ReportingPeriodsController {
  constructor(private readonly periods: ReportingPeriodsService) {}

  @Get()
  list(@Query('reportTypeId') reportTypeId?: string) {
    return this.periods.list(reportTypeId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.periods.get(id);
  }

  @Post()
  @Roles(RoleName.BUREAU_ADMIN)
  create(@Body() dto: CreateReportingPeriodDto) {
    return this.periods.create(dto);
  }
}
