import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditAction,
  Diagnostic,
  EvaluableRule,
  FeedbackType,
  FieldSchema,
  ReportStatus,
  RoleName,
  RuleSeverity,
  WorkflowAction,
  buildRenderModel,
  canEditData,
  emptySubmissionData,
  evaluate,
  transitionFor,
  validateSubmissionData,
} from '@ohb/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/auth-user';
import { coerceFieldSchema, toEvaluableRule } from '../common/report-definition';
import { STORAGE, StorageProvider } from '../storage/storage.provider';
import {
  ExportService,
  type ExportFormat,
  type RenderedExport,
} from '../export/export.service';
import type { ExportMetaRow } from '../export/export-model';
import {
  AddFeedbackDto,
  CreateSubmissionDto,
  ListSubmissionsQueryDto,
  RequestRevisionDto,
  UpdateSubmissionDataDto,
  UploadAttachmentDto,
} from './dto';

/** Supporting-document types accepted as attachments, mapped to a file extension. */
const ATTACHMENT_MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'text/plain': 'txt',
};

/** Hard cap on a single attachment. Mirror this in the upload interceptor limit. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const ATTACHMENT_SELECT = {
  id: true,
  submissionId: true,
  sectionKey: true,
  fileName: true,
  mimeType: true,
  size: true,
  createdAt: true,
  uploadedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.AttachmentSelect;

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
    private readonly notifications: NotificationsService,
    private readonly exporter: ExportService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  // ---- Queries --------------------------------------------------------------

  async list(user: AuthUser, query: ListSubmissionsQueryDto) {
    const where: Prisma.ReportSubmissionWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.reportTypeId) where.reportTypeId = query.reportTypeId;

    if (user.role === RoleName.REGIONAL_LAB_HEAD) {
      // Labs only ever see their own laboratory's submissions, regardless of filters.
      where.laboratoryId = user.laboratoryId ?? '__none__';
    } else if (query.laboratoryId) {
      where.laboratoryId = query.laboratoryId;
    }

    const submissions = await this.prisma.reportSubmission.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: LIST_INCLUDE,
    });

    // Flagged-for-review filter: submissions carrying one or more FLAG-severity
    // rule outcomes (snapshotted at submit time). `flags` is jsonb, so this is a
    // post-filter rather than a DB predicate.
    if (query.flagged === 'true') {
      return submissions.filter((s) => Array.isArray(s.flags) && s.flags.length > 0);
    }
    return submissions;
  }

  /** Full submission detail incl. the pinned schema and its render model. */
  async getDetail(id: string, user: AuthUser) {
    const submission = await this.prisma.reportSubmission.findUnique({
      where: { id },
      include: {
        ...LIST_INCLUDE,
        definitionVersion: { select: { id: true, version: true, status: true, fieldSchema: true } },
        feedback: {
          where: { parentId: null },
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, fullName: true } },
            replies: {
              orderBy: { createdAt: 'asc' },
              include: { author: { select: { id: true, fullName: true } } },
            },
          },
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

  /**
   * Render a submission as a downloadable document (Excel / DOCX / PDF). Reads
   * the same pinned schema + render model the UI uses, so the export reflects
   * exactly what is stored. Access is scoped like any other read (admins any
   * lab; a lab head only its own). An optional `versionNumber` exports an
   * immutable historical snapshot instead of the current data. Audited.
   */
  async exportSubmission(
    id: string,
    user: AuthUser,
    format: ExportFormat,
    versionNumber?: number,
  ): Promise<RenderedExport> {
    const submission = await this.prisma.reportSubmission.findUnique({
      where: { id },
      include: {
        reportType: { select: { name: true, code: true } },
        laboratory: { select: { name: true, code: true } },
        reportingPeriod: { select: { label: true } },
        definitionVersion: { select: { version: true, fieldSchema: true } },
        submittedBy: { select: { fullName: true } },
        reviewedBy: { select: { fullName: true } },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    this.assertAccess(submission, user);

    const schema = this.schemaFromVersion(submission.definitionVersion?.fieldSchema);
    if (!schema) throw new ConflictException('This submission has no usable schema to export');
    const renderModel = buildRenderModel(schema);

    // Resolve the data to export: a pinned historical snapshot, or current data.
    let data = submission.data as Record<string, unknown>;
    let versionNote: string | undefined;
    if (versionNumber !== undefined) {
      const snapshot = await this.prisma.submissionVersion.findUnique({
        where: { submissionId_versionNumber: { submissionId: id, versionNumber } },
      });
      if (!snapshot) throw new NotFoundException(`Version ${versionNumber} not found for this submission`);
      data = snapshot.data as Record<string, unknown>;
      versionNote = `v${versionNumber} snapshot (${snapshot.status})`;
    }

    const meta: ExportMetaRow[] = [
      { label: 'Laboratory', value: labelWithCode(submission.laboratory?.name, submission.laboratory?.code) },
      { label: 'Report type', value: labelWithCode(submission.reportType?.name, submission.reportType?.code) },
      { label: 'Reporting period', value: submission.reportingPeriod?.label ?? '—' },
      { label: 'Status', value: formatEnum(submission.status) },
    ];
    if (submission.definitionVersion) {
      meta.push({ label: 'Definition version', value: `v${submission.definitionVersion.version}` });
    }
    if (versionNote) meta.push({ label: 'Export source', value: versionNote });
    if (submission.submittedAt) {
      meta.push({
        label: 'Submitted',
        value: `${formatDateTime(submission.submittedAt)}${
          submission.submittedBy ? ` by ${submission.submittedBy.fullName}` : ''
        }`,
      });
    }
    if (submission.reviewedAt) {
      meta.push({
        label: 'Reviewed',
        value: `${formatDateTime(submission.reviewedAt)}${
          submission.reviewedBy ? ` by ${submission.reviewedBy.fullName}` : ''
        }`,
      });
    }

    const flags = Array.isArray(submission.flags)
      ? (submission.flags as unknown as Diagnostic[])
      : [];

    const baseName = [
      submission.reportType?.code || submission.reportType?.name || 'report',
      submission.laboratory?.code || submission.laboratory?.name,
      submission.reportingPeriod?.label,
      versionNumber !== undefined ? `v${versionNumber}` : undefined,
    ]
      .filter(Boolean)
      .join('_');

    const rendered = await this.exporter.render(format, baseName, {
      title: submission.reportType?.name ?? 'Report',
      subtitle: [submission.laboratory?.name, submission.reportingPeriod?.label]
        .filter(Boolean)
        .join(' · '),
      meta,
      renderModel,
      data,
      flags,
      generatedBy: user.fullName,
    });

    await this.audit.record({
      action: AuditAction.REPORT_EXPORTED,
      actorId: user.id,
      entityType: 'ReportSubmission',
      entityId: id,
      metadata: { format, versionNumber: versionNumber ?? null },
    });
    return rendered;
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
    const { schema, rules } = await this.requireDefinition(submission.definitionVersionId);
    const result = validateSubmissionData(schema, dto.data, { requireComplete: false });

    // Non-blocking rule evaluation for UX: recompute calculated fields and
    // surface diagnostics/effects. Calculated (read-only) values are persisted
    // so the stored draft stays consistent; they are recomputed again on submit.
    const evaluation = evaluate(schema, rules, result.normalized);

    const updated = await this.prisma.reportSubmission.update({
      where: { id },
      data: { data: evaluation.values as Prisma.InputJsonValue },
      include: LIST_INCLUDE,
    });
    await this.audit.record({
      action: AuditAction.REPORT_UPDATED,
      actorId: user.id,
      entityType: 'ReportSubmission',
      entityId: id,
    });
    return {
      submission: updated,
      validation: { ok: result.ok, errors: result.errors },
      evaluation: {
        diagnostics: evaluation.diagnostics,
        effects: evaluation.effects,
        calculated: evaluation.calculated,
        flags: evaluation.flags,
      },
    };
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
    const updated = await this.transition(submission, 'startReview', user);
    await this.notifications.notifyReviewStarted(updated, user);
    return updated;
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
    const updated = await this.transition(submission, 'requestRevision', user, {
      metadata: { message: dto.message },
    });
    await this.notifications.notifyRevisionRequired(updated, user, dto.message);
    return updated;
  }

  async approve(id: string, user: AuthUser) {
    const submission = await this.load(id);
    const updated = await this.transition(submission, 'approve', user);
    await this.notifications.notifyApproved(updated, user);
    return updated;
  }

  // ---- Feedback -------------------------------------------------------------

  /**
   * Add feedback to a submission, or reply within an existing thread. Both
   * Bureau admins and the owning laboratory may comment (so a thread is a real
   * two-way conversation); only admins may raise a REVISION_REQUEST. When
   * replying, the anchor (section/field) is inherited from the thread root.
   */
  async addFeedback(id: string, user: AuthUser, dto: AddFeedbackDto) {
    const submission = await this.load(id);
    this.assertAccess(submission, user);

    // Labs can comment and reply, but never author a revision request.
    const type =
      user.role === RoleName.BUREAU_ADMIN
        ? dto.type ?? FeedbackType.COMMENT
        : FeedbackType.COMMENT;

    let sectionKey = dto.sectionKey;
    let fieldKey = dto.fieldKey;
    if (dto.parentId) {
      const parent = await this.prisma.feedback.findUnique({ where: { id: dto.parentId } });
      if (!parent || parent.submissionId !== submission.id) {
        throw new BadRequestException('Reply target does not belong to this submission');
      }
      if (parent.parentId) {
        // Keep threads one level deep: reply to the root, not to another reply.
        throw new BadRequestException('Replies can only be posted on a thread root');
      }
      // A reply inherits its root's anchor; it cannot re-anchor the thread.
      sectionKey = parent.sectionKey ?? undefined;
      fieldKey = parent.fieldKey ?? undefined;
    }

    const feedback = await this.prisma.feedback.create({
      data: {
        submissionId: submission.id,
        authorId: user.id,
        type,
        message: dto.message,
        sectionKey,
        fieldKey,
        parentId: dto.parentId,
      },
      include: { author: { select: { id: true, fullName: true } } },
    });
    await this.audit.record({
      action: AuditAction.REPORT_FEEDBACK_ADDED,
      actorId: user.id,
      entityType: 'ReportSubmission',
      entityId: submission.id,
      metadata: { feedbackId: feedback.id, type: feedback.type, parentId: dto.parentId ?? null },
    });
    // Notify the other party in the thread (admin → lab, or lab → admins).
    const enriched = await this.prisma.reportSubmission.findUnique({
      where: { id: submission.id },
      select: {
        id: true,
        laboratoryId: true,
        reportType: { select: { name: true } },
        laboratory: { select: { name: true } },
        reportingPeriod: { select: { label: true } },
      },
    });
    await this.notifications.notifyFeedback(enriched ?? submission, user);
    return feedback;
  }

  /** All feedback for a submission as threads: roots (oldest first), each with
   *  its replies (oldest first). History is append-only. */
  async listFeedback(id: string, user: AuthUser) {
    const submission = await this.load(id);
    this.assertAccess(submission, user);
    return this.prisma.feedback.findMany({
      where: { submissionId: id, parentId: null },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, fullName: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, fullName: true } } },
        },
      },
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

  // ---- Attachments ----------------------------------------------------------

  /** Supporting documents on a submission. Scoped like any other read. */
  async listAttachments(id: string, user: AuthUser) {
    const submission = await this.load(id);
    this.assertAccess(submission, user);
    return this.prisma.attachment.findMany({
      where: { submissionId: id },
      orderBy: { createdAt: 'asc' },
      select: ATTACHMENT_SELECT,
    });
  }

  /**
   * Attach a supporting document. The owning laboratory only, and only while the
   * report is editable (DRAFT / REVISION_REQUIRED) — attachments are part of the
   * submission's content, so they are frozen once it is submitted or reviewed.
   */
  async addAttachment(
    id: string,
    user: AuthUser,
    file: { buffer: Buffer; mimetype: string; size: number; originalname: string } | undefined,
    dto: UploadAttachmentDto,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded');

    const submission = await this.loadForLab(id, user);
    if (!canEditData(submission.status as ReportStatus)) {
      throw new ConflictException(
        `Attachments can only be added while the report is a draft or awaiting revision (current: ${submission.status})`,
      );
    }

    const ext = ATTACHMENT_MIME_EXT[file.mimetype];
    if (!ext) {
      throw new BadRequestException(
        'Unsupported file type. Allowed: PDF, image (PNG/JPEG/WebP/GIF), Excel, Word, CSV or text.',
      );
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      throw new BadRequestException('Attachment must be 10 MB or smaller');
    }

    const { key } = await this.storage.saveObject({
      buffer: file.buffer,
      mimeType: file.mimetype,
      ext,
      folder: 'attachments',
    });

    const attachment = await this.prisma.attachment.create({
      data: {
        submissionId: submission.id,
        sectionKey: dto.sectionKey,
        fileName: sanitizeFileName(file.originalname),
        storageKey: key,
        mimeType: file.mimetype,
        size: file.size,
        uploadedById: user.id,
      },
      select: ATTACHMENT_SELECT,
    });
    await this.audit.record({
      action: AuditAction.REPORT_ATTACHMENT_ADDED,
      actorId: user.id,
      entityType: 'ReportSubmission',
      entityId: submission.id,
      metadata: { attachmentId: attachment.id, fileName: attachment.fileName, sectionKey: dto.sectionKey ?? null },
    });
    return attachment;
  }

  /**
   * Stream an attachment's bytes for download. Scoped like any other read (admins
   * any lab; a lab head only its own). Returns the bytes plus the original name
   * and MIME so the controller can set download headers.
   */
  async downloadAttachment(
    id: string,
    attachmentId: string,
    user: AuthUser,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const submission = await this.load(id);
    this.assertAccess(submission, user);

    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.submissionId !== id) {
      throw new NotFoundException('Attachment not found');
    }

    let buffer: Buffer;
    try {
      buffer = await this.storage.readObject(attachment.storageKey);
    } catch {
      // The row exists but the stored object is gone/unreadable.
      throw new NotFoundException('Attachment file is no longer available');
    }
    return { buffer, fileName: attachment.fileName, mimeType: attachment.mimeType };
  }

  /**
   * Remove an attachment. The owning laboratory only, and only while the report
   * is editable — consistent with when it could be added.
   */
  async removeAttachment(id: string, attachmentId: string, user: AuthUser) {
    const submission = await this.loadForLab(id, user);
    if (!canEditData(submission.status as ReportStatus)) {
      throw new ConflictException(
        `Attachments can only be removed while the report is a draft or awaiting revision (current: ${submission.status})`,
      );
    }

    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.submissionId !== id) {
      throw new NotFoundException('Attachment not found');
    }

    await this.prisma.attachment.delete({ where: { id: attachmentId } });
    // Remove the stored object after the row is gone (best-effort cleanup).
    await this.storage.removeObject(attachment.storageKey);
    await this.audit.record({
      action: AuditAction.REPORT_ATTACHMENT_REMOVED,
      actorId: user.id,
      entityType: 'ReportSubmission',
      entityId: id,
      metadata: { attachmentId, fileName: attachment.fileName },
    });
    return { ok: true };
  }

  // ---- Internals ------------------------------------------------------------

  private async runLabTransition(id: string, user: AuthUser, action: Extract<WorkflowAction, 'submit' | 'resubmit'>) {
    const submission = await this.loadForLab(id, user);
    const { schema, rules } = await this.requireDefinition(submission.definitionVersionId);

    // 1) Authoritative structural validation (types + schema-required completeness).
    const result = validateSubmissionData(schema, submission.data, { requireComplete: true });
    if (!result.ok) {
      throw new UnprocessableEntityException({
        message: 'Report is incomplete or invalid',
        errors: result.errors,
      });
    }

    // 2) Authoritative rule evaluation: recompute calculated fields server-side
    //    (client values are never trusted) and enforce ERROR-severity rules.
    const evaluation = evaluate(schema, rules, result.normalized);
    const errors = evaluation.diagnostics.filter((d) => d.severity === RuleSeverity.ERROR);
    if (errors.length > 0) {
      throw new UnprocessableEntityException({
        message: 'Report violates one or more business rules',
        errors: errors.map((d) => ({ path: d.fieldPath ?? d.ruleKey, message: d.message })),
        diagnostics: evaluation.diagnostics,
      });
    }

    // 3) Persist the rule-computed values and the FLAG outcomes snapshot.
    const updated = await this.transition(submission, action, user, {
      normalizedData: evaluation.values,
      flags: evaluation.flags,
    });
    // Notify the Bureau that a report has arrived (best-effort; see service).
    await this.notifications.notifySubmitted(updated, user, action === 'resubmit');
    return updated;
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
    opts: {
      normalizedData?: Record<string, unknown>;
      flags?: Diagnostic[];
      metadata?: Record<string, unknown>;
    } = {},
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
      // Snapshot of FLAG-severity rule outcomes captured at submit time (advisory,
      // surfaced to Bureau reviewers).
      data.flags = (opts.flags ?? []) as unknown as Prisma.InputJsonValue;
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
    return (await this.requireDefinition(definitionVersionId)).schema;
  }

  /**
   * Load the pinned definition version's schema and its business rules — the
   * exact structure + rules in force when the submission was created, so history
   * stays interpretable under its own version.
   */
  private async requireDefinition(
    definitionVersionId: string | null,
  ): Promise<{ schema: FieldSchema; rules: EvaluableRule[] }> {
    if (!definitionVersionId) {
      throw new ConflictException('This submission is not pinned to a definition version');
    }
    const version = await this.prisma.reportDefinitionVersion.findUnique({
      where: { id: definitionVersionId },
      select: { fieldSchema: true, rules: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } },
    });
    const schema = this.schemaFromVersion(version?.fieldSchema);
    if (!schema) throw new ConflictException('The pinned definition version has no usable schema');
    return { schema, rules: (version?.rules ?? []).map(toEvaluableRule) };
  }

  /** Narrows a jsonb field schema to a usable FieldSchema, or null if unusable. */
  private schemaFromVersion(fieldSchema: Prisma.JsonValue | null | undefined): FieldSchema | null {
    return coerceFieldSchema(fieldSchema);
  }
}

/**
 * Keep a user-supplied filename safe to echo back in a Content-Disposition
 * header and readable in listings: strip any path, control chars and quotes,
 * collapse whitespace, and cap the length. Never used as a filesystem path (the
 * stored object is keyed by a server-generated UUID), only for display/download.
 */
function sanitizeFileName(name: string | undefined): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .replace(/[\u0000-\u001f"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 255) || 'attachment';
}

function labelWithCode(name?: string | null, code?: string | null): string {
  if (!name) return code ?? '—';
  return code ? `${name} (${code})` : name;
}

function formatEnum(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
}

/** Human-readable timestamp in the bureau's timezone (Africa/Addis Ababa). */
function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const AUDIT_FOR_ACTION: Record<WorkflowAction, AuditAction> = {
  submit: AuditAction.REPORT_SUBMITTED,
  resubmit: AuditAction.REPORT_RESUBMITTED,
  startReview: AuditAction.REPORT_REVIEW_STARTED,
  requestRevision: AuditAction.REPORT_REVISION_REQUESTED,
  approve: AuditAction.REPORT_APPROVED,
};
