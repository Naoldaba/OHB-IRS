import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { AuditAction, type ReportImportResult } from '@ohb/shared';
import { AuditService } from '../audit/audit.service';
import { AI, AiProvider } from '../ai/ai.provider';
import { extractGrid } from './grid';
import { boundingRegion, parseGridToReport } from './parse';
import { applyAiRefinement, buildRefineRequest } from './ai-refine';

/**
 * Parses an uploaded `.xlsx` into a candidate report schema (Phase 23). This is
 * a *preview*: it persists nothing. The admin reviews/corrects the result in the
 * builder and saves it through the existing `PATCH …/schema` draft path, where
 * the authoritative `validateFieldSchema` + publish gate apply.
 *
 * Phase 29 adds an **optional** LLM refinement pass (`assist=ai`): structure and
 * labels only are sent to the configured AI provider (never report data), and
 * its suggestions are merged onto the heuristic schema. It is best-effort — any
 * failure leaves the heuristic result untouched.
 */
@Injectable()
export class ReportImportService {
  private readonly logger = new Logger(ReportImportService.name);

  constructor(
    private readonly audit: AuditService,
    @Inject(AI) private readonly ai: AiProvider,
  ) {}

  /** Whether AI assist is configured (drives the "Assist with AI" toggle). */
  aiAvailable(): boolean {
    return this.ai.enabled;
  }

  async parse(
    file: Express.Multer.File | undefined,
    actorId: string,
    assistWithAi = false,
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

    // Optional AI refinement (Phase 29). Best-effort and structure-only: on any
    // failure we keep the heuristic result untouched.
    let aiRan = false;
    if (assistWithAi && this.ai.enabled) {
      aiRan = await this.refineWithAi(result);
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
        aiAssisted: aiRan,
        aiDriver: aiRan ? this.ai.driver : undefined,
      },
    });

    return result;
  }

  /**
   * Run the LLM refinement in place on `result`. Returns whether AI actually
   * ran (so the audit reflects it). Swallows every error — an AI failure must
   * never turn a successful import into a failed one.
   */
  private async refineWithAi(result: ReportImportResult): Promise<boolean> {
    try {
      const req = buildRefineRequest(result.schema, 4096);
      const raw = await this.ai.generateJson(req);
      if (raw == null) {
        result.summary.aiAssisted = true;
        result.summary.aiNotes = [
          { message: 'AI assist was requested but the model did not return a usable response; the heuristic import is shown.' },
        ];
        return true;
      }
      const refined = applyAiRefinement(result.schema, raw);
      result.schema = refined.schema;
      result.summary.aiAssisted = true;
      result.summary.aiSuggestions = refined.suggestions;
      result.summary.aiNotes = refined.notes;
      return true;
    } catch (err) {
      this.logger.warn(`AI refinement failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
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
