import { Module } from '@nestjs/common';
import { ExportService } from './export.service';

/**
 * Document export (Excel / DOCX / PDF). Exposes only the format-aware
 * ExportService; access scoping and audit live with the SubmissionsService that
 * consumes it.
 */
@Module({
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}
