import { Controller, Get, Query } from '@nestjs/common';
import { RoleName } from '@ohb/shared';
import { Roles } from '../common/decorators';
import { AnalyticsService } from './analytics.service';
import { DashboardQueryDto } from './dto';

/**
 * Bureau dashboards, compliance & analytics (Phase 8). Monitoring is a Bureau
 * concern, so this is BUREAU_ADMIN-only; lab users get 403 via RolesGuard.
 */
@Controller('analytics')
@Roles(RoleName.BUREAU_ADMIN)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  dashboard(@Query() query: DashboardQueryDto) {
    return this.analytics.dashboard({
      reportTypeId: query.reportTypeId,
      trendLimit: query.trendLimit,
    });
  }
}
