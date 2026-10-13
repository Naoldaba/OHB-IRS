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
  RoleScope,
  RuleSeverity,
  WorkflowAction,
  allowedMimeTypes,
  buildRenderModel,
  canEditData,
  emptySubmissionData,
  evaluate,
  fileTypeLabels,
  isDocumentSchema,
  transitionFor,
  validateSubmissionData,
  type DocumentFieldSchema,
} from '@ohb/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService, type Recipient } from '../notifications/notifications.service';
import { AuthUser } from '../common/auth-user';
import { AUTHOR_PRESENCE_SELECT, toPublicAuthor } from '../common/presence';
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
  ApproveSubmissionDto,
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

/** @mention projection: the mentioned user's identity, flattened for the client. */
const MENTION_SELECT = {
  mentionedUserId: true,
  mentionedUser: { select: { id: true, fullName: true } },
} satisfies Prisma.FeedbackMentionSelect;

/**
 * Feedback as threads (Phase 7 + 24): roots (oldest first), each with its author,
 * resolution state, @mentions and its replies (each with author + mentions).
 * Shared by `getDetail` and `listFeedback` so both return the same shape.
 */
const FEEDBACK_THREAD_INCLUDE = {
  author: { select: AUTHOR_PRESENCE_SELECT },
  resolvedBy: { select: { id: true, fullName: true } },
  mentions: { select: MENTION_SELECT },
  replies: {
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: AUTHOR_PRESENCE_SELECT },
      mentions: { select: MENTION_SELECT },
    },
  },
} satisfies Prisma.FeedbackInclude;

/**
 * Project the presence-carrying author on each feedback root and its replies to
 * the public `{ id, fullName, isOnline }` shape, deriving online status once per
 * response and dropping the raw lastSeenAt/showOnlineStatus. Keeps every other
 * field intact.
 */
function withFeedbackPresence<
  R extends { author: unknown; replies?: { author: unknown }[] },
