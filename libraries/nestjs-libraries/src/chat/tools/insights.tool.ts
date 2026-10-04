import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { CadenceService } from '@gitroom/nestjs-libraries/database/prisma/insights/cadence.service';
import { CoverageService } from '@gitroom/nestjs-libraries/database/prisma/insights/coverage.service';
import { BestTimeService } from '@gitroom/nestjs-libraries/database/prisma/insights/best-time.service';
import { BrandProfileService } from '@gitroom/nestjs-libraries/database/prisma/insights/brand-profile.service';
import { BrandContextService } from '@gitroom/nestjs-libraries/database/prisma/insights/brand-context.service';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';

// One consolidated "intelligence" tool (not six separate tools): DeepSeek is a
// thinking model and a large tool list measurably degrades its tool-selection,
// so a single dispatch tool keeps the agent's tool context small. Dispatches to
// the same services the Insights panels use. Left out entirely when
// ENABLE_INSIGHTS isn't set (available() gate).
@Injectable()
export class InsightsTool implements AgentToolInterface {
  constructor(
    private _cadence: CadenceService,
    private _coverage: CoverageService,
    private _bestTime: BestTimeService,
    private _brandProfile: BrandProfileService,
    private _brandContext: BrandContextService,
    private _media: MediaService,
    private _integration: PrismaRepository<'integration'>
  ) {}

  name = 'insightsTool';

  available() {
    return process.env.ENABLE_INSIGHTS === 'true';
  }

  run() {
    return createTool({
      id: 'insightsTool',
      description: `Answer questions about the STORE'S OWN performance, content and brand — everything is derived from their own posts, photos and results (never benchmarks). Pick one "kind":
- "cadence": how often they post, their longest quiet streaks/current drought per channel, and when (weekday x hour). Use for "how consistent am I?", "have I gone quiet?".
- "coverage": the mix of content THEMES they've published + gaps (e.g. no storefront/people shots). Use for "what am I posting about?", "what am I missing?".
- "audit": what their PHOTO LIBRARY is made of (shot-type mix) + gaps. Use for "what kind of photos do I have?".
- "mediaSearch": find photos in their library by what's IN them (pass "search", e.g. "storefront", "green dress"). Use for "find my photos of X".
- "bestTime": the best times to post, from the store's OWN past performance (falls back to platform research when sparse, and says so). Pass "integrationId" for a specific channel, else the first channel is used. Use for "when should I post?".
- "brand": the store's established brand voice profile. Use for "what's my brand voice?".
After you get the result, SUMMARIZE it for the owner in plain language; prefer the "narrative" field when present. Never invent numbers not in the result.`,
      mcp: {
        annotations: {
          title: 'Store Insights',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({
        kind: z.enum([
          'cadence',
          'coverage',
          'audit',
          'mediaSearch',
          'bestTime',
          'brand',
        ]),
        days: z.number().optional().describe('Window in days (cadence/coverage; default 90).'),
        integrationId: z
          .string()
          .optional()
          .describe('Channel id for bestTime; omit to use the first channel.'),
        search: z.string().optional().describe('Search term for mediaSearch.'),
        tz: z
          .string()
          .optional()
          .describe('IANA timezone for time-of-day analysis (default UTC).'),
      }),
      outputSchema: z.object({
        result: z.any().optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const org = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        );
        const orgId = org.id;
        const { kind, days, integrationId, search, tz } = inputData as {
          kind: string;
          days?: number;
          integrationId?: string;
          search?: string;
          tz?: string;
        };
        try {
          switch (kind) {
            case 'cadence': {
              const r = await this._cadence.cadence(orgId, { days, tz });
              // drop the 7x24 heatmap from the agent payload — too bulky to reason over
              return {
                result: {
                  window: r.window,
                  totalPosts: r.totalPosts,
                  perChannel: r.perChannel,
                  narrative: r.narrative,
                },
              };
            }
            case 'coverage': {
              const r = await this._coverage.coverage(orgId, days);
              return {
                result: {
                  window: r.window,
                  totalPosts: r.totalPosts,
                  totalThemed: r.totalThemed,
                  pendingClassification: r.pendingClassification,
                  mix: r.mix,
                  gaps: r.gaps,
                  narrative: r.narrative,
                },
              };
            }
            case 'audit': {
              return { result: await this._media.contentAudit(orgId) };
            }
            case 'mediaSearch': {
              if (!search) {
                return { error: 'Provide a "search" term for mediaSearch.' };
              }
              const r: any = await this._media.getMedia(orgId, 1, search);
              const results = (r?.results || []).map((m: any) => ({
                id: m.id,
                name: m.originalName || m.name,
                aiCategory: m.aiCategory,
                aiLabels: m.aiLabels,
              }));
              return { result: { count: results.length, results } };
            }
            case 'bestTime': {
              let iid = integrationId;
              if (!iid) {
                const integ = await this._integration.model.integration.findFirst(
                  {
                    where: {
                      organizationId: orgId,
                      deletedAt: null,
                      disabled: false,
                    },
                    select: { id: true },
                  }
                );
                iid = integ?.id;
              }
              if (!iid) {
                return { error: 'No channel found to compute best times for.' };
              }
              const r = await this._bestTime.bestTimes(orgId, iid, tz);
              if (!r) {
                return { error: 'Channel not found.' };
              }
              return {
                result: {
                  integration: r.integration,
                  provider: r.provider,
                  source: r.source,
                  scoredPosts: r.scoredPosts,
                  topTimes: r.topTimes,
                  narrative: r.narrative,
                },
              };
            }
            case 'brand': {
              const [profile, contextPreview] = await Promise.all([
                this._brandProfile.get(orgId),
                this._brandContext.build(orgId),
              ]);
              return {
                result: {
                  profile: profile
                    ? {
                        voice: profile.voice,
                        audience: profile.audience,
                        pillars: profile.pillars,
                        factsMarkdown: profile.factsMarkdown,
                      }
                    : null,
                  hasBrandContext: !!contextPreview,
                },
              };
            }
            default:
              return { error: `Unknown insights kind: ${kind}` };
          }
        } catch (err) {
          return {
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    });
  }
}
