import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { InsightSummaryService } from '@gitroom/nestjs-libraries/database/prisma/insights/insight-summary.service';
import { State } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export interface CadenceQuery {
  days?: number;
  integrationId?: string;
  tz?: string;
}

// Pillar B1 — cadence. Computed from Post history ALONE (no #1, no snapshot,
// no external API), so it is the dependency-free first ship. Counts PUBLISHED
// posts only (what actually went out), one event per (channel, thread-group),
// and buckets by weekday x hour in the caller's timezone.
@Injectable()
export class CadenceService {
  constructor(
    private _post: PrismaRepository<'post'>,
    private _integration: PrismaRepository<'integration'>,
    private _insightSummary: InsightSummaryService
  ) {}

  async cadence(orgId: string, query: CadenceQuery = {}) {
    const days = Math.min(Math.max(query.days || 90, 7), 365);
    const tz = this._safeTz(query.tz);
    const from = dayjs().subtract(days, 'day').startOf('day').toDate();
    const to = new Date();

    const integrations =
      await this._integration.model.integration.findMany({
        where: {
          organizationId: orgId,
          deletedAt: null,
          ...(query.integrationId ? { id: query.integrationId } : {}),
        },
        select: {
          id: true,
          name: true,
          providerIdentifier: true,
          disabled: true,
        },
      });

    const posts = await this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        state: State.PUBLISHED,
        publishDate: { gte: from },
        ...(query.integrationId ? { integrationId: query.integrationId } : {}),
      },
      select: {
        id: true,
        publishDate: true,
        integrationId: true,
        group: true,
      },
      orderBy: { publishDate: 'asc' },
    });

    // One event per (channel, thread-group): a thread / multi-part post is a
    // single posting act, not N.
    const seen = new Set<string>();
    const events: { integrationId: string; date: Date }[] = [];
    for (const p of posts) {
      const key = `${p.integrationId}:${p.group}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      events.push({ integrationId: p.integrationId, date: p.publishDate });
    }

    const totalPosts = events.length;

    // weekday (0=Sun..6=Sat) x hour (0..23) histogram, in the org timezone.
    const heatmap = Array.from({ length: 7 }, () =>
      new Array<number>(24).fill(0)
    );
    for (const e of events) {
      const d = dayjs(e.date).tz(tz);
      heatmap[d.day()][d.hour()] += 1;
    }

    const perChannel = integrations.map((i) => {
      const times = events
        .filter((e) => e.integrationId === i.id)
        .map((e) => e.date.getTime())
        .sort((a, b) => a - b);
      const count = times.length;
      const postsPerWeek = +(count / (days / 7)).toFixed(2);

      const gapsDays: number[] = [];
      for (let k = 1; k < times.length; k++) {
        gapsDays.push((times[k] - times[k - 1]) / 86_400_000);
      }
      const longestGapDays = gapsDays.length
        ? +Math.max(...gapsDays).toFixed(1)
        : null;
      const medianGapDays = gapsDays.length
        ? +this._median(gapsDays).toFixed(1)
        : null;
      const lastPostAt = count
        ? new Date(times[times.length - 1]).toISOString()
        : null;
      const currentDroughtDays = count
        ? +((to.getTime() - times[times.length - 1]) / 86_400_000).toFixed(1)
        : null;
      // "Quiet" when the current gap exceeds ~2x the store's OWN typical
      // rhythm (floored at a week) — never an absolute benchmark.
      const quiet =
        currentDroughtDays != null && medianGapDays != null
          ? currentDroughtDays > Math.max(medianGapDays * 2, 7)
          : false;

      return {
        integrationId: i.id,
        name: i.name,
        provider: i.providerIdentifier,
        disabled: i.disabled,
        totalPosts: count,
        postsPerWeek,
        lastPostAt,
        currentDroughtDays,
        longestGapDays,
        medianGapDays,
        quiet,
      };
    });

    const facts = {
      window: { days, from: from.toISOString(), to: to.toISOString(), tz },
      totalPosts,
      perChannel,
      heatmap,
    };

    // Cold start: nothing to narrate. Return the encouraging empty state and
    // skip the AI call entirely (the empty state is a promise, not an error).
    if (totalPosts === 0) {
      return {
        ...facts,
        coldStart: true,
        narrative: {
          headline: 'Insights grows with every post.',
          bullets: [
            'No published posts in this window yet — your posting rhythm will appear here as soon as you start posting.',
          ],
        },
      };
    }

    const narrative = await this._insightSummary.summarize('cadence', facts);
    return { ...facts, coldStart: false, narrative };
  }

  private _median(xs: number[]): number {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  private _safeTz(tz?: string): string {
    if (!tz) {
      return 'UTC';
    }
    try {
      dayjs().tz(tz);
      return tz;
    } catch {
      return 'UTC';
    }
  }
}
