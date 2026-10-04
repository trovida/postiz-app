-- Deferred #4 — owner-settable store open-hours window, respected by the
-- best-time clamp (Pillar C / #3). JSON { "startMinutes": int, "endMinutes":
-- int } (minutes-of-day). NULL -> fall back to the env window, then the 08:00-
-- 21:00 default. Additive, nullable, non-destructive.
ALTER TABLE "BrandProfile" ADD COLUMN "openHours" JSONB;
