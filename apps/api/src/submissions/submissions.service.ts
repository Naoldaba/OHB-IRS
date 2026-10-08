import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditAction,
  FeedbackType,
  FieldSchema,
  ReportStatus,
  RoleName,
  WorkflowAction,
  buildRenderModel,
  canEditData,
  emptySubmissionData,
  transitionFor,
  validateSubmissionData,
} from '@ohb/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import {
  AddFeedbackDto,
  CreateSubmissionDto,
  ListSubmissionsQueryDto,
  RequestRevisionDto,
  UpdateSubmissionDataDto,
} from './dto';

const LIST_INCLUDE = {
  reportType: { select: { id: true, name: true, code: true } },
  laboratory: { select: { id: true, name: true, code: true } },
  reportingPeriod: { select: { id: true, label: true, year: true, periodNumber: true, dueDate: true } },
  definitionVersion: { select: { id: true, version: true } },
} satisfies Prisma.ReportSubmissionInclude;

/**
 * Report submission lifecycle — the single enforcement point for the workflow
 * state machine (CLAUDE.md), lab-scoped access, immutable version snapshots,
 * feedback and audit. Field data is validated against the pinned definition
 * version's schema by the shared validator (the authority).
 */
@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---- Queries --------------------------------------------------------------

  list(user: AuthUser, query: ListSubmissionsQueryDto) {
    const where: Prisma.ReportSubmissionWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.reportTypeId) where.reportTypeId = query.reportTypeId;

    if (user.role === RoleName.REGIONAL_LAB_HEAD) {
      // Labs only ever see their own laboratory's submissions, regardless of filters.
      where.laboratoryId = user.laboratoryId ?? '__none__';
    } else if (query.laboratoryId) {
      where.laboratoryId = query.laboratoryId;
    }

    return this.prisma.reportSubmission.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: LIST_INCLUDE,
    });
  }

  /** Full submission detail incl. the pinned schema and its render model. */
  async getDetail(id: string, user: AuthUser) {
    const submission = await this.prisma.reportSubmission.findUnique({
      where: { id },
      include: {
        ...LIST_INCLUDE,
        definitionVersion: { select: { id: true, version: true, status: true, fieldSchema: true } },
        feedback: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, fullName: true } } },
        },
        versions: { orderBy: { versionNumber: 'asc' } },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    this.assertAccess(submission, user);

    const schema = this.schemaFromVersion(submission.definitionVersion?.fieldSchema);
    return {
      ...submission,
      schema,
      renderModel: schema ? buildRenderModel(schema) : null,
    };
  }

  // ---- Lab: create & edit ---------------------------------------------------

  async create(user: AuthUser, dto: CreateSubmissionDto) {
    const laboratoryId = user.laboratoryId;
    if (!laboratoryId) {
      throw new BadRequestException('Only a laboratory user can create a submission');
    }

    const reportType = await this.prisma.reportType.findUnique({ where: { id: dto.reportTypeId } });
    if (!reportType) throw new BadRequestException('Report type not found');

    const period = await this.prisma.reportingPeriod.findUnique({
      where: { id: dto.reportingPeriodId },
    });
    if (!period || period.reportTypeId !== dto.reportTypeId) {
      throw new BadRequestException('Reporting period does not belong to this report type');
    }

    // A submission is pinned to the report type's currently active definition.
    const activeVersion = await this.prisma.reportDefinitionVersion.findFirst({
      where: { reportTypeId: dto.reportTypeId, status: 'PUBLISHED' },
    });
    if (!activeVersion) {
      throw new BadRequestException('This report type has no published definition to submit against');
    }
    const schema = this.schemaFromVersion(activeVersion.fieldSchema);
    if (!schema) throw new BadRequestException('The published definition has no usable schema');

    try {
      const created = await this.prisma.reportSubmission.create({
        data: {
          reportTypeId: dto.reportTypeId,
          laboratoryId,
          reportingPeriodId: dto.reportingPeriodId,
          status: ReportStatus.DRAFT,
          data: emptySubmissionData(schema) as Prisma.InputJsonValue,
          definitionVersionId: activeVersion.id,
          createdById: user.id,
        },
        include: LIST_INCLUDE,
      });
      await this.audit.record({
        action: AuditAction.REPORT_CREATED,
        actorId: user.id,
        entityType: 'ReportSubmission',
        entityId: created.id,
        metadata: { reportTypeId: dto.reportTypeId, laboratoryId, periodId: dto.reportingPeriodId },
      });
      return created;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(
          'A submission for this report type, laboratory and period already exists',
        );
      }
      throw e;
    }
  }

  /** Save draft data. Non-blocking validation; returns diagnostics for UX. */
  async updateData(id: string, user: AuthUser, dto: UpdateSubmissionDataDto) {
    const submission = await this.loadForLab(id, user);
    if (!canEditData(submission.status as ReportStatus)) {
      throw new ConflictException(
        `Data can only be edited while the report is a draft or awaiting revision (current: ${submission.status})`,
      );
    }
    const schema = await this.requireSchema(submission.definitionVersionId);
    const result = validateSubmissionData(schema, dto.data, { requireComplete: false });

    const updated = await this.prisma.reportSubmission.update({
      where: { id },
      data: { data: result.normalized as Prisma.InputJsonValue },
      include: LIST_INCLUDE,
    });
    await this.audit.record({
      action: AuditAction.REPORT_UPDATED,
      actorId: user.id,
      entityType: 'ReportSubmission',
      entityId: id,
    });
    return { submission: updated, validation: { ok: result.ok, errors: result.errors } };
  }

  submit(id: string, user: AuthUser) {
    return this.runLabTransition(id, user, 'submit');
  }

  resubmit(id: string, user: AuthUser) {
    return this.runLabTransition(id, user, 'resubmit');
  }

  // ---- Admin: review --------------------------------------------------------

  async startReview(id: string, user: AuthUser) {
    const submission = await this.load(id);
    return this.transition(submission, 'startReview', user);
  }

  async requestRevision(id: string, user: AuthUser, dto: RequestRevisionDto) {
    const submission = await this.load(id);
    // Record the revision request as anchored feedback, then transition.
    await this.prisma.feedback.create({
      data: {
        submissionId: id,
        authorId: user.id,
        type: FeedbackType.REVISION_REQUEST,
        message: dto.message,
        sectionKey: dto.sectionKey,
        fieldKey: dto.fieldKey,
      },
    });
    return this.transition(submission, 'requestRevision', user, {
      metadata: { message: dto.message },
    });
  }

  async approve(id: string, user: AuthUser) {
    const submission = await this.load(id);
    return this.transition(submission, 'approve', user);
  }

  // ---- Feedback -------------------------------------------------------------

  async addFeedback(id: string, user: AuthUser, dto: AddFeedbackDto) {
    const submission = await this.load(id);
    const feedback = await this.prisma.feedback.create({
      data: {
        submissionId: submission.id,
        authorId: user.id,
        type: dto.type ?? FeedbackType.COMMENT,
        message: dto.message,
        sectionKey: dto.sectionKey,
        fieldKey: dto.fieldKey,
      },
      include: { author: { select: { id: true, fullName: true } } },
    });
    await this.audit.record({
      action: AuditAction.REPORT_FEEDBACK_ADDED,
      actorId: user.id,
      entityType: 'ReportSubmission',
      entityId: submission.id,
      metadata: { feedbackId: feedback.id, type: feedback.type },
    });
    return feedback;
  }

  async listFeedback(id: string, user: AuthUser) {
    const submission = await this.load(id);
    this.assertAccess(submission, user);
    return this.prisma.feedback.findMany({
      where: { submissionId: id },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, fullName: true } } },
    });
  }

  async listVersions(id: string, user: AuthUser) {
    const submission = await this.load(id);
    this.assertAccess(submission, user);
    return this.prisma.submissionVersion.findMany({
      where: { submissionId: id },
      orderBy: { versionNumber: 'asc' },
      include: { submittedBy: { select: { id: true, fullName: true } } },
    });
  }

  // ---- Internals ------------------------------------------------------------

  private async runLabTransition(id: string, user: AuthUser, action: Extract<WorkflowAction, 'submit' | 'resubmit'>) {
    const submission = await this.loadForLab(id, user);
    const schema = await this.requireSchema(submission.definitionVersionId);
    // Authoritative, complete validation. Store the recomputed normalized data.
    const result = validateSubmissionData(schema, submission.data, { requireComplete: true });
    if (!result.ok) {
      throw new UnprocessableEntityException({
        message: 'Report is incomplete or invalid',
        errors: result.errors,
      });
    }
    return this.transition(submission, action, user, { normalizedData: result.normalized });
  }

  /**
   * The single workflow transition primitive: validates the state change, writes
   * status + timestamps, snapshots an immutable SubmissionVersion when the action
   * requires it, and records the audit entry — all atomically.
   */
  private async transition(
    submission: Prisma.ReportSubmissionGetPayload<object>,
    action: WorkflowAction,
    user: AuthUser,
    opts: { normalizedData?: Record<string, unknown>; metadata?: Record<string, unknown> } = {},
  ) {
    const def = transitionFor(action);
    const current = submission.status as ReportStatus;
    if (!def.from.includes(current)) {
      throw new ConflictException(
        `Cannot ${action} a report in status ${current} (allowed from: ${def.from.join(', ')})`,
      );
    }

    const now = new Date();
    const data: Prisma.ReportSubmissionUpdateInput = { status: def.to };
    if (action === 'submit' || action === 'resubmit') {
      data.submittedAt = now;
      data.submittedBy = { connect: { id: user.id } };
      if (opts.normalizedData) data.data = opts.normalizedData as Prisma.InputJsonValue;
    }
    if (action === 'approve') {
      data.reviewedAt = now;
      data.reviewedBy = { connect: { id: user.id } };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextVersionNumber = submission.currentVersion + 1;
      if (def.snapshots) {
        data.currentVersion = nextVersionNumber;
      }
      const result = await tx.reportSubmission.update({
        where: { id: submission.id },
        data,
        include: LIST_INCLUDE,
      });
      if (def.snapshots) {
        // Immutable snapshot of exactly what was submitted. Never overwritten.
        await tx.submissionVersion.create({
          data: {
            submissionId: submission.id,
            versionNumber: nextVersionNumber,
            data: result.data as Prisma.InputJsonValue,
            status: def.to,
            submittedById: user.id,
          },
        });
      }
      return result;
    });

    await this.audit.record({
      action: AUDIT_FOR_ACTION[action],
      actorId: user.id,
      entityType: 'ReportSubmission',
      entityId: submission.id,
      metadata: { from: current, to: def.to, ...opts.metadata },
    });
    return updated;
  }

  private async load(id: string) {
    const submission = await this.prisma.reportSubmission.findUnique({ where: { id } });
    if (!submission) throw new NotFoundException('Submission not found');
    return submission;
  }

  /** Load a submission a lab user owns; rejects cross-lab and admin-only paths. */
  private async loadForLab(id: string, user: AuthUser) {
    const submission = await this.load(id);
    if (user.role !== RoleName.REGIONAL_LAB_HEAD || submission.laboratoryId !== user.laboratoryId) {
      throw new ForbiddenException('You can only act on your own laboratory\'s submissions');
    }
    return submission;
  }

  private assertAccess(submission: { laboratoryId: string }, user: AuthUser): void {
    if (user.role === RoleName.BUREAU_ADMIN) return;
    if (user.role === RoleName.REGIONAL_LAB_HEAD && submission.laboratoryId === user.laboratoryId) {
      return;
    }
    throw new ForbiddenException('You cannot access this submission');
  }

  private async requireSchema(definitionVersionId: string | null): Promise<FieldSchema> {
    if (!definitionVersionId) {
      throw new ConflictException('This submission is not pinned to a definition version');
    }
    const version = await this.prisma.reportDefinitionVersion.findUnique({
      where: { id: definitionVersionId },
      select: { fieldSchema: true },
    });
    const schema = this.schemaFromVersion(version?.fieldSchema);
    if (!schema) throw new ConflictException('The pinned definition version has no usable schema');
    return schema;
  }

  /** Narrows a jsonb field schema to a usable FieldSchema, or null if unusable. */
  private schemaFromVersion(fieldSchema: Prisma.JsonValue | null | undefined): FieldSchema | null {
    if (!fieldSchema || typeof fieldSchema !== 'object' || Array.isArray(fieldSchema)) return null;
    const layout = (fieldSchema as { layout?: unknown }).layout;
    if (layout !== 'simple' && layout !== 'matrix') return null;
    return fieldSchema as unknown as FieldSchema;
  }
}

const AUDIT_FOR_ACTION: Record<WorkflowAction, AuditAction> = {
  submit: AuditAction.REPORT_SUBMITTED,
  resubmit: AuditAction.REPORT_RESUBMITTED,
  startReview: AuditAction.REPORT_REVIEW_STARTED,
  requestRevision: AuditAction.REPORT_REVISION_REQUESTED,
  approve: AuditAction.REPORT_APPROVED,
};
