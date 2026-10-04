import { Injectable, Logger } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { AnalyticsData } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { State } from '@prisma/client';
import dayjs from 'dayjs';

// Pillar C / #3 foundation: snapshot per-post performance into
// PostMetricsSnapshot. Zero AI tokens — reads each post's native insights via
// PostsService.checkPostAnalytics (Redis-cached, token-refresh handled there).
// The daily job (snapshotAll) is dormant on a box without RUN_CRON; the
// backfill endpoint (snapshotOrg) produces data on demand.
@Injectable()
export class AnalyticsSnapshotService {
  private readonly _logger = new Logger(AnalyticsSnapshotService.name);

  constructor(
    private _post: PrismaRepository<'post'>,
    private _organization: PrismaRepository<'organization'>,
    private _snapshot: PrismaRepository<'postMetricsSnapshot'>,
    private _postsService: PostsService
  ) {}

  // AnalyticsData.total is a STRING; map labels to typed metrics by substring
  // (providers title them "Likes" / "Total Likes" / etc.), keep the raw map too.
  private _extract(analytics: AnalyticsData[]) {
    const raw: Record<string, number> = {};
    const typed: {
      likes?: number;
      comments?: number;
      shares?: number;
      saves?: number;
      views?: number;
      reach?: number;
    } = {};
    for (const a of analytics || []) {
      const arr = a?.data;
      const last =
        Array.isArray(arr) && arr.length ? arr[arr.length - 1]?.total : undefined;
      const n = parseFloat(String(last ?? ''));
      if (!Number.isFinite(n)) {
        continue;
      }
      const label = (a.label || '').toLowerCase().trim();
      raw[label || 'metric'] = n;
      if (label.includes('like')) typed.likes = n;
      else if (label.includes('comment')) typed.comments = n;
      else if (label.includes('share')) typed.shares = n;
      else if (label.includes('save')) typed.saves = n;
      else if (label.includes('reach')) typed.reach = n;
      else if (label.includes('view') || label.includes('impression'))
        typed.views = n;
    }
    return { raw, typed };
  }

  private _score(t: {
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
  }) {
    return (
      (t.likes || 0) +
      2 * (t.comments || 0) +
      3 * (t.shares || 0) +
      2 * (t.saves || 0)
    );
  }

  async snapshotPost(
    orgId: string,
    integrationId: string,
    post: { id: string; releaseId: string | null },
    source = 'daily'
  ): Promise<boolean> {
    const analytics = await this._postsService.checkPostAnalytics(
      orgId,
      post.id,
      7
    );
    if (!Array.isArray(analytics)) {
      return false; // { missing: true }
    }
    const { raw, typed } = this._extract(analytics);
    if (!Object.keys(raw).length) {
      return false;
    }
    const score = this._score(typed);
    const reach = typed.reach ?? null;
    const capturedAt = dayjs().startOf('day').toDate();
    const data = {
      organizationId: orgId,
      integrationId,
      postId: post.id,
      releaseId: post.releaseId ?? null,
      source,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metrics: raw as any,
      likes: typed.likes ?? null,
      comments: typed.comments ?? null,
      shares: typed.shares ?? null,
      saves: typed.saves ?? null,
      views: typed.views ?? null,
      reach,
      engagementScore: score,
      engagementRate: reach ? score / reach : null,
    };
    await this._snapshot.model.postMetricsSnapshot.upsert({
      where: { postId_capturedAt: { postId: post.id, capturedAt } },
      create: { capturedAt, ...data },
      update: data,
    });
    return true;
  }

  async snapshotOrg(
    orgId: string,
    opts: { days?: number; limit?: number; source?: string } = {}
  ) {
    const days = Math.min(Math.max(opts.days ?? 14, 1), 365);
    const limit = Math.min(opts.limit ?? 100, 500);
    const source = opts.source ?? 'daily';
    const from = dayjs().subtract(days, 'day').toDate();

    const posts = await this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        state: State.PUBLISHED,
        publishDate: { gte: from },
        releaseId: { not: null },
      },
      select: { id: true, integrationId: true, releaseId: true },
      take: limit,
      orderBy: { publishDate: 'desc' },
    });

    let snapshotted = 0;
    for (const p of posts) {
      try {
        if (
          await this.snapshotPost(
            orgId,
            p.integrationId,
            { id: p.id, releaseId: p.releaseId },
            source
          )
        ) {
          snapshotted++;
        }
      } catch {
        /* a provider/token failure on one post must not fail the batch */
      }
    }
    return { posts: posts.length, snapshotted };
  }

  // The daily job: recent posts across all orgs. Bounded + fail-soft per org.
  async snapshotAll() {
    const orgs = await this._organization.model.organization.findMany({
      select: { id: true },
    });
    let totalPosts = 0;
    let totalSnapshotted = 0;
    for (const o of orgs) {
      try {
        const r = await this.snapshotOrg(o.id, { days: 14, source: 'daily' });
        totalPosts += r.posts;
        totalSnapshotted += r.snapshotted;
      } catch (e) {
        this._logger.warn(
          `snapshotAll org ${o.id} failed: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
    }
    return { orgs: orgs.length, totalPosts, totalSnapshotted };
  }
}
