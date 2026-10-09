-- Phase 21: admin-managed geographic coordinates for the compliance map.
-- Both nullable; a laboratory without coordinates is listed but not plotted.
ALTER TABLE "Laboratory" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Laboratory" ADD COLUMN "longitude" DOUBLE PRECISION;
