import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { RoleName } from '@ohb/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { AnalyticsService } from './analytics.service';
import { DashboardExportQueryDto, DashboardQueryDto, ReviewSlaQueryDto } from './dto';
import { renderAnalyticsExport } from './analytics-export';

/**
 * Dashboards, compliance & analytics. The Bureau-wide view (Phase 8) is
 * BUREAU_ADMIN-only; the lab-scoped view (Phase 13) is for the lab head and is
 * forced to the signed-in user's own laboratory. The class default role is
 * BUREAU_ADMIN; the lab routes override it with a handler-level @Roles.
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

  /** Download the Bureau dashboard figures as CSV or XLSX (Phase 19). */
  @Get('dashboard/export')
  async exportDashboard(
    @Query() query: DashboardExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const data = await this.analytics.dashboard({
      reportTypeId: query.reportTypeId,
      trendLimit: query.trendLimit,
    });
    return stream(res, await renderAnalyticsExport(query.format ?? 'csv', 'bureau-compliance', data));
  }

  /**
   * Bureau review SLA / time-to-review (Phase 21). Bureau-wide accountability
   * metrics derived from the audit trail; BUREAU_ADMIN-only (class default).
   */
  @Get('review-sla')
  reviewSla(@Query() query: ReviewSlaQueryDto) {
    return this.analytics.reviewSla({ oldestLimit: query.oldestLimit });
  }

  /**
   * The lab compliance dashboard (Phase 13). The laboratory scope is taken from
   * the authenticated user and can never be chosen by the client, so a lab head
   * can only ever read their own laboratory's compliance.
   */
  @Get('my-lab')
  @Roles(RoleName.REGIONAL_LAB_HEAD)
  myLab(@CurrentUser() user: AuthUser, @Query() query: DashboardQueryDto) {
    return this.analytics.dashboard({
      reportTypeId: query.reportTypeId,
      trendLimit: query.trendLimit,
      laboratoryId: this.requireLab(user),
    });
  }

  /** Download the lab's own compliance figures (Phase 19), scoped server-side. */
  @Get('my-lab/export')
  @Roles(RoleName.REGIONAL_LAB_HEAD)
  async exportMyLab(
    @CurrentUser() user: AuthUser,
    @Query() query: DashboardExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const data = await this.analytics.dashboard({
      reportTypeId: query.reportTypeId,
      trendLimit: query.trendLimit,
      laboratoryId: this.requireLab(user),
    });
    return stream(res, await renderAnalyticsExport(query.format ?? 'csv', 'my-lab-compliance', data));
  }

  private requireLab(user: AuthUser): string {
    if (!user.laboratoryId) {
      throw new ForbiddenException('Your account is not assigned to a laboratory');
    }
    return user.laboratoryId;
  }
}

function stream(
  res: Response,
  file: { buffer: Buffer; contentType: string; filename: string },
): StreamableFile {
  res.set({
    'Content-Type': file.contentType,
    'Content-Disposition': `attachment; filename="${file.filename}"`,
    'Content-Length': String(file.buffer.length),
  });
  return new StreamableFile(file.buffer);
}
