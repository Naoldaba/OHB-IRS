-- Feedback threading: a reply points at the root feedback it answers.
-- A thread is a root (parentId NULL) plus its replies. History stays append-only.
ALTER TABLE "Feedback" ADD COLUMN "parentId" TEXT;

ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Feedback_parentId_idx" ON "Feedback"("parentId");
