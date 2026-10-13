import { Module } from '@nestjs/common';
import { ReportImportService } from './report-import.service';
import { ReportImportController } from './report-import.controller';

@Module({
  providers: [ReportImportService],
  controllers: [ReportImportController],
})
export class ReportImportModule {}
