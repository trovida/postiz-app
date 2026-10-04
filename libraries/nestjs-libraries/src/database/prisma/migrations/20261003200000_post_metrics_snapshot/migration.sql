-- CreateTable: per-post performance snapshots (Pillar C / #3 foundation).
CREATE TABLE "PostMetricsSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "releaseId" TEXT,
    "capturedAt" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'backfill',
    "metrics" JSONB NOT NULL,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "saves" INTEGER,
    "views" INTEGER,
    "reach" INTEGER,
    "engagementScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "engagementRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostMetricsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostMetricsSnapshot_postId_capturedAt_key" ON "PostMetricsSnapshot"("postId", "capturedAt");
CREATE INDEX "PostMetricsSnapshot_integrationId_capturedAt_idx" ON "PostMetricsSnapshot"("integrationId", "capturedAt");
CREATE INDEX "PostMetricsSnapshot_organizationId_capturedAt_idx" ON "PostMetricsSnapshot"("organizationId", "capturedAt");
