import { Injectable } from '@nestjs/common';
import { shuffle } from 'lodash';
import { z } from 'zod';
import { SHOT_TYPES } from '@gitroom/nestjs-libraries/database/prisma/insights/content-taxonomy';
import {
  getTextClient,
  getImageClient,
  getVisionClient,
  textModel,
  imageModel,
  visionModel,
  aiImageEnabled,
  aiVisionEnabled,
  parseStructured,
} from '@gitroom/nestjs-libraries/openai/ai.provider';

const PicturePrompt = z.object({
  prompt: z.string(),
});

const VoicePrompt = z.object({
  voice: z.string(),
});

const ClipsPrompt = z.object({
  clips: z.array(
    z.object({
      from: z.number().describe('Number of the first line of the clip'),
      to: z.number().describe('Number of the last line of the clip'),
      title: z.string().describe('Short title of the clip'),
      content: z
        .string()
        .describe('Social media post to publish the clip with, no hashtags'),
    })
  ),
});

@Injectable()
export class OpenaiService {
  // The model answers with line numbers and not times, so a clip can only
  // start and end where the transcript really has a boundary
  async pickClips(
    title: string,
    language: string,
    segments: { start: number; end: number; text: string }[],
    maxClips: number
  ) {
    const result = await parseStructured(
      {
        model: 'gpt-4.1',
        messages: [
          {
            role: 'system',
            content: `You are an assistant that takes the transcript of a video and picks the parts that will work best as short vertical clips for social media.
Every line of the transcript is "number [start seconds - end seconds] text".
Pick up to ${maxClips} clips, best first. A clip is a range of consecutive lines that starts with a hook, makes one complete point and is understandable without the rest of the video.
The length of a clip is the end of its last line minus the start of its first line: it must be between 20 and 90 seconds, never longer, so check the numbers before answering.
Clips must not overlap. Write the title and the post in this language, whatever the language of these instructions: ${language}.`,
          },
          {
            role: 'user',
            content: `title: ${title}\n\n${segments
              .map(
                (p, index) =>
                  `${index} [${p.start.toFixed(1)} - ${p.end.toFixed(1)}] ${
                    p.text
                  }`
              )
              .join('\n')}`,
          },
        ],
      },
      ClipsPrompt,
      'clipsPrompt',
      // shorter than the activity: an attempt that was given up on must not
      // still be running, and storing clips, when its retry gets there
      { timeout: 8 * 60 * 1000, maxRetries: 0 }
    );

    return (result || { clips: [] }).clips;
  }

