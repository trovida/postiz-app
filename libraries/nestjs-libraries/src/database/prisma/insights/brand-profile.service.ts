import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { State } from '@prisma/client';

function strip(s: string | null): string {
  return (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface BrandProfileInput {
  name?: string | null;
  voice?: string | null;
  audience?: string | null;
  pillars?: string[] | null;
  bannedPhrases?: string[] | null;
  sampleCaptions?: string[] | null;
  factsMarkdown?: string | null;
  // Deferred #4 — owner-set store open-hours (minutes-of-day) the best-time
  // clamp respects. Send null to clear (falls back to env/default).
  openHours?: { startMinutes: number; endMinutes: number } | null;
}

// Pillar D / #4 — the per-org brand profile + exemplar pool. Profile is
// owner-editable and can be seeded from recent posts; exemplars are the store's
// own past posts, ranked by engagement (when snapshots exist) then recency.
@Injectable()
export class BrandProfileService {
  constructor(
    private _brandProfile: PrismaRepository<'brandProfile'>,
    private _brandExemplar: PrismaRepository<'brandExemplar'>,
    private _post: PrismaRepository<'post'>,
    private _openAi: OpenaiService
  ) {}

  get(orgId: string) {
    return this._brandProfile.model.brandProfile.findUnique({
      where: { organizationId: orgId },
    });
  }

  update(orgId: string, data: BrandProfileInput) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clean: any = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) {
        clean[k] = v;
      }
    }
    return this._brandProfile.model.brandProfile.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId, ...clean },
      update: clean,
    });
  }

  // Seed the profile's voice/audience/pillars/facts from the last ~50 published
  // posts (one DeepSeek call). Owner can edit afterwards. Never overwrites with
  // nothing — if there's no post text or the model fails, returns the current.
  async seedFromPosts(orgId: string) {
    const posts = await this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        state: State.PUBLISHED,
      },
      select: { content: true },
      take: 50,
      orderBy: { publishDate: 'desc' },
    });
    const texts = posts.map((p) => strip(p.content)).filter(Boolean);
    if (!texts.length) {
      return this.get(orgId);
    }
    const summary = await this._openAi.summarizeBrandVoice(texts);
    if (!summary) {
      return this.get(orgId);
    }
    return this.update(orgId, {
      voice: summary.voice,
      audience: summary.audience,
      pillars: summary.pillars,
      factsMarkdown: summary.factsMarkdown,
    });
  }

  // Upsert the store's recent published posts into the exemplar pool. Carries
  // the post's theme (#1/#2) when present; engagementScore is backfilled from
  // PostMetricsSnapshot in a later pass (recency-ranked until then).
  async backfillExemplars(orgId: string, limit = 50) {
    const cap = Math.min(Math.max(limit || 50, 1), 200);
    const posts = await this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        state: State.PUBLISHED,
      },
      select: {
        id: true,
        integrationId: true,
        content: true,
        publishDate: true,
        aiTheme: true,
      },
      take: cap,
      orderBy: { publishDate: 'desc' },
    });
    let upserted = 0;
    for (const p of posts) {
      const content = strip(p.content);
      if (!content) {
        continue;
      }
      await this._brandExemplar.model.brandExemplar.upsert({
        where: { postId: p.id },
        create: {
          organizationId: orgId,
          postId: p.id,
          integrationId: p.integrationId,
          category: p.aiTheme,
          content,
          publishDate: p.publishDate,
        },
        update: { content, category: p.aiTheme },
      });
      upserted++;
    }
    return { processed: posts.length, upserted };
  }
}
