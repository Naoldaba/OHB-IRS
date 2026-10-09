import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { type ReportImportResult } from '@ohb/shared';
import { CurrentUser, RequireCapability } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { ReportImportService } from './report-import.service';

/** Max accepted upload for a definition import. */
const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Report-definition import (Phase 23). Requires `author_definitions` — it feeds
 * the admin Report Builder. Parse-only: returns a candidate schema + summary and
 * persists no version; the admin saves through the definition-version endpoints.
 */
@Controller('report-import')
@RequireCapability('author_definitions')
export class ReportImportController {
  constructor(private readonly importer: ReportImportService) {}

  @Post('parse')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: IMPORT_MAX_BYTES },
    }),
  )
  parse(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ): Promise<ReportImportResult> {
    return this.importer.parse(file, user.id);
  }
}
