-- Phase 22: hierarchical report categories (sub-categories).
-- A category becomes a node in an adjacency-list tree via a nullable self-
-- referential parent pointer. Names are now unique WITHIN a parent rather than
-- globally, so the old global unique index on name is replaced by a composite
-- (parentId, name) unique. (Postgres treats NULLs as distinct in a unique
-- index, so duplicate top-level names are additionally guarded in the service.)

ALTER TABLE "ReportCategory" ADD COLUMN "parentId" TEXT;

DROP INDEX "ReportCategory_name_key";

CREATE UNIQUE INDEX "ReportCategory_parentId_name_key" ON "ReportCategory"("parentId", "name");

CREATE INDEX "ReportCategory_parentId_idx" ON "ReportCategory"("parentId");

ALTER TABLE "ReportCategory" ADD CONSTRAINT "ReportCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ReportCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