  // Image UNDERSTANDING (factual): return a plain description of what is in an
  // image, so a caller (e.g. the chat agent) can then write copy about it. For
  // a ready-to-post caption in one call, use describeImageToCaption instead.
  async describeImage(image: string, question?: string): Promise<string> {
    if (!aiVisionEnabled()) {
      throw new Error(
        'AI vision is not configured (set AI_VISION_MODEL — and AI_VISION_API_KEY / AI_VISION_BASE_URL if different from the text provider — to a vision-capable OpenAI-compatible model).'
      );
    }
    const response = await getVisionClient().chat.completions.create(
      {
        model: visionModel(),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  question ||
                  'Describe this photo in detail so a copywriter can caption it: the main subjects, the setting, the mood, the colours, and any clearly readable text or logos. Be factual and concrete — describe only what is visible, and never invent details. 3-5 sentences.',
              },
              { type: 'image_url', image_url: { url: image } },
            ],
          },
        ],
      },
      { timeout: 60_000, maxRetries: 1 }
    );
    return (response.choices[0]?.message?.content || '').trim();
  }

  // Structured image analysis for the content-mix audit + auto-tagged library
  // (Pillar A / #1): classify a photo into one controlled retail shot-type +
  // accessibility alt-text + a few searchable labels. `image` is a base64 data
  // URI. Returns null if the model's output can't be parsed/validated.
  async analyzeImageStructured(
    image: string
  ): Promise<{ category: string; altText: string; labels: string[] } | null> {
    if (!aiVisionEnabled()) {
      throw new Error(
        'AI vision is not configured (set AI_VISION_MODEL — and AI_VISION_API_KEY / AI_VISION_BASE_URL if different from the text provider — to a vision-capable OpenAI-compatible model).'
      );
    }

    const schema = z.object({
      category: z.enum(SHOT_TYPES as unknown as [string, ...string[]]),
      altText: z.string(),
      labels: z.array(z.string()),
    });

    const response = await getVisionClient().chat.completions.create(
      {
        model: visionModel(),
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  `Analyze this retail photo. Respond with ONLY a single JSON object (no prose, no markdown fences) with exactly these keys:\n` +
                  `- "category": the single best-fitting shot type, one of: ${SHOT_TYPES.join(
                    ', '
                  )}. Use "other" if none clearly fits.\n` +
                  `- "altText": factual accessibility alt-text, <= 160 characters, describing only what is visible.\n` +
                  `- "labels": an array of 3-8 lowercase search terms (objects, colours, setting). No sentences.\n` +
                  `Describe only what is visible; never invent details.`,
              },
              { type: 'image_url', image_url: { url: image } },
            ],
          },
        ],
      },
      { timeout: 60_000, maxRetries: 1 }
    );

    const raw = response.choices[0]?.message?.content ?? '';
    try {
      const cleaned = raw
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '');
      const parsed = schema.parse(JSON.parse(cleaned));
      return {
        category: parsed.category,
        altText: (parsed.altText || '').slice(0, 200),
        labels: (parsed.labels || []).slice(0, 8),
      };
    } catch {
      return null;
    }
  }

  // Classify a retailer's post TEXT into one content theme (the fallback for
  // the coverage insight when a post has no analyzed image). Reuses the same
  // 12-type taxonomy, which doubles as a content vocabulary (a sale = signage_
  // promo, a staff intro = people_staff, an event = event). Returns null when
  // there's no usable text or the output can't be parsed.
  async classifyTextTheme(text: string): Promise<string | null> {
    const clean = (text || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2000);
    if (!clean) {
      return null;
    }
    const schema = z.object({
      category: z.enum(SHOT_TYPES as unknown as [string, ...string[]]),
    });
    const r = await parseStructured(
      {
        model: 'gpt-4.1',
        messages: [
          {
            role: 'system',
            content:
              `Classify a retailer's social-media post text into the single best content theme, one of: ${SHOT_TYPES.join(
                ', '
              )}. ` +
              `These categories double as content themes — e.g. a sale/discount announcement = signage_promo, a staff or owner intro = people_staff, an event = event, a product highlight = product_closeup or product_styled. Use "other" if none clearly fits.`,
          },
          { role: 'user', content: clean },
        ],
      },
      schema,
      'post_theme',
      { timeout: 20_000, maxRetries: 1 }
    );
    return (r?.category as string) ?? null;
  }

  // Image UNDERSTANDING: look at an uploaded photo and write a ready-to-post
  // caption about what it actually shows. `image` is a base64 data URI (the
  // caller inlines the bytes so the vision host never has to fetch our URL).
  async describeImageToCaption(
    image: string,
    opts: { tone?: string; instructions?: string; context?: string } = {}
  ): Promise<string> {
    if (!aiVisionEnabled()) {
      throw new Error(
        'AI vision is not configured (set AI_VISION_MODEL — and AI_VISION_API_KEY / AI_VISION_BASE_URL if different from the text provider — to a vision-capable OpenAI-compatible model).'
      );
    }
    const tone = opts.tone || 'casual';
    const instruction =
      `Write the caption in a ${tone} tone.` +
      (opts.instructions ? ` ${opts.instructions}` : '') +
      (opts.context
        ? ` Match the voice of this existing draft: """${opts.context}"""`
        : '');

    const response = await getVisionClient().chat.completions.create(
      {
        model: visionModel(),
        messages: [
          {
            role: 'system',
            content:
              'You are a social media copywriter. Look at the image and write ONE ready-to-post caption about what it actually shows. Be factual — describe only what is clearly visible, and never invent brand names, prices, readable text, or details you cannot see. Reply with the caption only: no preamble, no surrounding quotes, and no hashtags unless asked.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: instruction },
              { type: 'image_url', image_url: { url: image } },
            ],
          },
        ],
      },
      { timeout: 60_000, maxRetries: 1 }
    );

    return (response.choices[0]?.message?.content || '').trim();
  }

  async generateImage(prompt: string, isVertical = false) {
    if (!aiImageEnabled()) {
      throw new Error(
        'AI image generation is not configured (set AI_IMAGE_API_KEY / AI_IMAGE_BASE_URL / AI_IMAGE_MODEL to an OpenAI-Images-compatible provider).'
      );
    }
    // OpenAI gpt-image models always return base64 (b64_json) and do not accept
    // the `response_format` parameter, unlike the deprecated dall-e-3. Other
    // OpenAI-Images-compatible providers (e.g. DeepInfra) also default to
    // b64_json; Together needs response_format:"b64_json" set via env/model.
    const generate = (
      await getImageClient().images.generate({
        prompt,
        model: imageModel(),
        size: isVertical ? '1024x1536' : '1024x1024',
      })
    ).data[0];

    return generate.b64_json;
  }

  async generatePromptForPicture(prompt: string) {
    const result = await parseStructured(
      {
        model: 'gpt-4.1',
        messages: [
          {
            role: 'system',
            content: `You are an assistant that take a description and style and generate a prompt that will be used later to generate images, make it a very long and descriptive explanation, and write a lot of things for the renderer like, if it${"'"}s realistic describe the camera`,
          },
          {
            role: 'user',
            content: `prompt: ${prompt}`,
          },
        ],
      },
      PicturePrompt,
      'picturePrompt'
    );

    return result?.prompt || '';
  }

  async generateVoiceFromText(prompt: string) {
    const result = await parseStructured(
      {
        model: 'gpt-4.1',
        messages: [
          {
            role: 'system',
            content: `You are an assistant that takes a social media post and convert it to a normal human voice, to be later added to a character, when a person talk they don\'t use "-", and sometimes they add pause with "..." to make it sounds more natural, make sure you use a lot of pauses and make it sound like a real person`,
          },
          {
            role: 'user',
            content: `prompt: ${prompt}`,
          },
        ],
      },
      VoicePrompt,
      'voice'
    );

    return result?.voice || '';
  }

  async generatePosts(content: string) {
    const client = getTextClient();
    const model = textModel('gpt-4.1');
    const posts = (
      await Promise.all([
        client.chat.completions.create({
          messages: [
            {
              role: 'assistant',
              content:
                'Generate a Twitter post from the content without emojis in the following JSON format: { "post": string } put it in an array with one element',
            },
            {
              role: 'user',
              content: content!,
            },
          ],
          n: 5,
          temperature: 1,
          model,
        }),
        client.chat.completions.create({
          messages: [
            {
              role: 'assistant',
              content:
                'Generate a thread for social media in the following JSON format: Array<{ "post": string }> without emojis',
            },
            {
              role: 'user',
              content: content!,
            },
          ],
          n: 5,
          temperature: 1,
          model,
        }),
      ])
    ).flatMap((p) => p.choices);

    return shuffle(
      posts.map((choice) => {
        const { content } = choice.message;
        const start = content?.indexOf('[')!;
        const end = content?.lastIndexOf(']')!;
        try {
          return JSON.parse(
            '[' +
              content
                ?.slice(start + 1, end)
                .replace(/\n/g, ' ')
                .replace(/ {2,}/g, ' ') +
              ']'
          );
        } catch (e) {
          return [];
        }
      })
    );
  }
  async extractWebsiteText(content: string) {
    const websiteContent = await getTextClient().chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            'You take a full website text, and extract only the article content',
        },
        {
          role: 'user',
          content,
        },
      ],
      model: textModel('gpt-4.1'),
    });

    const { content: articleContent } = websiteContent.choices[0].message;

    return this.generatePosts(articleContent!);
  }

  async separatePosts(content: string, len: number) {
    const SeparatePostsPrompt = z.object({
      posts: z.array(z.string()),
    });

    const SeparatePostPrompt = z.object({
      post: z.string().max(len),
    });

    const posts =
      (
        await parseStructured(
          {
            model: 'gpt-4.1',
            messages: [
              {
                role: 'system',
                content: `You are an assistant that take a social media post and break it to a thread, each post must be minimum ${
                  len - 10
                } and maximum ${len} characters, keeping the exact wording and break lines, however make sure you split posts based on context`,
              },
              {
                role: 'user',
                content: content,
              },
            ],
          },
          SeparatePostsPrompt,
          'separatePosts'
        )
      )?.posts || [];

    return {
      posts: await Promise.all(
        posts.map(async (post: any) => {
          if (post.length <= len) {
            return post;
          }

          let retries = 4;
          while (retries) {
            try {
              return (
                (
                  await parseStructured(
                    {
                      model: 'gpt-4.1',
                      messages: [
                        {
                          role: 'system',
                          content: `You are an assistant that take a social media post and shrink it to be maximum ${len} characters, keeping the exact wording and break lines`,
                        },
                        {
                          role: 'user',
                          content: post,
                        },
                      ],
                    },
                    SeparatePostPrompt,
                    'separatePost'
                  )
                )?.post || ''
              );
            } catch (e) {
              retries--;
            }
          }

          return post;
        })
      ),
    };
  }

  async generateSlidesFromText(text: string) {
    for (let i = 0; i < 3; i++) {
      try {
        const message = `You are an assistant that takes a text and break it into slides, each slide should have an image prompt and voice text to be later used to generate a video and voice, image prompt should capture the essence of the slide and also have a back dark gradient on top, image prompt should not contain text in the picture, generate between 3-5 slides maximum`;
        const parse =
          (
            await parseStructured(
              {
                model: 'gpt-4.1',
                messages: [
                  {
                    role: 'system',
                    content: message,
                  },
                  {
                    role: 'user',
                    content: text,
                  },
                ],
              },
              z.object({
                slides: z
                  .array(
                    z.object({
                      imagePrompt: z.string(),
                      voiceText: z.string(),
                    })
                  )
                  .describe('an array of slides'),
              }),
              'slides'
            )
          )?.slides || [];

        return parse;
      } catch (err) {
        console.log(err);
      }
    }

    return [];
  }
}
