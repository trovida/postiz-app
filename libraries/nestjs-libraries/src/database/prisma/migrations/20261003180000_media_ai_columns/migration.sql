-- AlterTable: AI analysis columns on Media for the content-mix audit +
-- auto-tagged library (Pillar A / #1). All nullable, additive, non-destructive.
ALTER TABLE "Media" ADD COLUMN "aiCategory" TEXT;
ALTER TABLE "Media" ADD COLUMN "aiDescription" TEXT;
ALTER TABLE "Media" ADD COLUMN "aiLabels" TEXT;
ALTER TABLE "Media" ADD COLUMN "aiAnalyzedAt" TIMESTAMP(3);
ALTER TABLE "Media" ADD COLUMN "aiModel" TEXT;
