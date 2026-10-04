import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

// Pillar D / #4 — assemble a bounded brand-context string (profile + top
// exemplars) to thread into the generator prompts (exactly like the generator
// threads visionContext). Lexical/SQL retrieval: exemplars ranked by engagement
// (nulls last) then recency. Returns '' when the org has no brand data.
@Injectable()
export class BrandContextService {
  constructor(
    private _brandProfile: PrismaRepository<'brandProfile'>,
    private _brandExemplar: PrismaRepository<'brandExemplar'>
  ) {}

  async build(orgId: string): Promise<string> {
    const [profile, exemplars] = await Promise.all([
      this._brandProfile.model.brandProfile.findUnique({
        where: { organizationId: orgId },
      }),
      this._brandExemplar.model.brandExemplar.findMany({
        where: { organizationId: orgId },
        orderBy: [{ engagementScore: 'desc' }, { publishDate: 'desc' }],
        take: 5,
      }),
    ]);

    if (!profile && !exemplars.length) {
      return '';
    }

    const parts: string[] = [];
    if (profile) {
      if (profile.name) parts.push(`Shop: ${profile.name}`);
      if (profile.voice) parts.push(`Brand voice: ${profile.voice}`);
      if (profile.audience) parts.push(`Audience: ${profile.audience}`);
      const pillars = profile.pillars as string[] | null;
      if (pillars?.length) parts.push(`Recurring themes: ${pillars.join(', ')}`);
      const banned = profile.bannedPhrases as string[] | null;
      if (banned?.length) parts.push(`Avoid these words/phrases: ${banned.join(', ')}`);
      if (profile.factsMarkdown) parts.push(`Key facts:\n${profile.factsMarkdown}`);
    }
    if (exemplars.length) {
      parts.push(
        "Examples of the shop's own past posts (match this voice, don't copy them):\n" +
          exemplars
            .map((e, i) => `${i + 1}. ${e.content.slice(0, 280)}`)
            .join('\n')
      );
    }

    return parts.join('\n\n').slice(0, 4000);
  }
}
