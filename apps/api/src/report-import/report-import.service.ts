import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { AuditAction, type ReportImportResult } from '@ohb/shared';
import { AuditService } from '../audit/audit.service';
import { extractGrid } from './grid';
import { boundingRegion, parseGridToReport } from './parse';

/**
 * Parses an uploaded `.xlsx` into a candidate report schema (Phase 23). This is
 * a *preview*: it persists nothing. The admin reviews/corrects the result in the
 * builder and saves it through the existing `PATCH …/schema` draft path, where
 * the authoritative `validateFieldSchema` + publish gate apply.
 */
@Injectable()
export class ReportImportService {
  constructor(private readonly audit: AuditService) {}

  async parse(
    file: Express.Multer.File | undefined,
    actorId: string,
  ): Promise<ReportImportResult> {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('No file was uploaded.');
    }

    const wb = new ExcelJS.Workbook();
    try {
      // Cast around the @types/node generic-Buffer vs exceljs Buffer mismatch.
      await wb.xlsx.load(file.buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
    } catch {
      throw new BadRequestException(
        'Could not read the file as an Excel workbook (.xlsx). Please upload a valid spreadsheet.',
      );
    }

    const sheets = wb.worksheets.filter((ws) => ws.rowCount > 0 && ws.columnCount > 0);
    if (sheets.length === 0) {
      throw new BadRequestException('The workbook has no sheets with any data.');
    }

    // Use the sheet with the most filled cells; note the rest were ignored.
    const chosen = sheets
      .map((ws) => ({ ws, filled: countFilled(ws) }))
      .sort((a, b) => b.filled - a.filled)[0].ws;

    const grid = extractGrid(chosen);
    if (!boundingRegion(grid)) {
      throw new BadRequestException(`Sheet "${chosen.name}" appears to be empty.`);
    }

    const result = parseGridToReport(grid);
    result.summary.sheetName = chosen.name;
    if (sheets.length > 1) {
      result.summary.skipped.push({
        message: `Only the sheet "${chosen.name}" was imported; ${sheets.length - 1} other sheet(s) were ignored.`,
      });
    }

    await this.audit.record({
      action: AuditAction.REPORT_DEFINITION_IMPORTED,
      actorId,
      entityType: 'ReportDefinitionImport',
      metadata: {
        fileName: file.originalname,
        sheetName: chosen.name,
        detectedLayout: result.summary.detectedLayout,
        confidence: result.summary.confidence,
      },
    });

    return result;
  }
}

function countFilled(ws: ExcelJS.Worksheet): number {
  let n = 0;
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.value !== null && cell.value !== undefined && cell.value !== '') n += 1;
    });
  });
  return n;
}