>(roots: R[], now: number = Date.now()) {
  return roots.map((root) => ({
    ...root,
    author: toPublicAuthor(root.author as Parameters<typeof toPublicAuthor>[0], now),
    replies: root.replies?.map((reply) => ({
      ...reply,
      author: toPublicAuthor(reply.author as Parameters<typeof toPublicAuthor>[0], now),
    })),
  }));
}

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

    if (user.scope === RoleScope.LAB) {
      // Lab-scoped users only ever see their own laboratory's submissions, regardless of filters.
      where.laboratoryId = user.laboratoryId ?? '__none__';
    } else if (query.laboratoryId) {
      where.laboratoryId = query.laboratoryId;
    }

    // Whitelisted sort: newest reporting period first, or most-recently updated.
    const orderBy: Prisma.ReportSubmissionOrderByWithRelationInput[] =
      query.sort === 'period'
        ? [
            { reportingPeriod: { year: 'desc' } },
            { reportingPeriod: { periodNumber: 'desc' } },
          ]
        : [{ updatedAt: 'desc' }];

    const submissions = await this.prisma.reportSubmission.findMany({
      where,
      orderBy,
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
          include: FEEDBACK_THREAD_INCLUDE,
        },
        versions: { orderBy: { versionNumber: 'asc' } },
        signOffs: {
          orderBy: { createdAt: 'desc' },
          include: {
            signedBy: { select: { id: true, fullName: true } },
            definitionVersion: { select: { version: true } },
          },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    this.assertAccess(submission, user);

    const schema = this.schemaFromVersion(submission.definitionVersion?.fieldSchema);
    return {
      ...submission,
      feedback: withFeedbackPresence(submission.feedback),
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

    // Optionally prefill the draft from a previous submission (Phase 16). The
    // source must be the lab's own and the same report type; its data is
    // re-shaped to the current published schema so stale/removed fields are
    // dropped (the validator normalizes to the schema and never invents fields).
    let initialData = emptySubmissionData(schema);
    let copiedFromSubmissionId: string | null = null;
    if (dto.copyFromSubmissionId) {
      const source = await this.prisma.reportSubmission.findUnique({
        where: { id: dto.copyFromSubmissionId },
      });
      if (!source) {
        throw new BadRequestException('The report to copy from was not found');
      }
      if (source.laboratoryId !== laboratoryId) {
        throw new ForbiddenException("You can only copy from your own laboratory's reports");
      }
      if (source.reportTypeId !== dto.reportTypeId) {
        throw new BadRequestException('You can only copy from a previous report of the same type');
      }
      const { normalized } = validateSubmissionData(schema, source.data, {
        requireComplete: false,
      });
      initialData = normalized;
      copiedFromSubmissionId = source.id;
    }

    try {
      const created = await this.prisma.reportSubmission.create({
        data: {
          reportTypeId: dto.reportTypeId,
          laboratoryId,
          reportingPeriodId: dto.reportingPeriodId,
          status: ReportStatus.DRAFT,
          data: initialData as Prisma.InputJsonValue,
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
        metadata: {
          reportTypeId: dto.reportTypeId,
          laboratoryId,
          periodId: dto.reportingPeriodId,
          copiedFromSubmissionId,
        },
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

  /**
   * Approve a submission and record an accountable digital sign-off (Phase 27).
   * The reviewer re-affirms the approval by typing their own full name (checked
   * here against the signed-in user — accountability, not a crypto signature);
   * an optional note is kept. The sign-off is written in the same DB transaction
   * as the APPROVED transition, pinned to the version/definition that was signed,
   * and is immutable (append-only) so the approval cannot be silently altered.
   */
  async approve(id: string, user: AuthUser, dto: ApproveSubmissionDto) {
    const submission = await this.load(id);

    const confirmed = dto.confirmName.trim();
    if (confirmed.toLowerCase() !== user.fullName.trim().toLowerCase()) {
      throw new BadRequestException(
        'To sign off, type your own full name exactly as it appears on your account.',
      );
    }
    const note = dto.note?.trim() || undefined;

    const updated = await this.transition(submission, 'approve', user, {
      metadata: { note: note ?? null },
      afterCommit: async (tx, result) => {
        await tx.reportSignOff.create({
          data: {
            submissionId: result.id,
            signedById: user.id,
            versionNumber: result.currentVersion,
            definitionVersionId: result.definitionVersionId,
            confirmedName: confirmed,
            note,
          },
        });
      },
    });

    await this.audit.record({
      action: AuditAction.REPORT_SIGNED_OFF,
      actorId: user.id,
      entityType: 'ReportSubmission',
      entityId: id,
      metadata: { versionNumber: updated.currentVersion, note: note ?? null },
    });
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

    // Labs can comment and reply, but never author a revision request. A
    // revision request is a cross-lab (bureau) review action.
    const type =
      user.scope === RoleScope.BUREAU
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

    // Resolve @mentions to users who are actually authorized to see this
    // submission — an @mention never leaks the report to someone who could not
    // otherwise view it. Unauthorized/unknown ids are silently dropped.
    const mentionTargets = await this.resolveMentions(submission.laboratoryId, dto.mentions);

    const feedback = await this.prisma.feedback.create({
      data: {
        submissionId: submission.id,
        authorId: user.id,
        type,
        message: dto.message,
        sectionKey,
        fieldKey,
        parentId: dto.parentId,
        mentions: mentionTargets.length
          ? { create: mentionTargets.map((m) => ({ mentionedUserId: m.id })) }
          : undefined,
      },
      include: {
        author: { select: AUTHOR_PRESENCE_SELECT },
        mentions: { select: MENTION_SELECT },
      },
    });
    await this.audit.record({
      action: AuditAction.REPORT_FEEDBACK_ADDED,
      actorId: user.id,
      entityType: 'ReportSubmission',
      entityId: submission.id,
      metadata: {
        feedbackId: feedback.id,
        type: feedback.type,
        parentId: dto.parentId ?? null,
        mentionedUserIds: mentionTargets.map((m) => m.id),
      },
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
    const notice = enriched ?? submission;
    await this.notifications.notifyFeedback(notice, user);
    // Separately ping each @mentioned user (deep-linked to their own portal).
    await this.notifications.notifyMention(notice, user, mentionTargets);
    return { ...feedback, author: toPublicAuthor(feedback.author) };
  }

  /**
   * Resolve a list of candidate @mention user ids to the active users who may
   * see this submission (all Bureau admins + the owning lab's heads). Anything
   * else is dropped — the mention list can never widen who learns of the report.
   */
  private async resolveMentions(
    laboratoryId: string,
    mentionIds: string[] | undefined,
  ): Promise<Recipient[]> {
    if (!mentionIds || mentionIds.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: [...new Set(mentionIds)] },
        isActive: true,
        OR: [
          { role: { scope: RoleScope.BUREAU } },
          { role: { scope: RoleScope.LAB }, laboratoryId },
        ],
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        emailNotifications: true,
        role: { select: { scope: true } },
      },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      emailNotifications: u.emailNotifications,
      scope: u.role.scope,
    }));
  }

  /**
   * Users who may be @mentioned on this submission: all active Bureau admins and
   * the owning laboratory's active heads (exactly the viewers `assertAccess`
   * admits). Caller is access-checked first. Drives the mention autocomplete.
   */
  async mentionableUsers(id: string, user: AuthUser) {
    const submission = await this.load(id);
    this.assertAccess(submission, user);
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { role: { scope: RoleScope.BUREAU } },
          { role: { scope: RoleScope.LAB }, laboratoryId: submission.laboratoryId },
        ],
      },
      select: { id: true, fullName: true, role: { select: { name: true } } },
      orderBy: { fullName: 'asc' },
    });
    return users.map((u) => ({ id: u.id, fullName: u.fullName, role: u.role.name }));
  }

  /**
   * Resolve or reopen a feedback thread (Phase 24). Access-scoped like any other
   * feedback action (admins any lab; a lab head only its own); only a thread
   * root can be resolved. Resolving hides-but-preserves the thread in the UI —
   * nothing is deleted. Audited.
   */
  async resolveThread(
    id: string,
    feedbackId: string,
    user: AuthUser,
    resolved: boolean,
  ) {
    const submission = await this.load(id);
    this.assertAccess(submission, user);
    const root = await this.prisma.feedback.findUnique({ where: { id: feedbackId } });
    if (!root || root.submissionId !== submission.id) {
      throw new BadRequestException('Feedback does not belong to this submission');
    }
    if (root.parentId) {
      throw new BadRequestException('Only a thread root can be resolved');
    }
    const updated = await this.prisma.feedback.update({
      where: { id: feedbackId },
      data: resolved
        ? { resolvedAt: new Date(), resolvedById: user.id }
        : { resolvedAt: null, resolvedById: null },
      include: { resolvedBy: { select: { id: true, fullName: true } } },
    });
    await this.audit.record({
      action: resolved
        ? AuditAction.REPORT_FEEDBACK_RESOLVED
        : AuditAction.REPORT_FEEDBACK_REOPENED,
      actorId: user.id,
      entityType: 'ReportSubmission',
      entityId: submission.id,
      metadata: { feedbackId },
    });
    return updated;
  }

  /** All feedback for a submission as threads: roots (oldest first), each with
   *  its replies (oldest first). History is append-only. */
  async listFeedback(id: string, user: AuthUser) {
    const submission = await this.load(id);
    this.assertAccess(submission, user);
    const roots = await this.prisma.feedback.findMany({
      where: { submissionId: id, parentId: null },
      orderBy: { createdAt: 'asc' },
      include: FEEDBACK_THREAD_INCLUDE,
    });
    return withFeedbackPresence(roots);
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

  /**
   * The submission's lifecycle as an ordered timeline (Phase 21): every workflow
   * milestone from the immutable audit trail — created → submitted → review →
   * feedback → revision → resubmit → approved — enriched with the feedback /
   * revision message and the version snapshot each submit produced. Scoped like
   * any other read (admins any lab; a lab head only its own). No synthetic
   * events are invented; everything here is a real audit / feedback / version
   * record, in chronological order.
   */
  async timeline(id: string, user: AuthUser): Promise<TimelineEvent[]> {
    const submission = await this.load(id);
    this.assertAccess(submission, user);

    const [logs, feedback, versions] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          entityType: 'ReportSubmission',
          entityId: id,
          action: { in: TIMELINE_ACTIONS },
        },
        orderBy: { createdAt: 'asc' },
        include: { actor: { select: { id: true, fullName: true } } },
      }),
      this.prisma.feedback.findMany({
        where: { submissionId: id },
        select: { id: true, message: true },
      }),
      this.prisma.submissionVersion.findMany({
        where: { submissionId: id },
        orderBy: { submittedAt: 'asc' },
        select: { versionNumber: true },
      }),
    ]);

    const messageByFeedbackId = new Map(feedback.map((f) => [f.id, f.message]));
    // Each submit / resubmit writes exactly one version snapshot, in the same
    // chronological order as the arrival events — so consume them in order.
    const versionQueue = versions.map((v) => v.versionNumber);

    const events: TimelineEvent[] = [];
    for (const l of logs) {
      const kind = KIND_FOR_ACTION[l.action as AuditAction];
      if (!kind) continue;
      const event: TimelineEvent = {
        id: l.id,
        kind,
        at: l.createdAt.toISOString(),
        actor: l.actor,
        title: TITLE_FOR_KIND[kind],
      };
      if (kind === 'revision_requested') {
        const meta = l.metadata as { message?: string } | null;
        if (meta?.message) event.message = meta.message;
      } else if (kind === 'feedback') {
        const meta = l.metadata as { feedbackId?: string } | null;
        const message = meta?.feedbackId ? messageByFeedbackId.get(meta.feedbackId) : undefined;
        if (message) event.message = message;
      } else if (kind === 'submitted' || kind === 'resubmitted') {
        const versionNumber = versionQueue.shift();
        if (versionNumber !== undefined) event.versionNumber = versionNumber;
      } else if (kind === 'approved') {
        // The approval carries the reviewer's sign-off note (Phase 27).
        const meta = l.metadata as { note?: string | null } | null;
        if (meta?.note) event.message = meta.note;
      }
      events.push(event);
    }
    return events;
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

    // A document report may restrict the accepted file types (admin-configured).
    const docSchema = await this.documentConstraints(submission.definitionVersionId);
    if (docSchema?.allowedFileTypes?.length) {
      const allowed = allowedMimeTypes(docSchema.allowedFileTypes);
      if (!allowed.has(file.mimetype)) {
        throw new BadRequestException(
          `This report only accepts: ${fileTypeLabels(docSchema.allowedFileTypes).join(', ')}.`,
        );
      }
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

    // Attachment-only (document) reports have no structured data: the only submit
    // gate is "at least N attachments". Enforced here (file count isn't visible to
    // the shared validator). No rule evaluation — there are no fields.
    if (isDocumentSchema(schema)) {
      const min = schema.minAttachments ?? 1;
      const count = await this.prisma.attachment.count({ where: { submissionId: submission.id } });
      if (count < min) {
        throw new UnprocessableEntityException({
          message: `This report requires at least ${min} attachment${min === 1 ? '' : 's'} before it can be submitted (currently ${count}).`,
          errors: [],
        });
      }
      const updatedDoc = await this.transition(submission, action, user, { normalizedData: {}, flags: [] });
      await this.notifications.notifySubmitted(updatedDoc, user, action === 'resubmit');
      return updatedDoc;
    }

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
      /**
       * Runs inside the same transaction as the status change, after the
       * submission (and any version snapshot) is written — so a side record
       * (e.g. a Phase 27 sign-off) commits atomically with the transition.
       */
      afterCommit?: (
        tx: Prisma.TransactionClient,
        result: Prisma.ReportSubmissionGetPayload<{ include: typeof LIST_INCLUDE }>,
      ) => Promise<void>;
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
      if (opts.afterCommit) await opts.afterCommit(tx, result);
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
    if (user.scope !== RoleScope.LAB || submission.laboratoryId !== user.laboratoryId) {
      throw new ForbiddenException('You can only act on your own laboratory\'s submissions');
    }
    return submission;
  }

  private assertAccess(submission: { laboratoryId: string }, user: AuthUser): void {
    // Bureau scope sees across all laboratories; lab scope only its own.
    if (user.scope === RoleScope.BUREAU) return;
    if (user.scope === RoleScope.LAB && submission.laboratoryId === user.laboratoryId) {
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

  /** The document-layout schema for a submission's version, or null if not a document report. */
  private async documentConstraints(
    definitionVersionId: string | null,
  ): Promise<DocumentFieldSchema | null> {
    if (!definitionVersionId) return null;
    const version = await this.prisma.reportDefinitionVersion.findUnique({
      where: { id: definitionVersionId },
      select: { fieldSchema: true },
    });
    const schema = this.schemaFromVersion(version?.fieldSchema);
    return schema && isDocumentSchema(schema) ? schema : null;
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

// ---- Submission activity timeline (Phase 21) --------------------------------

/** The lifecycle milestones a submission timeline surfaces. */
export type TimelineKind =
  | 'created'
  | 'submitted'
  | 'resubmitted'
  | 'review_started'
  | 'revision_requested'
  | 'feedback'
  | 'approved';

/** One ordered lifecycle event, built from a real audit / feedback / version record. */
export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  at: string;
  actor: { id: string; fullName: string } | null;
  title: string;
  /** Feedback or revision-request message, when the event carries one. */
  message?: string;
  /** The immutable snapshot a submit / resubmit produced. */
  versionNumber?: number;
}

/** Audit actions that count as timeline milestones (draft autosaves/exports excluded). */
const KIND_FOR_ACTION: Partial<Record<AuditAction, TimelineKind>> = {
  [AuditAction.REPORT_CREATED]: 'created',
  [AuditAction.REPORT_SUBMITTED]: 'submitted',
  [AuditAction.REPORT_RESUBMITTED]: 'resubmitted',
  [AuditAction.REPORT_REVIEW_STARTED]: 'review_started',
  [AuditAction.REPORT_REVISION_REQUESTED]: 'revision_requested',
  [AuditAction.REPORT_FEEDBACK_ADDED]: 'feedback',
  [AuditAction.REPORT_APPROVED]: 'approved',
};

const TIMELINE_ACTIONS = Object.keys(KIND_FOR_ACTION) as AuditAction[];

const TITLE_FOR_KIND: Record<TimelineKind, string> = {
  created: 'Draft created',
  submitted: 'Submitted for review',
  resubmitted: 'Resubmitted',
  review_started: 'Review started',
  revision_requested: 'Revision requested',
  feedback: 'Feedback added',
  approved: 'Approved',
};
