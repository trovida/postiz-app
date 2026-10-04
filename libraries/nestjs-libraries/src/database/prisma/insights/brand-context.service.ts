import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { aiEmbeddingsEnabled } from '@gitroom/nestjs-libraries/openai/ai.provider';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Exemplar = any;

const STOP = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'our', 'are', 'was', 'this',
  'that', 'from', 'have', 'has', 'but', 'not', 'all', 'can', 'out', 'get',
  'new', 'now', 'post', 'about', 'write', 'make', 'shop', 'store',
]);

function tokenize(s: string): Set<string> {
  const words = (s || '')
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase()
    .match(/[a-z0-9]{3,}/g);
  const set = new Set<string>();
  for (const w of words || []) {
    if (!STOP.has(w)) set.add(w);
  }
  return set;
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Pillar D / #4 — assemble a bounded brand-context string (profile + top
// exemplars) to thread into the generator prompts (exactly like the generator
// threads visionContext). Returns '' when the org has no brand data.
//
// Retrieval ladder (deferred #3): when a draft topic (query) is provided —
//   • embeddings configured  -> BGE-M3 (or any OpenAI-compatible) cosine rank
//   • else                   -> lexical topic-overlap rank
// so the generator grounds on the shop's past posts ABOUT that topic. With no
// query (e.g. the brand panel / brand agent-tool) it keeps the original
// engagement-desc-then-recency order, so default behaviour is unchanged.
@Injectable()
export class BrandContextService {
  constructor(
    private _brandProfile: PrismaRepository<'brandProfile'>,
    private _brandExemplar: PrismaRepository<'brandExemplar'>,
    private _openAi: OpenaiService
  ) {}

  async build(orgId: string, query?: string): Promise<string> {
    const [profile, exemplars] = await Promise.all([
      this._brandProfile.model.brandProfile.findUnique({
        where: { organizationId: orgId },
      }),
      // pull a wider candidate set (still in engagement/recency order) so a
      // query can re-rank within it; no query => the first 5 are the old result.
      this._brandExemplar.model.brandExemplar.findMany({
        where: { organizationId: orgId },
        orderBy: [{ engagementScore: 'desc' }, { publishDate: 'desc' }],
        take: 24,
      }),
    ]);

    if (!profile && !exemplars.length) {
      return '';
    }

    let chosen: Exemplar[] = exemplars;
    const q = (query || '').trim();
    if (q && exemplars.length > 5) {
      try {
        chosen = aiEmbeddingsEnabled()
          ? await this._rankBySemantic(exemplars, q)
          : this._rankByLexical(exemplars, q);
      } catch {
        chosen = exemplars; // any ranking failure -> safe default order
      }
    }
    const top = chosen.slice(0, 5);

    const parts: string[] = [];
    if (profile) {
      if (profile.name) parts.push(`Shop: ${profile.name}`);
      if (profile.voice) parts.push(`Brand voice: ${profile.voice}`);
      if (profile.audience) parts.push(`Audience: ${profile.audience}`);
      const pillars = profile.pillars as string[] | null;
      if (pillars?.length) parts.push(`Recurring themes: ${pillars.join(', ')}`);
      const banned = profile.bannedPhrases as string[] | null;
      if (banned?.length)
        parts.push(`Avoid these words/phrases: ${banned.join(', ')}`);
      if (profile.factsMarkdown) parts.push(`Key facts:\n${profile.factsMarkdown}`);
    }
    if (top.length) {
      parts.push(
        "Examples of the shop's own past posts (match this voice, don't copy them):\n" +
          top.map((e, i) => `${i + 1}. ${e.content.slice(0, 280)}`).join('\n')
      );
    }

    return parts.join('\n\n').slice(0, 4000);
  }

  // Cosine rank over cached embeddings; lazily computes + persists any missing
  // (bounded by the 24-candidate cap). Falls back to lexical if the query embed
  // fails. Only reached when aiEmbeddingsEnabled().
  private async _rankBySemantic(
    exemplars: Exemplar[],
    query: string
  ): Promise<Exemplar[]> {
    const missing = exemplars.filter((e) => !Array.isArray(e.embedding));
    if (missing.length) {
      const vecs = await this._openAi.embedTexts(
        missing.map((m) => String(m.content).slice(0, 2000))
      );
      await Promise.all(
        missing.map((m, i) => {
          const v = vecs[i];
          if (!v) return Promise.resolve();
          m.embedding = v;
          return this._brandExemplar.model.brandExemplar
            .update({
              where: { id: m.id },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              data: { embedding: v as any },
            })
            .catch(() => undefined);
        })
      );
    }
    const qv = await this._openAi.embedText(query);
    if (!qv) {
      return this._rankByLexical(exemplars, query);
    }
    return [...exemplars]
      .map((e, i) => ({
        e,
        i,
        s: Array.isArray(e.embedding) ? cosine(qv, e.embedding as number[]) : -1,
      }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.e);
  }

  // Topic-overlap rank; ties (incl. all-zero overlap) keep the original
  // engagement/recency order via the stable index.
  private _rankByLexical(exemplars: Exemplar[], query: string): Exemplar[] {
    const qt = tokenize(query);
    if (!qt.size) return exemplars;
    return [...exemplars]
      .map((e, i) => {
        const et = tokenize(String(e.content));
        let overlap = 0;
        for (const t of qt) if (et.has(t)) overlap++;
        return { e, i, s: overlap };
      })
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.e);
  }
}
