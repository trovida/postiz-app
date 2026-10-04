-- AlterTable: per-post content theme for the coverage insight (Pillar B2).
-- Nullable, additive, non-destructive.
ALTER TABLE "Post" ADD COLUMN "aiTheme" TEXT;
ALTER TABLE "Post" ADD COLUMN "aiThemeAt" TIMESTAMP(3);
