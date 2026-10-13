import { Controller, Get, Query } from '@nestjs/common';
import { RequireCapability } from '../common/decorators';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@RequireCapability('view_audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 100;
    return this.audit.list(Number.isFinite(parsed) ? parsed : 100);
  }
}
