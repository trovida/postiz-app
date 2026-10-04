import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { InsightSummaryService } from '@gitroom/nestjs-libraries/database/prisma/insights/insight-summary.service';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

// Open-hours clamp (v1 default; real store hours from core-api are a follow-up).
const OPEN_START = 8 * 60; // 08:00
const OPEN_END = 21 * 60; // 21:00

// Minimum signal before the store's OWN data is trusted (else fall back).
const MIN_SCORED_POSTS = 10;
const MIN_NONZERO = 3;
const SHRINK_K = 3; // Bayesian shrinkage toward the channel mean

// Published-research default posting times per provider family — the honest
// fallback when a store has too little of its own data. weekday 0=Sun..6=Sat,
// minutes = minutes-of-day.
const PLATFORM_DEFAULTS: { match: RegExp; cells: { weekday: number; minutes: number }[] }[] = [
  { match: /instagram/i, cells: [{ weekday: 1, minutes: 660 }, { weekday: 3, minutes: 660 }, { weekday: 5, minutes: 600 }] },
  { match: /facebook/i, cells: [{ weekday: 3, minutes: 540 }, { weekday: 4, minutes: 780 }, { weekday: 5, minutes: 780 }] },
  { match: /linkedin/i, cells: [{ weekday: 2, minutes: 600 }, { weekday: 3, minutes: 600 }, { weekday: 4, minutes: 540 }] },
  { match: /tiktok/i, cells: [{ weekday: 2, minutes: 1080 }, { weekday: 4, minutes: 600 }, { weekday: 5, minutes: 1020 }] },
  { match: /(twitter|^x$|^x-|x_)/i, cells: [{ weekday: 1, minutes: 720 }, { weekday: 3, minutes: 540 }, { weekday: 5, minutes: 540 }] },
];
const GENERIC_DEFAULT = [
  { weekday: 2, minutes: 660 },
  { weekday: 4, minutes: 660 },
  { weekday: 6, minutes: 600 },
];

export interface Cell {
  weekday: number;
  minutes: number;
  score: number;
  sample: number;
  source: 'own-data' | 'platform-default';
}

// Pillar C / #3 — rank weekday x time-band posting slots from the store's OWN
// PostMetricsSnapshot (median per cell, shrunk toward the channel mean; the
// snapshot's engagementRate is preferred, else the raw score). Honest fallback
// ladder to a per-platform research table when there's too little own signal.
// NEVER mutates findFreeDateTime; "apply" writes opt-in, reversible postingTimes.
@Injectable()
export class BestTimeService {
  constructor(
    private _post: PrismaRepository<'post'>,
    private _integration: PrismaRepository<'integration'>,
    private _snapshot: PrismaRepository<'postMetricsSnapshot'>,
    private _insightSummary: InsightSummaryService
  ) {}

  private _band(minutes: number) {
    return Math.floor(minutes / 120) * 120; // 2-hour band start
  }

