-- Phase 24: threaded feedback resolution + @mentions.
-- Feedback gains a resolve/reopen state (meaningful only on a thread root; the
-- records themselves are never deleted — history is preserved). A new
-- FeedbackMention join captures each @mentioned user per message; the mentioned
-- user is always someone authorized to see the submission (enforced in the
-- service when the mention is recorded).

-- AlterTable: thread resolution
ALTER TABLE "Feedback" ADD COLUMN "resolvedAt" TIMESTAMP(3);
ALTER TABLE "Feedback" ADD COLUMN "resolvedById" TEXT;

ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: @mentions
CREATE TABLE "FeedbackMention" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "mentionedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackMention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackMention_feedbackId_mentionedUserId_key" ON "FeedbackMention"("feedbackId", "mentionedUserId");

-- CreateIndex
CREATE INDEX "FeedbackMention_mentionedUserId_idx" ON "FeedbackMention"("mentionedUserId");

-- AddForeignKey
ALTER TABLE "FeedbackMention" ADD CONSTRAINT "FeedbackMention_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackMention" ADD CONSTRAINT "FeedbackMention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
