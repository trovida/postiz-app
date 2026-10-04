-- CreateTable: Pillar D / #4 brand copilot (profile + exemplars).
CREATE TABLE "BrandProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT,
    "voice" TEXT,
    "audience" TEXT,
    "pillars" JSONB,
    "bannedPhrases" JSONB,
    "sampleCaptions" JSONB,
    "factsMarkdown" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrandProfile_organizationId_key" ON "BrandProfile"("organizationId");

CREATE TABLE "BrandExemplar" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "integrationId" TEXT,
    "category" TEXT,
    "content" TEXT NOT NULL,
    "engagementScore" DOUBLE PRECISION,
    "publishDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandExemplar_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrandExemplar_postId_key" ON "BrandExemplar"("postId");
CREATE INDEX "BrandExemplar_organizationId_engagementScore_idx" ON "BrandExemplar"("organizationId", "engagementScore");
CREATE INDEX "BrandExemplar_organizationId_publishDate_idx" ON "BrandExemplar"("organizationId", "publishDate");
