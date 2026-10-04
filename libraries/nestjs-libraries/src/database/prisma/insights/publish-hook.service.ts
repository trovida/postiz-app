import { Injectable, Logger } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';

function strip(s: string | null): string {
  return (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Deferred item #1 — on-publish auto-hook. Runs ONCE per successful publish
// (PostsService.updatePost is the single publish-completion funnel every
// orchestrator post-workflow version routes through), fire-and-forget:
//   - classify the post's content theme -> Post.aiTheme/aiThemeAt (keeps the
//     coverage/#2 panel fresh without waiting for a backfill)
//   - upsert the post into the brand exemplar pool (keeps the brand copilot/#4
//     grounded on the latest voice without waiting for a backfill)
// Gated on ENABLE_INSIGHTS; fully fail-soft — a publish must never be affected
// by an insights hiccup. One DeepSeek call per publish (publishes are
// low-frequency), mirroring the media saveFile analyze hook.
@Injectable()
export class PublishHookService {
  private readonly _logger = new Logger(PublishHookService.name);

  constructor(
    private _post: PrismaRepository<'post'>,
    private _brandExemplar: PrismaRepository<'brandExemplar'>,
    private _openAi: OpenaiService
  ) {}

  enabled() {
    return process.env.ENABLE_INSIGHTS === 'true';
  }

  // Fire-and-forget: callers invoke `void onPublished(postId)` and never await.
  async onPublished(postId: string): Promise<void> {
    if (!this.enabled()) {
      return;
    }
    try {
      const post = await this._post.model.post.findUnique({
        where: { id: postId },
        select: {
          id: true,
          organizationId: true,
          integrationId: true,
          content: true,
          publishDate: true,
          aiTheme: true,
        },
      });
      if (!post) {
        return;
      }
      const content = strip(post.content);
      if (!content) {
        return;
      }

      // 1) classify theme (skip if already themed — republishes shouldn't re-spend)
      let theme = post.aiTheme;
      if (!theme) {
        theme = await this._openAi.classifyTextTheme(content);
        if (theme) {
          await this._post.model.post.update({
            where: { id: post.id },
            data: { aiTheme: theme, aiThemeAt: new Date() },
          });
        }
      }

      // 2) upsert into the exemplar pool (engagementScore is synced later by the
      //    snapshot job / #2; recency-ranked until then)
      await this._brandExemplar.model.brandExemplar.upsert({
        where: { postId: post.id },
        create: {
          organizationId: post.organizationId,
          postId: post.id,
          integrationId: post.integrationId,
          category: theme,
          content,
          publishDate: post.publishDate,
        },
        update: { content, category: theme },
      });
    } catch (e) {
      this._logger.warn(
        `onPublished(${postId}) failed: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
  }
}
