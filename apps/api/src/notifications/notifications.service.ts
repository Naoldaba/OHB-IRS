import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotificationType, RoleName } from '@ohb/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth-user';

/** The enriched submission shape the emit helpers rely on for message text. */
type SubmissionForNotice = {
  id: string;
  laboratoryId: string;
  reportType?: { name: string } | null;
  laboratory?: { name: string } | null;
  reportingPeriod?: { label: string } | null;
};

/**
 * In-app notifications (Phase 9). The workflow/feedback services call the
 * `notify*` helpers as a side effect of an event; each resolves the recipients
 * (admins or a lab's heads, never the actor themselves) and writes one row per
 * recipient. Emission is best-effort: a failure here is logged but never breaks
 * the originating action (notifications are derived, not authoritative).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---- Event emitters (called by the submissions workflow) ------------------

  /** A lab sent a report in → tell the Bureau admins. */
  notifySubmitted(submission: SubmissionForNotice, actor: AuthUser, resubmitted = false) {
    const type = resubmitted
      ? NotificationType.REPORT_RESUBMITTED
      : NotificationType.REPORT_SUBMITTED;
    const lab = submission.laboratory?.name ?? 'A laboratory';
    return this.emitToAdmins(submission, actor, type, {
      title: resubmitted ? 'Report resubmitted' : 'New report submitted',
      body: `${lab} ${resubmitted ? 'resubmitted' : 'submitted'} ${this.subject(submission)}.`,
    });
  }

  /** A review started → tell the owning lab. */
  notifyReviewStarted(submission: SubmissionForNotice, actor: AuthUser) {
    return this.emitToLab(submission, actor, NotificationType.REPORT_UNDER_REVIEW, {
      title: 'Report under review',
      body: `Your ${this.subject(submission)} is now under review.`,
    });
  }

  /** A revision was requested → tell the owning lab, with the reviewer's note. */
  notifyRevisionRequired(submission: SubmissionForNotice, actor: AuthUser, message: string) {
    return this.emitToLab(submission, actor, NotificationType.REVISION_REQUIRED, {
      title: 'Revision requested',
      body: `${this.subject(submission, true)} needs revision: ${truncate(message, 200)}`,
    });
  }

  /** A report was approved → tell the owning lab. */
  notifyApproved(submission: SubmissionForNotice, actor: AuthUser) {
    return this.emitToLab(submission, actor, NotificationType.REPORT_APPROVED, {
      title: 'Report approved',
      body: `Your ${this.subject(submission)} has been approved.`,
    });
  }

  /**
   * A comment/reply was posted → tell the other party. Admin feedback flows to
   * the owning lab; lab feedback flows to the Bureau admins.
   */
  notifyFeedback(submission: SubmissionForNotice, actor: AuthUser) {
    const content = {
      title: 'New feedback',
      body: `${actor.fullName} commented on ${this.subject(submission)}.`,
    };
    return actor.role === RoleName.BUREAU_ADMIN
      ? this.emitToLab(submission, actor, NotificationType.FEEDBACK_RECEIVED, content)
      : this.emitToAdmins(submission, actor, NotificationType.FEEDBACK_RECEIVED, content);
  }

  /**
   * A scheduled deadline/overdue reminder (Phase 17) → the owning lab's heads.
   * Unlike the event emitters there is no actor (the scheduler fires it) and the
   * slot may not yet have a submission, so `submissionId` is optional (null
   * deep-links to the lab dashboard instead of a specific report). Writes one row
   * per active head and returns how many were written. The caller owns
   * idempotency (the sent-marker); this just emits.
   */
  async notifyReminder(params: {
    laboratoryId: string;
    type: NotificationType.DEADLINE_APPROACHING | NotificationType.REPORT_OVERDUE;
    title: string;
    body: string;
    submissionId: string | null;
    /** Slot hints so the notice can create/continue the draft when not started. */
    reportTypeId: string;
    reportingPeriodId: string;
  }): Promise<number> {
    const heads = await this.prisma.user.findMany({
      where: {
        isActive: true,
        laboratoryId: params.laboratoryId,
        role: { name: RoleName.REGIONAL_LAB_HEAD },
      },
      select: { id: true },
    });
    if (heads.length === 0) return 0;
    await this.prisma.notification.createMany({
      data: heads.map((h) => ({
        recipientId: h.id,
        type: params.type,
        title: params.title,
        body: params.body,
        submissionId: params.submissionId,
        reportTypeId: params.reportTypeId,
        reportingPeriodId: params.reportingPeriodId,
        actorId: null,
      })),
    });
    return heads.length;
  }

  // ---- Recipient resolution -------------------------------------------------

  private async emitToAdmins(
    submission: SubmissionForNotice,
    actor: AuthUser,
    type: NotificationType,
    content: { title: string; body: string },
  ) {
    const admins = await this.prisma.user.findMany({
      where: { isActive: true, role: { name: RoleName.BUREAU_ADMIN } },
      select: { id: true },
    });
    return this.write(admins, submission, actor, type, content);
  }

  private async emitToLab(
    submission: SubmissionForNotice,
    actor: AuthUser,
    type: NotificationType,
    content: { title: string; body: string },
  ) {
    const heads = await this.prisma.user.findMany({
      where: {
        isActive: true,
        laboratoryId: submission.laboratoryId,
        role: { name: RoleName.REGIONAL_LAB_HEAD },
      },
      select: { id: true },
    });
    return this.write(heads, submission, actor, type, content);
  }

  private async write(
    recipients: { id: string }[],
    submission: SubmissionForNotice,
    actor: AuthUser,
    type: NotificationType,
    content: { title: string; body: string },
  ) {
    // Never notify the person who triggered the event.
    const rows = recipients
      .filter((r) => r.id !== actor.id)
      .map((r) => ({
        recipientId: r.id,
        type,
        title: content.title,
        body: content.body,
        submissionId: submission.id,
        actorId: actor.id,
      }));
    if (rows.length === 0) return;
    try {
      await this.prisma.notification.createMany({ data: rows });
    } catch (err) {
      // Best-effort: a notification failure must not break the originating action.
      this.logger.error(`Failed to write ${type} notifications`, err as Error);
    }
  }

  /** "Monthly Lab Report for Fulbaana 2017" — or possessive-friendly form. */
  private subject(submission: SubmissionForNotice, capital = false): string {
    const report = submission.reportType?.name ?? 'report';
    const period = submission.reportingPeriod?.label;
    const base = period ? `${report} for ${period}` : report;
    return capital ? base.charAt(0).toUpperCase() + base.slice(1) : base;
  }

  // ---- Recipient-facing queries ---------------------------------------------

  list(user: AuthUser, opts: { unread?: boolean; limit?: number } = {}) {
    const where: Prisma.NotificationWhereInput = { recipientId: user.id };
    if (opts.unread) where.readAt = null;
    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(opts.limit ?? 30, 1), 100),
      include: { actor: { select: { id: true, fullName: true } } },
    });
  }

  unreadCount(user: AuthUser): Promise<number> {
    return this.prisma.notification.count({
      where: { recipientId: user.id, readAt: null },
    });
  }

  async markRead(user: AuthUser, id: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.recipientId !== user.id) {
      throw new ForbiddenException('You can only update your own notifications');
    }
    if (notification.readAt) return notification;
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(user: AuthUser): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { recipientId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}
