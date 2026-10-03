import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { parseStructured } from '@gitroom/nestjs-libraries/openai/ai.provider';

const summarySchema = z.object({
  headline: z.string(),
  bullets: z.array(z.string()),
});

export type InsightKind =
  | 'content'
  | 'cadence'
  | 'coverage'
  | 'besttime'
  | 'brand';

// Shared primitive for the Insights layer: turn pre-computed SQL facts into a
// short plain-English read. The model ONLY narrates — it may never introduce a
// figure that isn't already in `facts` (the UI renders the raw numbers beside
// this, so the prose is a convenience, never the source of truth). Returns null
// on any failure so the panel still renders from the facts alone.
@Injectable()
export class InsightSummaryService {
  private readonly _logger = new Logger(InsightSummaryService.name);

  async summarize(
    kind: InsightKind,
    facts: Record<string, any>
  ): Promise<{ headline: string; bullets: string[] } | null> {
    try {
      const result = await parseStructured(
        {
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You turn pre-computed social-media analytics for a single brick-and-mortar retailer into a short, plain-English read for the shop owner.
Hard rules:
- Use ONLY numbers that appear in the provided JSON facts. NEVER invent, estimate, extrapolate, or introduce any figure not present in the facts.
- Talk to the owner directly — warm, concrete, like a helpful shop assistant, not a dashboard.
- No guilt or shame, no hype, no comparisons to other businesses.
- "headline": exactly one sentence. "bullets": 2-4 short, specific, actionable observations, each grounded in a fact above.
- If the facts show little or no activity, say so plainly and encouragingly.
Context kind: ${kind}.`,
            },
            {
              role: 'user',
              content: `Facts (JSON):\n${JSON.stringify(facts)}`,
            },
          ],
        },
        summarySchema,
        'insight_summary',
        { timeout: 30_000, maxRetries: 1 }
      );
      return result ?? null;
    } catch (err) {
      this._logger.warn(
        `insight summary (${kind}) failed, rendering facts only: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return null;
    }
  }
}
