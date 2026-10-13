import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, RequireCapability } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { ReportingPeriodsService } from './reporting-periods.service';
import { CreateReportingPeriodDto, UpdateReportingPeriodDto } from './dto';

/**
 * Reporting periods. Listing/reading is open to any authenticated user (labs
 * pick a period to report against); create/update/delete are BUREAU_ADMIN-only.
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
  @RequireCapability('manage_periods')
  create(@Body() dto: CreateReportingPeriodDto, @CurrentUser() user: AuthUser) {
    return this.periods.create(dto, user.id);
  }

  @Patch(':id')
  @RequireCapability('manage_periods')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateReportingPeriodDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.periods.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequireCapability('manage_periods')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.periods.remove(id, user.id);
  }
}
