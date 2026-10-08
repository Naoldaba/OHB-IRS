import { BadRequestException, Injectable } from '@nestjs/common';
import { buildExportDocModel, type BuildExportDocArgs } from './export-model';
import { renderXlsx } from './renderers/xlsx.renderer';
import { renderDocx } from './renderers/docx.renderer';
import { renderPdf } from './renderers/pdf.renderer';

export type ExportFormat = 'xlsx' | 'docx' | 'pdf';

export const EXPORT_FORMATS: ExportFormat[] = ['xlsx', 'docx', 'pdf'];

const CONTENT_TYPE: Record<ExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

export interface RenderedExport {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

/**
 * Turns a submission's shared render model + data into a downloadable document
 * in the requested format. The (matrix vs simple) branching lives in
 * `buildExportDocModel`; this service just picks the right renderer and names
 * the file. It is format-aware only — all access scoping is done by the caller
 * (SubmissionsService), which is the authority.
 */
@Injectable()
export class ExportService {
  async render(
    format: ExportFormat,
    baseName: string,
    args: BuildExportDocArgs,
  ): Promise<RenderedExport> {
    if (!EXPORT_FORMATS.includes(format)) {
      throw new BadRequestException(`Unsupported export format: ${format}`);
    }
    const model = buildExportDocModel(args);
    const buffer =
      format === 'xlsx'
        ? await renderXlsx(model)
        : format === 'docx'
          ? await renderDocx(model)
          : await renderPdf(model);
    return {
      buffer,
      contentType: CONTENT_TYPE[format],
      filename: `${sanitize(baseName)}.${format}`,
    };
  }
}

/** Conservative filename slug — safe across browsers and OSes. */
function sanitize(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'report';
}
