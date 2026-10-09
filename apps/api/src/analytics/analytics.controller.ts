import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { RoleName } from '@ohb/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { AnalyticsService } from './analytics.service';
import { DashboardQueryDto } from './dto';

/**
 * Dashboards, compliance & analytics. The Bureau-wide view (Phase 8) is
 * BUREAU_ADMIN-only; the lab-scoped view (Phase 13) is for the lab head and is
 * forced to the signed-in user's own laboratory. The class default role is
 * BUREAU_ADMIN; the lab route overrides it with a handler-level @Roles.
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

  /**
   * The lab compliance dashboard (Phase 13). The laboratory scope is taken from
   * the authenticated user and can never be chosen by the client, so a lab head
   * can only ever read their own laboratory's compliance.
   */
  @Get('my-lab')
  @Roles(RoleName.REGIONAL_LAB_HEAD)
  myLab(@CurrentUser() user: AuthUser, @Query() query: DashboardQueryDto) {
    if (!user.laboratoryId) {
      throw new ForbiddenException('Your account is not assigned to a laboratory');
    }
    return this.analytics.dashboard({
      reportTypeId: query.reportTypeId,
      trendLimit: query.trendLimit,
      laboratoryId: user.laboratoryId,
    });
  }
}
