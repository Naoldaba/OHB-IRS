-- Online presence (heartbeat): last authenticated activity + a self-service
-- visibility toggle. lastSeenAt is refreshed by the session guard; online
-- status is derived server-side and gated by showOnlineStatus.
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "showOnlineStatus" BOOLEAN NOT NULL DEFAULT true;
