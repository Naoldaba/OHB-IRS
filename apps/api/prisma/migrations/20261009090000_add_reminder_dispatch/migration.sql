-- Phase 17: idempotency marker for scheduled deadline/overdue reminders.
-- CreateTable
CREATE TABLE "ReminderDispatch" (
    "id" TEXT NOT NULL,
    "reportTypeId" TEXT NOT NULL,
    "laboratoryId" TEXT NOT NULL,
    "reportingPeriodId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReminderDispatch_reportingPeriodId_idx" ON "ReminderDispatch"("reportingPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderDispatch_reportTypeId_laboratoryId_reportingPeriodI_key" ON "ReminderDispatch"("reportTypeId", "laboratoryId", "reportingPeriodId", "type");
