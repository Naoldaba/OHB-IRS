-- Phase 27: digital sign-off on completed reviews.
-- An accountable, immutable record written when a reviewer approves a submission:
-- who signed, when, the submission version signed, the definition version in
-- force, a typed full-name affirmation and an optional note. Append-only.
CREATE TABLE "ReportSignOff" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "signedById" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "definitionVersionId" TEXT,
    "confirmedName" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportSignOff_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportSignOff_submissionId_idx" ON "ReportSignOff"("submissionId");

ALTER TABLE "ReportSignOff" ADD CONSTRAINT "ReportSignOff_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ReportSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportSignOff" ADD CONSTRAINT "ReportSignOff_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReportSignOff" ADD CONSTRAINT "ReportSignOff_definitionVersionId_fkey" FOREIGN KEY ("definitionVersionId") REFERENCES "ReportDefinitionVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
