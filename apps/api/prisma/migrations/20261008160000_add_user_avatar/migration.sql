-- Profile picture: public URL (local-disk in dev, cloud storage in prod).
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
