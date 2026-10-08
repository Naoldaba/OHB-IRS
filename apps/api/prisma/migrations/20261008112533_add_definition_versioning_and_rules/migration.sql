-- Add report-definition versioning and the configurable business rules data model.
-- NOTE: the `session` table (managed at runtime by connect-pg-simple, not by
-- Prisma) is intentionally NOT dropped here even though it is not in the schema.

-- AlterTable
ALTER TABLE "ReportSubmission" ADD COLUMN     "definitionVersionId" TEXT,
ADD COLUMN     "flags" JSONB;

-- CreateTable
CREATE TABLE "ReportDefinitionVersion" (
    "id" TEXT NOT NULL,
    "reportTypeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "schemaSource" TEXT NOT NULL,
    "fieldSchema" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT NOT NULL,
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ReportDefinitionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessRule" (
    "id" TEXT NOT NULL,
    "definitionVersionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL,
    "severity" TEXT,
    "condition" JSONB NOT NULL DEFAULT '{}',
    "action" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "categoryId" TEXT,
    "conditionTemplate" JSONB NOT NULL DEFAULT '{}',
    "actionTemplate" JSONB NOT NULL DEFAULT '{}',
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportDefinitionVersion_reportTypeId_idx" ON "ReportDefinitionVersion"("reportTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportDefinitionVersion_reportTypeId_version_key" ON "ReportDefinitionVersion"("reportTypeId", "version");

-- CreateIndex
CREATE INDEX "BusinessRule_definitionVersionId_idx" ON "BusinessRule"("definitionVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessRule_definitionVersionId_key_key" ON "BusinessRule"("definitionVersionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "RuleTemplate_name_key" ON "RuleTemplate"("name");

-- CreateIndex
CREATE INDEX "ReportSubmission_definitionVersionId_idx" ON "ReportSubmission"("definitionVersionId");

-- AddForeignKey
ALTER TABLE "ReportSubmission" ADD CONSTRAINT "ReportSubmission_definitionVersionId_fkey" FOREIGN KEY ("definitionVersionId") REFERENCES "ReportDefinitionVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDefinitionVersion" ADD CONSTRAINT "ReportDefinitionVersion_reportTypeId_fkey" FOREIGN KEY ("reportTypeId") REFERENCES "ReportType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDefinitionVersion" ADD CONSTRAINT "ReportDefinitionVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDefinitionVersion" ADD CONSTRAINT "ReportDefinitionVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessRule" ADD CONSTRAINT "BusinessRule_definitionVersionId_fkey" FOREIGN KEY ("definitionVersionId") REFERENCES "ReportDefinitionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessRule" ADD CONSTRAINT "BusinessRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RuleTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleTemplate" ADD CONSTRAINT "RuleTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ReportCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
