import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { aiVisionEnabled } from '@gitroom/nestjs-libraries/openai/ai.provider';

@Injectable()
export class DescribeImageTool implements AgentToolInterface {
  constructor(private _mediaService: MediaService) {}
  name = 'describeImageTool';

  // Left out everywhere when no vision model is configured.
  available() {
    return aiVisionEnabled();
  }

  run() {
    return createTool({
      id: 'describeImageTool',
      description: `Look at a photo the user uploaded and get a factual description of what is in it, so you can write a caption about the real photo.
Use this whenever the user's message contains an uploaded image (its URL appears inside a "[--Media--]Image: <url>[--Media--]" marker, or was returned by an upload tool) and they ask for a caption for it, or ask what is in it.
Pass that exact image URL. After you get the description back, YOU write the caption in the right voice and platform format - do not just repeat the description.`,
      mcp: {
        annotations: {
          title: 'Describe Image',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      inputSchema: z.object({
        imageUrl: z
          .string()
          .describe(
            'URL of an image already uploaded to this workspace (from the message [--Media--] marker, or returned by an upload tool).'
          ),
        question: z
          .string()
          .optional()
          .describe(
            'Optional: what to focus on; defaults to a full description for caption writing.'
          ),
      }),
      // Mastra validates the return against this schema, so it must also allow
      // the graceful { error } shape (same convention as the other tools).
      outputSchema: z.object({
        description: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const org = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        );
        try {
          const description = await this._mediaService.describeImageUrl(
            org.id,
            inputData.imageUrl,
            inputData.question
          );
          return { description };
        } catch (err) {
          return {
            error: `Could not read the image: ${
              err instanceof Error ? err.message : String(err)
            }`,
          };
        }
      },
    });
  }
}
