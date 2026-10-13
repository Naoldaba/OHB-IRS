-- Phase 25: cross-entity full-text search (Postgres tsvector + GIN).
--
-- No new search infrastructure: we add STORED GENERATED tsvector columns on the
-- two text-bearing tables (ReportType, Feedback) and GIN-index them. Generated
-- columns stay in sync with the row automatically (no triggers, no app writes),
-- which satisfies "the index stays in sync on write". Submissions have no text
-- of their own (their searchable text is their report type / lab / period /
-- status, which live in related tables), so they are matched at query time by
-- the search service against those joins rather than carrying their own vector.
--
-- The 2-arg to_tsvector(regconfig, text) form is IMMUTABLE (unlike the 1-arg
-- form, which depends on default_text_search_config) and so is legal in a
-- generated-column expression. Weights (A > B) let ts_rank favour a hit in the
-- report name/code over one in the description.
--
-- These columns are managed entirely in SQL and are intentionally NOT declared
-- in schema.prisma (Prisma cannot model GENERATED columns); the search service
-- reads them via $queryRaw. See apps/api/src/search/.

-- ReportType: stemmed English over name/description + exact 'simple' tokens for
-- the code (codes are not prose, so we don't want them stemmed).
ALTER TABLE "ReportType"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('simple',  coalesce("code", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED;

CREATE INDEX "ReportType_searchVector_idx"
  ON "ReportType" USING GIN ("searchVector");

-- Feedback: the message body (prose → English stemming).
ALTER TABLE "Feedback"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("message", ''))) STORED;

CREATE INDEX "Feedback_searchVector_idx"
  ON "Feedback" USING GIN ("searchVector");
