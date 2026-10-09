-- Phase 19: per-user email-notification preference. When true (the default) the
-- user also receives their in-app notifications by email. In-app delivery is
-- unaffected. Existing users default to opted-in.
ALTER TABLE "User" ADD COLUMN "emailNotifications" BOOLEAN NOT NULL DEFAULT true;
