import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditAction,
  ReportDefinitionStatus,
  SchemaSource,
  validateFieldSchema,
  validateRules,
} from '@ohb/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { coerceFieldSchema, toEvaluableRule } from '../common/report-definition';
import { CreateDefinitionVersionDto, UpdateSchemaDto } from './dto';

/**
 * Report-definition versioning. A report type's field structure is captured as
 * an immutable-once-published version; submissions pin the version they were
 * created under so history stays interpretable. (IMPLEMENTATION_PLAN §3, §6.2.)
 */
@Injectable()
export class DefinitionVersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForType(reportTypeId: string) {
    await this.requireReportType(reportTypeId);
    return this.prisma.reportDefinitionVersion.findMany({
      where: { reportTypeId },
      orderBy: { version: 'desc' },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        publishedBy: { select: { id: true, fullName: true } },
        _count: { select: { submissions: true, rules: true } },
      },
    });
  }

  async get(reportTypeId: string, versionId: string) {
    const version = await this.prisma.reportDefinitionVersion.findFirst({
      where: { id: versionId, reportTypeId },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        publishedBy: { select: { id: true, fullName: true } },
      },
    });
    if (!version) throw new NotFoundException('Definition version not found');
    return version;
  }

  /** The single active (PUBLISHED) version for a report type, if any. */
  activePublished(reportTypeId: string) {
    return this.prisma.reportDefinitionVersion.findFirst({
      where: { reportTypeId, status: ReportDefinitionStatus.PUBLISHED },
    });
  }

  async create(reportTypeId: string, dto: CreateDefinitionVersionDto, actorId: string) {
    await this.requireReportType(reportTypeId);

    // Resolve a clone source. A cross-type clone (Phase 19) takes precedence over
    // the same-type clone and may reference a version of any report type.
    let source: { id: string; fieldSchema: Prisma.JsonValue } | null = null;
    if (dto.cloneFromDefinitionVersionId) {
      source = await this.getAnyType(dto.cloneFromDefinitionVersionId);
    } else if (dto.cloneFromVersionId) {
      source = await this.get(reportTypeId, dto.cloneFromVersionId);
    }

    let fieldSchema: Prisma.InputJsonValue = source
      ? (source.fieldSchema as Prisma.InputJsonValue)
      : {};
    // An explicit schema overrides a clone source — and then we do not carry the
    // source's rules over, since they reference the cloned structure.
    const schemaOverridden = !!dto.fieldSchema;
    if (dto.fieldSchema) {
      this.assertValidSchema(dto.fieldSchema);
      fieldSchema = dto.fieldSchema as Prisma.InputJsonValue;
    }
    const copyRules = !!source && !schemaOverridden;

    // Next version number for this report type.
    const last = await this.prisma.reportDefinitionVersion.findFirst({
      where: { reportTypeId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (last?.version ?? 0) + 1;

    const created = await this.prisma.reportDefinitionVersion.create({
      data: {
        reportTypeId,
        version,
        status: ReportDefinitionStatus.DRAFT,
        schemaSource: SchemaSource.CONFIGURED,
        fieldSchema,
        createdById: actorId,
      },
    });

    // Copy the source version's business rules into the new draft (editable).
    let copiedRules = 0;
    if (copyRules && source) {
      copiedRules = await this.copyRules(source.id, created.id);
    }

    await this.audit.record({
      action: AuditAction.DEFINITION_VERSION_CREATED,
      actorId,
      entityType: 'ReportDefinitionVersion',
      entityId: created.id,
      metadata: {
        reportTypeId,
        version,
        ...(source ? { clonedFromVersionId: source.id, copiedRules } : {}),
        ...(dto.cloneFromDefinitionVersionId ? { crossReportType: true } : {}),
      },
    });
    return created;
  }

  /** Load a definition version by id regardless of its report type (for cross-type clone). */
  private async getAnyType(versionId: string) {
    const version = await this.prisma.reportDefinitionVersion.findUnique({
      where: { id: versionId },
      select: { id: true, fieldSchema: true },
    });
    if (!version) throw new NotFoundException('Source definition version not found');
    return version;
  }

  /** Duplicate every business rule from one version onto another. Returns the count. */
  private async copyRules(fromVersionId: string, toVersionId: string): Promise<number> {
    const rules = await this.prisma.businessRule.findMany({
      where: { definitionVersionId: fromVersionId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    if (rules.length === 0) return 0;
    await this.prisma.businessRule.createMany({
      data: rules.map((r) => ({
        definitionVersionId: toVersionId,
        key: r.key,
        name: r.name,
        description: r.description,
        kind: r.kind,
        severity: r.severity,
        condition: r.condition as Prisma.InputJsonValue,
        action: r.action as Prisma.InputJsonValue,
        enabled: r.enabled,
        order: r.order,
        templateId: r.templateId,
      })),
    });
    return rules.length;
  }

  async updateSchema(
    reportTypeId: string,
    versionId: string,
    dto: UpdateSchemaDto,
    actorId: string,
  ) {
    const version = await this.get(reportTypeId, versionId);
    if (version.status !== ReportDefinitionStatus.DRAFT) {
      throw new ConflictException('Only a DRAFT version can be edited');
    }
    this.assertValidSchema(dto.fieldSchema);
    const updated = await this.prisma.reportDefinitionVersion.update({
      where: { id: versionId },
      data: { fieldSchema: dto.fieldSchema as Prisma.InputJsonValue },
    });
    await this.audit.record({
      action: AuditAction.DEFINITION_VERSION_CREATED, // schema authoring on an existing draft
      actorId,
      entityType: 'ReportDefinitionVersion',
      entityId: versionId,
      metadata: { reportTypeId, edited: 'schema' },
    });
    return updated;
  }

  async publish(reportTypeId: string, versionId: string, actorId: string) {
    const version = await this.get(reportTypeId, versionId);
    if (version.status !== ReportDefinitionStatus.DRAFT) {
      throw new ConflictException('Only a DRAFT version can be published');
    }
    this.assertValidSchema(version.fieldSchema);
    await this.assertValidRules(versionId, version.fieldSchema);

    // Archive the current active version and publish this one atomically so a
    // report type never has two active published versions.
    const published = await this.prisma.$transaction(async (tx) => {
      await tx.reportDefinitionVersion.updateMany({
        where: { reportTypeId, status: ReportDefinitionStatus.PUBLISHED },
        data: { status: ReportDefinitionStatus.ARCHIVED },
      });
      return tx.reportDefinitionVersion.update({
        where: { id: versionId },
        data: {
          status: ReportDefinitionStatus.PUBLISHED,
          publishedById: actorId,
          publishedAt: new Date(),
        },
      });
    });
    await this.audit.record({
      action: AuditAction.DEFINITION_VERSION_PUBLISHED,
      actorId,
      entityType: 'ReportDefinitionVersion',
      entityId: versionId,
      metadata: { reportTypeId, version: version.version },
    });
    return published;
  }

  private assertValidSchema(schema: unknown): void {
    const result = validateFieldSchema(schema);
    if (!result.ok) {
      throw new BadRequestException({
        message: 'Invalid field schema',
        errors: result.errors,
      });
    }
  }

  /**
   * Publishing freezes the rules, so the whole set must be sound first: valid
   * field refs/operators and — crucially — no dependency cycles (§6.8). This is
   * the last line of defence; cycles are rejected here, never at submit time.
   */
  private async assertValidRules(versionId: string, fieldSchema: unknown): Promise<void> {
    const schema = coerceFieldSchema(fieldSchema as never);
    if (!schema) return; // schema validity already asserted separately
    const rows = await this.prisma.businessRule.findMany({
      where: { definitionVersionId: versionId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    if (rows.length === 0) return;
    const result = validateRules(schema, rows.map(toEvaluableRule));
    if (!result.ok) {
      throw new BadRequestException({
        message: 'Cannot publish: the attached business rules are invalid',
        errors: result.errors,
      });
    }
  }

  private async requireReportType(reportTypeId: string) {
    const reportType = await this.prisma.reportType.findUnique({ where: { id: reportTypeId } });
    if (!reportType) throw new NotFoundException('Report type not found');
    return reportType;
  }
}
