-- Phase 28a: editable role → capability grants.
-- Authorization becomes data-driven: the capability KEYS stay code-defined in
-- @ohb/shared (each maps to a @RequireCapability-guarded action), while the
-- GRANTS (role → capability) live here and can be edited by a Bureau admin.
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "capabilityKey" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RolePermission_roleId_capabilityKey_key" ON "RolePermission"("roleId", "capabilityKey");

CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");

ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the grants currently in force (the code's ROLE_CAPABILITIES) so there is
-- zero behaviour change at cutover. A deterministic id keeps the seed idempotent.
INSERT INTO "RolePermission" ("id", "roleId", "capabilityKey")
SELECT r.id || ':' || c.key, r.id, c.key
FROM "Role" r
CROSS JOIN (VALUES
    ('manage_laboratories'),
    ('manage_users'),
    ('manage_roles'),
    ('manage_categories'),
    ('manage_report_types'),
    ('author_definitions'),
    ('manage_periods'),
    ('manage_requirements'),
    ('view_all_reports'),
    ('review_submissions'),
    ('request_revisions'),
    ('approve_reports'),
    ('give_feedback'),
    ('resolve_feedback'),
    ('view_bureau_analytics'),
    ('view_audit'),
    ('export_reports'),
    ('search'),
    ('run_reminders'),
    ('manage_own_profile'),
    ('manage_two_factor')
) AS c(key)
WHERE r.name = 'BUREAU_ADMIN';

INSERT INTO "RolePermission" ("id", "roleId", "capabilityKey")
SELECT r.id || ':' || c.key, r.id, c.key
FROM "Role" r
CROSS JOIN (VALUES
    ('create_reports'),
    ('edit_report_drafts'),
    ('submit_reports'),
    ('manage_attachments'),
    ('view_own_reports'),
    ('give_feedback'),
    ('resolve_feedback'),
    ('view_lab_analytics'),
    ('export_reports'),
    ('search'),
    ('manage_own_profile'),
    ('manage_two_factor')
) AS c(key)
WHERE r.name = 'REGIONAL_LAB_HEAD';
