-- AlterTable: save the prior postingTimes so "apply suggested times" (Pillar
-- C / #3) is reversible. Nullable, additive, non-destructive.
ALTER TABLE "Integration" ADD COLUMN "previousPostingTimes" TEXT;
