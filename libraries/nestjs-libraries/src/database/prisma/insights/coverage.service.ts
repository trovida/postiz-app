import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { InsightSummaryService } from '@gitroom/nestjs-libraries/database/prisma/insights/insight-summary.service';
import { RETAIL_GAP_CATEGORIES } from '@gitroom/nestjs-libraries/database/prisma/insights/content-taxonomy';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { State } from '@prisma/client';
import dayjs from 'dayjs';

// Pillar B2 — coverage: the theme x channel mix of what the store has actually
// published, the retail gaps, and how long since each theme last ran. Theme is
// per-post (`Post.aiTheme`): primary source = a majority vote over the attached
// images' `Media.aiCategory` (#1); fallback = one text classification. Themes
// persist, so classification is paid once, and the read endpoint is progressive
// (returns themed-so-far + a pending count; a bounded backfill fills the rest).
@Injectable()
export class CoverageService {
  constructor(
    private _post: PrismaRepository<'post'>,
    private _media: PrismaRepository<'media'>,
    private _openAi: OpenaiService,
    private _insightSummary: InsightSummaryService
  ) {}

  private _persist(id: string, theme: string) {
    return this._post.model.post.update({
      where: { id },
      data: { aiTheme: theme, aiThemeAt: new Date() },
    });
  }

  private async _resolveTheme(post: {
    id: string;
    image: string | null;
    content: string | null;
  }): Promise<string | null> {
    // Primary: majority vote over the post's attached images' aiCategory.
    let ids: string[] = [];
    try {
      ids = JSON.parse(post.image || '[]')
        .map((x: { id?: string }) => x?.id)
        .filter(Boolean);
    } catch {
      /* malformed image JSON → treat as no images */
    }
    if (ids.length) {
      const media = await this._media.model.media.findMany({
        where: { id: { in: ids }, aiCategory: { not: null } },
        select: { aiCategory: true },
      });
      if (media.length) {
        const counts: Record<string, number> = {};
        for (const m of media) {
          const c = m.aiCategory as string;
          counts[c] = (counts[c] || 0) + 1;
        }
        const theme = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
        await this._persist(post.id, theme);
        return theme;
      }
    }
    // Fallback: classify the post text.
    const theme = await this._openAi.classifyTextTheme(post.content || '');
    if (theme) {
      await this._persist(post.id, theme);
      return theme;
    }
    return null;
  }

  async coverage(orgId: string, days = 90) {
    const d = Math.min(Math.max(days || 90, 7), 365);
    const from = dayjs().subtract(d, 'day').startOf('day').toDate();

    const posts = await this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        state: State.PUBLISHED,
        publishDate: { gte: from },
      },
      select: {
        id: true,
        integrationId: true,
        group: true,
        publishDate: true,
        aiTheme: true,
      },
      orderBy: { publishDate: 'asc' },
    });

    // One event per (channel, thread-group).
    const seen = new Set<string>();
    const events: {
      integrationId: string;
      theme: string | null;
      date: Date;
    }[] = [];
    for (const p of posts) {
      const k = `${p.integrationId}:${p.group}`;
      if (seen.has(k)) {
        continue;
      }
      seen.add(k);
      events.push({
        integrationId: p.integrationId,
        theme: p.aiTheme,
        date: p.publishDate,
      });
    }

    const themed = events.filter((e) => e.theme);
    const pendingClassification = events.length - themed.length;

    const byTheme: Record<string, number> = {};
    const lastByTheme: Record<string, string> = {};
    for (const e of themed) {
      byTheme[e.theme!] = (byTheme[e.theme!] || 0) + 1;
      // events are asc, so the last write per theme is the most recent.
      lastByTheme[e.theme!] = e.date.toISOString();
    }
    const total = themed.length;
    const now = Date.now();
    const mix = Object.entries(byTheme)
      .map(([theme, count]) => ({
        theme,
        count,
        pct: total ? Math.round((count / total) * 100) : 0,
        lastPostedAt: lastByTheme[theme],
        daysSinceLast: +(
          (now - new Date(lastByTheme[theme]).getTime()) /
          86_400_000
        ).toFixed(1),
      }))
      .sort((a, b) => b.count - a.count);
    const present = new Set(mix.map((m) => m.theme));
    const gaps = RETAIL_GAP_CATEGORIES.filter((c) => !present.has(c));

    const facts = {
      window: { days: d },
      totalPosts: events.length,
      totalThemed: total,
      pendingClassification,
      mix,
      gaps,
    };

    if (total === 0) {
      return {
        ...facts,
        narrative: {
          headline:
            pendingClassification > 0
              ? 'Your posts aren’t sorted into themes yet.'
              : 'No published posts in this window yet.',
          bullets: [
            pendingClassification > 0
              ? 'Run a coverage scan to classify your posts by theme and see your content mix.'
              : 'Your theme mix will appear here as soon as you start posting.',
          ],
        },
      };
    }

    const narrative = await this._insightSummary.summarize('coverage', facts);
    return { ...facts, narrative };
  }

  // Bounded, progressive theme classification for unthemed published posts.
  async backfillThemes(orgId: string, limit = 10, days = 90) {
    const cap = Math.min(Math.max(limit || 10, 1), 25);
    const d = Math.min(Math.max(days || 90, 7), 365);
    const from = dayjs().subtract(d, 'day').startOf('day').toDate();

    const pending = await this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        state: State.PUBLISHED,
        publishDate: { gte: from },
        aiTheme: null,
      },
      select: { id: true, image: true, content: true },
      take: cap,
      orderBy: { publishDate: 'desc' },
    });

    let resolved = 0;
    for (const p of pending) {
      try {
        if (await this._resolveTheme(p)) {
          resolved++;
        }
      } catch {
        /* skip */
      }
    }
    return { processed: pending.length, resolved, hasMore: pending.length === cap };
  }
}
