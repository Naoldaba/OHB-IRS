-- Phase 17 follow-up: let a reminder deep-link to a not-yet-started report slot.
-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "reportTypeId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "reportingPeriodId" TEXT;
