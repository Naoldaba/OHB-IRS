import { Module } from '@nestjs/common';
import { ReportTypesService } from './report-types.service';
import { ReportTypesController } from './report-types.controller';

@Module({
  providers: [ReportTypesService],
  controllers: [ReportTypesController],
  exports: [ReportTypesService],
})
export class ReportTypesModule {}