  private _median(xs: number[]) {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  private _defaultCells(provider: string): Cell[] {
    const hit = PLATFORM_DEFAULTS.find((p) => p.match.test(provider || ''));
    return (hit ? hit.cells : GENERIC_DEFAULT).map((c) => ({
      weekday: c.weekday,
      minutes: c.minutes,
      score: 0,
      sample: 0,
      source: 'platform-default' as const,
    }));
  }

  async bestTimes(orgId: string, integrationId: string, tz = 'UTC') {
    const integration = await this._integration.model.integration.findFirst({
      where: { id: integrationId, organizationId: orgId, deletedAt: null },
      select: { id: true, name: true, providerIdentifier: true },
    });
    if (!integration) {
      return null;
    }

    const snaps = await this._snapshot.model.postMetricsSnapshot.findMany({
      where: { organizationId: orgId, integrationId },
      select: {
        postId: true,
        engagementScore: true,
        engagementRate: true,
        reach: true,
        capturedAt: true,
      },
      orderBy: { capturedAt: 'desc' },
    });
    // latest snapshot per post
    const latest = new Map<string, (typeof snaps)[number]>();
    for (const s of snaps) {
      if (!latest.has(s.postId)) latest.set(s.postId, s);
    }
    const postIds = [...latest.keys()];

    let cells: Cell[] = [];
    let source: 'own-data' | 'platform-default' = 'platform-default';

    if (postIds.length) {
      const posts = await this._post.model.post.findMany({
        where: { id: { in: postIds } },
        select: { id: true, publishDate: true },
      });
      const pub = new Map(posts.map((p) => [p.id, p.publishDate]));
      const metricOf = (s: (typeof snaps)[number]) =>
        s.reach && s.engagementRate != null ? s.engagementRate : s.engagementScore;
      const metrics = postIds.map((id) => metricOf(latest.get(id)!));
      const nonZero = metrics.filter((m) => m > 0).length;
      const channelMean = metrics.length
        ? metrics.reduce((a, b) => a + b, 0) / metrics.length
        : 0;

      if (postIds.length >= MIN_SCORED_POSTS && nonZero >= MIN_NONZERO) {
        source = 'own-data';
        const byCell = new Map<string, number[]>();
        for (const id of postIds) {
          const d = pub.get(id);
          if (!d) continue;
          const dd = dayjs(d).tz(tz);
          const key = `${dd.day()}:${this._band(dd.hour() * 60)}`;
          if (!byCell.has(key)) byCell.set(key, []);
          byCell.get(key)!.push(metricOf(latest.get(id)!));
        }
        cells = [...byCell.entries()]
          .map(([key, arr]) => {
            const [weekday, minutes] = key.split(':').map(Number);
            const med = this._median(arr);
            const shrunk =
              (arr.length * med + SHRINK_K * channelMean) /
              (arr.length + SHRINK_K);
            return {
              weekday,
              minutes,
              score: +shrunk.toFixed(4),
              sample: arr.length,
              source: 'own-data' as const,
            };
          })
          .sort((a, b) => b.score - a.score);
      }
    }

    if (source !== 'own-data' || !cells.length) {
      cells = this._defaultCells(integration.providerIdentifier);
    }

    // open-hours clamp (fall back to clamped defaults if nothing survives)
    cells = cells.filter((c) => c.minutes >= OPEN_START && c.minutes < OPEN_END);
    if (!cells.length) {
      cells = this._defaultCells(integration.providerIdentifier).filter(
        (c) => c.minutes >= OPEN_START && c.minutes < OPEN_END
      );
    }

    const topTimes = cells.slice(0, 5);
    const facts = {
      integration: integration.name,
      provider: integration.providerIdentifier,
      timezone: tz,
      source: topTimes[0]?.source ?? source,
      scoredPosts: postIds.length,
      openHours: { startMinutes: OPEN_START, endMinutes: OPEN_END },
      topTimes,
    };
    const narrative = await this._insightSummary.summarize('besttime', facts);
    return { ...facts, narrative };
  }

  // Opt-in, reversible: save the current postingTimes, then write the top-k
  // suggested slots. findFreeDateTime is untouched — it just reads postingTimes.
  async applySuggestedTimes(orgId: string, integrationId: string, count = 3) {
    const best = await this.bestTimes(orgId, integrationId);
    if (!best) {
      throw new BadRequestException('Integration not found');
    }
    const minutes = [...new Set(best.topTimes.map((t) => t.minutes))]
      .slice(0, Math.max(1, count))
      .sort((a, b) => a - b);
    const integration = await this._integration.model.integration.findFirst({
      where: { id: integrationId, organizationId: orgId },
      select: { postingTimes: true },
    });
    if (!integration) {
      throw new BadRequestException('Integration not found');
    }
    if (!minutes.length) {
      return { applied: false as const };
    }
    const next = JSON.stringify(minutes.map((m) => ({ time: m })));
    await this._integration.model.integration.updateMany({
      where: { id: integrationId, organizationId: orgId },
      data: { previousPostingTimes: integration.postingTimes, postingTimes: next },
    });
    return {
      applied: true as const,
      postingTimes: JSON.parse(next),
      previous: JSON.parse(integration.postingTimes || '[]'),
    };
  }

  async revertSuggestedTimes(orgId: string, integrationId: string) {
    const integration = await this._integration.model.integration.findFirst({
      where: { id: integrationId, organizationId: orgId },
      select: { previousPostingTimes: true },
    });
    if (!integration?.previousPostingTimes) {
      return { reverted: false as const };
    }
    await this._integration.model.integration.updateMany({
      where: { id: integrationId, organizationId: orgId },
      data: {
        postingTimes: integration.previousPostingTimes,
        previousPostingTimes: null,
      },
    });
    return {
      reverted: true as const,
      postingTimes: JSON.parse(integration.previousPostingTimes),
    };
  }
}
