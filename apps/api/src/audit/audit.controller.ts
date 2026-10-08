import { Controller, Get, Query } from '@nestjs/common';
import { RoleName } from '@ohb/shared';
import { Roles } from '../common/decorators';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@Roles(RoleName.BUREAU_ADMIN)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 100;
    return this.audit.list(Number.isFinite(parsed) ? parsed : 100);
  }
}
