import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditAction,
  buildFieldCatalog,
  EvaluableRule,
  evaluate,
  FieldSchema,
  ReportDefinitionStatus,
  validateRules,
} from '@ohb/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { coerceFieldSchema, toEvaluableRule } from '../common/report-definition';
import { CreateRuleDto, TestRulesDto, UpdateRuleDto, ValidateRulesDto } from './dto';

/**
 * Business-rule authoring for a report-definition version (IMPLEMENTATION_PLAN
 * §6.5–§6.7). Rules are editable only while their version is DRAFT; the config
 * validator (shared) guards every mutation so the engine only ever sees
 * well-formed, bounded, acyclic rules. Dry-run testing persists nothing.
 * BUREAU_ADMIN only (enforced by the controller guard).
 */
@Injectable()
export class RulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---- Field catalog --------------------------------------------------------

  async fields(reportTypeId: string, versionId: string) {
    const { schema } = await this.loadVersion(reportTypeId, versionId);
    return buildFieldCatalog(schema);
  }

  // ---- Rule CRUD ------------------------------------------------------------

  async list(reportTypeId: string, versionId: string) {
    await this.loadVersion(reportTypeId, versionId);
    return this.prisma.businessRule.findMany({
      where: { definitionVersionId: versionId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(reportTypeId: string, versionId: string, dto: CreateRuleDto, actorId: string) {
    const { version, schema } = await this.loadDraftVersion(reportTypeId, versionId);

    const existing = await this.evaluableRules(versionId);
    const candidate: EvaluableRule = this.dtoToEvaluable(dto);
    // Validate the whole resulting set so cross-rule cycles are caught.
    this.assertValidRules(schema, [...existing, candidate]);

    try {
      const created = await this.prisma.businessRule.create({
        data: {
          definitionVersionId: version.id,
          key: dto.key,
          name: dto.name,
          description: dto.description,
          kind: dto.kind,
          severity: dto.severity ?? null,
          condition: (dto.condition ?? {}) as Prisma.InputJsonValue,
          action: dto.action as Prisma.InputJsonValue,
          enabled: dto.enabled ?? true,
          order: dto.order ?? existing.length,
          templateId: dto.templateId,
        },
      });
      await this.audit.record({
        action: AuditAction.RULE_CREATED,
        actorId,
        entityType: 'BusinessRule',
        entityId: created.id,
        metadata: { versionId, key: dto.key, kind: dto.kind },
      });
      return created;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`A rule with key "${dto.key}" already exists on this version`);
      }
      throw e;
    }
  }

  async update(reportTypeId: string, versionId: string, ruleId: string, dto: UpdateRuleDto, actorId: string) {
    const { schema } = await this.loadDraftVersion(reportTypeId, versionId);
    const rule = await this.requireRule(versionId, ruleId);

    // Merge the patch onto the persisted row, then re-validate the full set with
    // this rule replaced so cross-rule cycles/refs stay sound.
    const merged = toEvaluableRule({
      key: rule.key,
      name: dto.name ?? rule.name,
      kind: dto.kind ?? rule.kind,
      severity: dto.severity !== undefined ? dto.severity : rule.severity,
      condition: (dto.condition ?? rule.condition) as Prisma.JsonValue,
      action: (dto.action ?? rule.action) as Prisma.JsonValue,
      enabled: dto.enabled ?? rule.enabled,
      order: dto.order ?? rule.order,
    });
    const others = (await this.evaluableRules(versionId)).filter((r) => r.key !== rule.key);
    this.assertValidRules(schema, [...others, merged]);

    const updated = await this.prisma.businessRule.update({
      where: { id: ruleId },
      data: {
        name: dto.name,
        description: dto.description,
        kind: dto.kind,
        severity: dto.severity,
        condition: dto.condition as Prisma.InputJsonValue | undefined,
        action: dto.action as Prisma.InputJsonValue | undefined,
        enabled: dto.enabled,
        order: dto.order,
      },
    });
    await this.audit.record({
      action: AuditAction.RULE_UPDATED,
      actorId,
      entityType: 'BusinessRule',
      entityId: ruleId,
      metadata: { versionId },
    });
    return updated;
  }

  async remove(reportTypeId: string, versionId: string, ruleId: string, actorId: string) {
    await this.loadDraftVersion(reportTypeId, versionId);
    await this.requireRule(versionId, ruleId);
    await this.prisma.businessRule.delete({ where: { id: ruleId } });
    await this.audit.record({
      action: AuditAction.RULE_DELETED,
      actorId,
      entityType: 'BusinessRule',
      entityId: ruleId,
      metadata: { versionId },
    });
    return { ok: true };
  }

  // ---- Config validation & dry-run -----------------------------------------

  /** Validate the persisted rules (or a supplied draft set) against the schema. */
  async validate(reportTypeId: string, versionId: string, dto: ValidateRulesDto) {
    const { schema } = await this.loadVersion(reportTypeId, versionId);
    const rules = dto.rules
      ? (dto.rules as unknown as EvaluableRule[])
      : await this.evaluableRules(versionId);
    return validateRules(schema, rules);
  }

  /** Dry-run: evaluate rules against sample data. Nothing is persisted. */
  async test(reportTypeId: string, versionId: string, dto: TestRulesDto) {
    const { schema } = await this.loadVersion(reportTypeId, versionId);
    const rules = dto.rules
      ? (dto.rules as unknown as EvaluableRule[])
      : await this.evaluableRules(versionId);

    // Surface config problems first so a dry-run against a broken rule set is clear.
    const config = validateRules(schema, rules);
    const result = evaluate(schema, rules, dto.data);
    return { config, ...result };
  }

  // ---- Internals ------------------------------------------------------------

  private dtoToEvaluable(dto: CreateRuleDto): EvaluableRule {
    return toEvaluableRule({
      key: dto.key,
      name: dto.name,
      kind: dto.kind,
      severity: dto.severity ?? null,
      condition: (dto.condition ?? {}) as Prisma.JsonValue,
      action: (dto.action ?? {}) as Prisma.JsonValue,
      enabled: dto.enabled ?? true,
      order: dto.order ?? 0,
    });
  }

  private assertValidRules(schema: FieldSchema, rules: EvaluableRule[]): void {
    const result = validateRules(schema, rules);
    if (!result.ok) {
      throw new BadRequestException({ message: 'Invalid business rules', errors: result.errors });
    }
  }

  private async evaluableRules(versionId: string): Promise<EvaluableRule[]> {
    const rows = await this.prisma.businessRule.findMany({
      where: { definitionVersionId: versionId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toEvaluableRule);
  }

  private async requireRule(versionId: string, ruleId: string) {
    const rule = await this.prisma.businessRule.findFirst({
      where: { id: ruleId, definitionVersionId: versionId },
    });
    if (!rule) throw new NotFoundException('Rule not found on this version');
    return rule;
  }

  /** Load a version (any status) and its usable schema. */
  private async loadVersion(reportTypeId: string, versionId: string) {
    const version = await this.prisma.reportDefinitionVersion.findFirst({
      where: { id: versionId, reportTypeId },
    });
    if (!version) throw new NotFoundException('Definition version not found');
    const schema = coerceFieldSchema(version.fieldSchema);
    if (!schema) {
      throw new BadRequestException('This definition version has no usable field schema yet');
    }
    return { version, schema };
  }

  /** Load a version that must be DRAFT (rules are frozen once published). */
  private async loadDraftVersion(reportTypeId: string, versionId: string) {
    const loaded = await this.loadVersion(reportTypeId, versionId);
    if (loaded.version.status !== ReportDefinitionStatus.DRAFT) {
      throw new ConflictException('Rules can only be changed while the version is a DRAFT');
    }
    return loaded;
  }
}
