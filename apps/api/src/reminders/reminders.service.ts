import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { NotificationType } from '@ohb/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService, ReminderSlot } from '../analytics/analytics.service';
import { NotificationsService } from '../notifications/notifications.service';

/** What a single sweep did — returned by the manual trigger and logged by the cron. */
export interface ReminderSweepSummary {
  ranAt: string;
  /** Lead window used, in days. */
  leadDays: number;
  /** Expected-but-unsubmitted slots considered this tick. */
  candidates: number;
  /** DEADLINE_APPROACHING reminders newly sent this tick. */
  approachingSent: number;
  /** REPORT_OVERDUE reminders newly sent this tick. */
  overdueSent: number;
  /** Candidates skipped because a reminder of that type was already sent. */
  alreadySent: number;
  /** Candidates not yet inside the lead window (and not overdue). */
  notYetDue: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Scheduled deadline & overdue reminders (Phase 17) — the deferred, time-driven
 * half of the Phase 9 notification pipeline.
 *
 * On a daily tick the sweep reuses {@link AnalyticsService.expectedSlotsForReminders}
 * to find every expected-but-unsubmitted report slot, and for each one emits —
 * **once** — a reminder to the owning lab's heads:
 * - `DEADLINE_APPROACHING` when the due date is within the lead window
 *   (`REMINDER_LEAD_DAYS`, default 3) and not yet passed, and
 * - `REPORT_OVERDUE` once the due date has passed.
 *
 * Idempotency: a {@link Prisma.ReminderDispatchCreateInput} marker per (slot,
 * type) is inserted **before** emitting; its unique constraint is the guard, so
 * the same slot is never re-notified on a later tick (or a concurrent run). The
 * sweep is best-effort: any per-slot failure is logged and never aborts the tick.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);
  /** How many days before the due date the "approaching" reminder first fires. */
  private readonly leadDays = parsePositiveInt(process.env.REMINDER_LEAD_DAYS, 3);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Daily tick at 07:00 Africa/Addis Ababa. Best-effort: a failure is logged and
   * swallowed so a bad run never crashes the scheduler.
   */
  @Cron(CronExpression.EVERY_DAY_AT_7AM, { timeZone: 'Africa/Addis_Ababa' })
  async scheduledSweep(): Promise<void> {
    try {
      const summary = await this.runSweep(new Date());
      this.logger.log(
        `Reminder sweep: ${summary.approachingSent} approaching, ${summary.overdueSent} overdue ` +
          `(${summary.candidates} candidates, ${summary.alreadySent} already sent)`,
      );
    } catch (err) {
      this.logger.error('Reminder sweep failed', err as Error);
    }
  }

  /**
   * Run one sweep for the given instant. Exposed (not just the cron) so the
   * Bureau admin can trigger it on demand and so it is testable without waiting
   * for the clock. Returns a summary of what was sent.
   */
  async runSweep(now = new Date()): Promise<ReminderSweepSummary> {
    const slots = await this.analytics.expectedSlotsForReminders(now);
    const leadMs = this.leadDays * DAY_MS;
    const t = now.getTime();

    const summary: ReminderSweepSummary = {
      ranAt: now.toISOString(),
      leadDays: this.leadDays,
      candidates: 0,
      approachingSent: 0,
      overdueSent: 0,
      alreadySent: 0,
      notYetDue: 0,
    };

    for (const slot of slots) {
      // Only expected-but-unsubmitted slots can be reminded; a submitted report
      // (any status past DRAFT) is never a candidate.
      if (!slot.notSubmitted) continue;
      summary.candidates += 1;

      const due = slot.dueDate.getTime();
      let type: NotificationType.DEADLINE_APPROACHING | NotificationType.REPORT_OVERDUE;
      if (t > due) {
        type = NotificationType.REPORT_OVERDUE;
      } else if (due - t <= leadMs) {
        type = NotificationType.DEADLINE_APPROACHING;
      } else {
        summary.notYetDue += 1;
        continue; // due date still beyond the lead window
      }

      const sent = await this.dispatchOnce(slot, type);
      if (sent === 'already') summary.alreadySent += 1;
      else if (type === NotificationType.REPORT_OVERDUE) summary.overdueSent += 1;
      else summary.approachingSent += 1;
    }

    return summary;
  }

  /**
   * Emit a reminder for one slot exactly once. Inserts the idempotency marker
   * first: a unique-constraint violation means a previous tick already handled
   * this (slot, type), so we skip. Only after the marker is secured do we emit —
   * best-effort, since the marker now owns "handled" and we never want a retry
   * storm. Returns `'sent'`, `'already'`, or `'error'`.
   */
  private async dispatchOnce(
    slot: ReminderSlot,
    type: NotificationType.DEADLINE_APPROACHING | NotificationType.REPORT_OVERDUE,
  ): Promise<'sent' | 'already' | 'error'> {
    try {
      await this.prisma.reminderDispatch.create({
        data: {
          reportTypeId: slot.reportTypeId,
          laboratoryId: slot.laboratoryId,
          reportingPeriodId: slot.periodId,
          type,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return 'already'; // marker exists → already reminded for this (slot, type)
      }
      this.logger.error(`Failed to record reminder marker for ${slot.periodId}`, err as Error);
      return 'error';
    }

    try {
      await this.notifications.notifyReminder({
        laboratoryId: slot.laboratoryId,
        type,
        ...this.content(slot, type),
        submissionId: slot.submissionId,
        reportTypeId: slot.reportTypeId,
        reportingPeriodId: slot.periodId,
      });
      return 'sent';
    } catch (err) {
      // The marker is already in place; do not retry (best-effort delivery).
      this.logger.error(`Failed to emit ${type} for ${slot.periodId}`, err as Error);
      return 'error';
    }
  }

  private content(
    slot: ReminderSlot,
    type: NotificationType.DEADLINE_APPROACHING | NotificationType.REPORT_OVERDUE,
  ): { title: string; body: string } {
    const subject = `${slot.reportTypeName} for ${slot.periodLabel}`;
    const dueText = slot.dueDate.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Africa/Addis_Ababa',
    });
    return type === NotificationType.REPORT_OVERDUE
      ? { title: 'Report overdue', body: `${subject} was due on ${dueText} and has not been submitted.` }
      : { title: 'Deadline approaching', body: `${subject} is due on ${dueText}. Please submit it before the deadline.` };
  }
}

/** Parse a positive integer env value, falling back when absent or invalid. */
function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
