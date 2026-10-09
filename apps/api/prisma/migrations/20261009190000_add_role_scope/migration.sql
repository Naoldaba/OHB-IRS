-- Phase 28b: the scope axis + custom roles.
-- `scope` is the data boundary (BUREAU = cross-lab, LAB = own-lab), independent
-- of capabilities. `isSystem` protects the two seeded roles from rename/rescope/
-- delete. `isActive` lets a custom role be retired without deletion.
ALTER TABLE "Role" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'LAB';
ALTER TABLE "Role" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Role" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Seed today's scopes onto the two system roles so there is zero behaviour
-- change at cutover (BUREAU_ADMIN → cross-lab, REGIONAL_LAB_HEAD → own-lab).
UPDATE "Role" SET "scope" = 'BUREAU', "isSystem" = true WHERE "name" = 'BUREAU_ADMIN';
UPDATE "Role" SET "scope" = 'LAB', "isSystem" = true WHERE "name" = 'REGIONAL_LAB_HEAD';
