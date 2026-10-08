import { Module } from '@nestjs/common';
import { ReportingPeriodsService } from './reporting-periods.service';
import { ReportingPeriodsController } from './reporting-periods.controller';

@Module({
  providers: [ReportingPeriodsService],
  controllers: [ReportingPeriodsController],
  exports: [ReportingPeriodsService],
})
export class ReportingPeriodsModule {}
