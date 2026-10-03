import { Injectable } from '@nestjs/common';
import {
  BaseMessage,
  HumanMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { END, START, StateGraph } from '@langchain/langgraph';
import {
  aiVisionEnabled,
  getLangchainChat,
  getLangchainImage,
  getLangchainStructured,
} from '@gitroom/nestjs-libraries/openai/ai.provider';
import { TavilySearch } from '@langchain/tavily';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import dayjs from 'dayjs';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { z } from 'zod';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { GeneratorDto } from '@gitroom/nestjs-libraries/dtos/generator/generator.dto';
import { generationError } from '@gitroom/nestjs-libraries/openai/generation.error';

const tools = !process.env.TAVILY_API_KEY
  ? []
  : [new TavilySearch({ maxResults: 3 })];
const toolNode = new ToolNode(tools);

const model = getLangchainChat('gpt-4.1', { temperature: 0.7 });

const dalle = getLangchainImage();

interface WorkflowChannelsState {
  messages: BaseMessage[];
  orgId: string;
  question: string;
  hook?: string;
  fresearch?: string;
  category?: string;
  topic?: string;
  date?: string;
  format: 'one_short' | 'one_long' | 'thread_short' | 'thread_long';
  tone: 'personal' | 'company';
  content?: {
    content: string;
    website?: string;
    prompt?: string;
    image?: string;
  }[];
  isPicture?: boolean;
  popularPosts?: { content: string; hook: string }[];
  // Phase 3 (vision): photos the user attached to the generator (input),
  // the resolved media rows to attach to the output, and the concatenated
  // factual descriptions threaded into research/hook/content.
  pictures?: { id: string }[];
  userMedia?: { id: string; path: string }[];
  visionContext?: string;
}

const category = z.object({
  category: z.string().describe('The category for the post'),
});

const topic = z.object({
  topic: z.string().describe('The topic for the post'),
});

const hook = z.object({
  hook: z
    .string()
    .describe(
      'Hook for the new post, don\'t take it from "the request of the user"'
    ),
});

const contentZod = (
  isPicture: boolean,
  format: 'one_short' | 'one_long' | 'thread_short' | 'thread_long'
) => {
  const content = z.object({
    content: z.string().describe('Content for the new post'),
    website: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Website for the new post if exists, If one of the post present a brand, website link must be to the root domain of the brand or don't include it, website url should contain the brand name"
      ),
    ...(isPicture
      ? {
          prompt: z
            .string()
            .describe(
              "Prompt to generate a picture for this post later, make sure it doesn't contain brand names and make it very descriptive in terms of style"
            ),
        }
      : {}),
  });

  return z.object({
    content:
      format === 'one_short' || format === 'one_long'
        ? content
        : z.array(content).min(2).describe(`Content for the new post`),
  });
};

@Injectable()
export class AgentGraphService {
  private storage = UploadFactory.createStorage();
  constructor(
    private _postsService: PostsService,
    private _mediaService: MediaService
  ) {}
  static state = () =>
    new StateGraph<WorkflowChannelsState>({
      channels: {
        messages: {
          reducer: (currentState, updateValue) =>
            currentState.concat(updateValue),
          default: () => [],
        },
        fresearch: null,
        format: null,
        tone: null,
        question: null,
        orgId: null,
        hook: null,
        content: null,
        date: null,
        category: null,
        popularPosts: null,
        topic: null,
        isPicture: null,
        pictures: null,
        userMedia: null,
        visionContext: null,
      },
    });

  // Phase 3: look at each photo the user attached and pull a factual
  // description out of it, so the rest of the graph can write the post around
  // what's actually in the photo. No-op (and skips the vision host entirely)
  // when nothing was attached or no vision model is configured — the text-only
  // generator flow is unchanged. A photo that fails to read is dropped, never
  // fatal.
  async describePictures(state: WorkflowChannelsState) {
    if (!state.pictures?.length || !aiVisionEnabled()) {
      return {};
    }

    const described = await Promise.all(
      state.pictures.map(async (p) => {
        try {
          const { description, media } =
            await this._mediaService.describeMediaById(state.orgId, p.id);
          return { media, description };
        } catch {
          return null;
        }
      })
    );

    const ok = described.filter(
      (d): d is { media: { id: string; path: string }; description: string } =>
        !!d && !!d.description
    );
    if (!ok.length) {
      return {};
    }

    const visionContext = ok
      .map((d, i) => `Attached photo ${i + 1}: ${d.description}`)
      .join('\n\n');

    return { visionContext, userMedia: ok.map((d) => d.media) };
  }

  async startCall(state: WorkflowChannelsState) {
    const runTools = model.bindTools(tools);
    const response = await ChatPromptTemplate.fromTemplate(
      `
    Today is ${dayjs().format()}, You are an assistant that gets a social media post or requests for a social media post.
    You research should be on the most possible recent data.
    You concat the text of the request together with an internet research based on the text.
    {text}
    {photos}
    `
    )
      .pipe(runTools)
      .invoke({
        text: state.messages[state.messages.length - 1].content,
        photos: state.visionContext
          ? `The user attached photo(s). Here is what is actually in them — treat this as part of the request and research/write around it:\n${state.visionContext}`
          : '',
      });

    return { messages: [response] };
  }

  async saveResearch(state: WorkflowChannelsState) {
    const content = state.messages.filter((f) => f instanceof ToolMessage);
    return { fresearch: content };
  }

  async findCategories(state: WorkflowChannelsState) {
    const allCategories = await this._postsService.findAllExistingCategories();
    const structuredOutput = getLangchainStructured(model, category, 'category');
    const { category: outputCategory } = await ChatPromptTemplate.fromTemplate(
      `
        You are an assistant that gets a text that will be later summarized into a social media post
        and classify it to one of the following categories: {categories}
        text: {text}
      `
    )
      .pipe(structuredOutput)
      .invoke({
        categories: allCategories.map((p) => p.category).join(', '),
        text: state.fresearch,
      });

    return {
      category: outputCategory,
    };
  }

  async findTopic(state: WorkflowChannelsState) {
    const allTopics = await this._postsService.findAllExistingTopicsOfCategory(
      state?.category!
    );
    if (allTopics.length === 0) {
      return { topic: null };
    }

    const structuredOutput = getLangchainStructured(model, topic, 'topic');
    const { topic: outputTopic } = await ChatPromptTemplate.fromTemplate(
      `
        You are an assistant that gets a text that will be later summarized into a social media post
        and classify it to one of the following topics: {topics}
        text: {text}
      `
    )
      .pipe(structuredOutput)
      .invoke({
        topics: allTopics.map((p) => p.topic).join(', '),
        text: state.fresearch,
      });

    return {
      topic: outputTopic,
    };
  }

  async findPopularPosts(state: WorkflowChannelsState) {
    const popularPosts = await this._postsService.findPopularPosts(
      state.category!,
      state.topic
    );
    return { popularPosts };
  }

  async generateHook(state: WorkflowChannelsState) {
    const structuredOutput = getLangchainStructured(model, hook, 'hook');
    const { hook: outputHook } = await ChatPromptTemplate.fromTemplate(
      `
        You are an assistant that gets content for a social media post, and generate only the hook.
        The hook is the 1-2 sentences of the post that will be used to grab the attention of the reader.
        You will be provided existing hooks you should use as inspiration.
        - Avoid weird hook that starts with "Discover the secret...", "The best...", "The most...", "The top..."
        - Make sure it sounds ${state.tone}
        - Use ${state.tone === 'personal' ? '1st' : '3rd'} person mode
        - Make sure it's engaging
        - Don't be cringy
        - Use simple english
        - Make sure you add "\n" between the lines
        - Don't take the hook from "request of the user"

        <!-- BEGIN request of the user -->
        {request}
        <!-- END request of the user -->
        
        <!-- BEGIN existing hooks -->
        {hooks}
        <!-- END existing hooks -->
        
        <!-- BEGIN current content -->
        {text}
        <!-- END current content -->

        {photos}

      `
    )
      .pipe(structuredOutput)
      .invoke({
        request: state.messages[0].content,
        hooks: state.popularPosts!.map((p) => p.hook).join('\n'),
        text: state.fresearch,
        photos: state.visionContext
          ? `<!-- BEGIN attached photo(s) -->\nThe post will show these photo(s); make the hook fit what's actually in them:\n${state.visionContext}\n<!-- END attached photo(s) -->`
          : '',
      });

    return {
      hook: outputHook,
    };
  }

  async generateContent(state: WorkflowChannelsState) {
    const structuredOutput = getLangchainStructured(
      model,
      contentZod(!!state.isPicture, state.format),
      'content'
    );
    const { content: outputContent } = await ChatPromptTemplate.fromTemplate(
      `
        You are an assistant that gets existing hook of a social media, content and generate only the content.
        - Don't add any hashtags
        - Make sure it sounds ${state.tone}
        - Use ${state.tone === 'personal' ? '1st' : '3rd'} person mode
        - ${
          state.format === 'one_short' || state.format === 'thread_short'
            ? 'Keep the post short and concise — roughly 1-2 sentences'
            : 'Post should be long'
        }
        - ${
          state.format === 'one_short' || state.format === 'one_long'
            ? 'Post should have only 1 item'
            : 'Post should have minimum 2 items'
        }
        - Use the hook as inspiration
        - Make sure it's engaging
        - Don't be cringy
        - Use simple english
        - The Content should not contain the hook
        - Try to put some call to action at the end of the post
        - Make sure you add "\n" between the lines
        - Add "\n" after every "."
        
        Hook:
        {hook}
        
        User request:
        {request}

        current content information:
        {information}

        {photos}
      `
    )
      .pipe(structuredOutput)
      .invoke({
        hook: state.hook,
        request: state.messages[0].content,
        information: state.fresearch,
        photos: state.visionContext
          ? `Attached photo(s) that will appear with this post — write the content about what's actually shown in them, not something generic:\n${state.visionContext}`
          : '',
      });

    return {
      content: outputContent,
    };
  }

  async fixArray(state: WorkflowChannelsState) {
    if (state.format === 'one_short' || state.format === 'one_long') {
      return {
        content: [state.content],
      };
    }

    return {};
  }

  async generatePictures(state: WorkflowChannelsState) {
    if (!state.isPicture) {
      return {};
    }

    try {
      const newContent = await Promise.all(
        (state.content || []).map(async (p) => {
          const image = await dalle.invoke(p.prompt!);
          return {
            ...p,
            image,
          };
        })
      );

      return {
        content: newContent,
      };
    } catch (err) {
      throw generationError(err);
    }
  }

  async uploadPictures(state: WorkflowChannelsState) {
    const all = await Promise.all(
      (state.content || []).map(async (p) => {
        if (p.image) {
          const upload = await this.storage.uploadSimple(p.image);
          const name = upload.split('/').pop()!;
          const uploadWithId = await this._mediaService.saveFile(
            state.orgId,
            name,
            upload
          );

          return {
            ...p,
            image: uploadWithId,
          };
        }

        return p;
      })
    );

    return { content: all };
  }

  // Attach the user's own photos (Phase 3) onto the generated posts, one photo
  // per post item (photo 1 → first post, photo 2 → second, ...). No-op when the
  // user didn't attach any — the DALL-E / text-only paths are unchanged.
  async attachUserMedia(state: WorkflowChannelsState) {
    if (!state.userMedia?.length || !state.content?.length) {
      return {};
    }

    const content = state.content.map((item, i) =>
      state.userMedia![i] ? { ...item, image: state.userMedia![i] } : item
    );

    return { content };
  }

  async isGeneratePicture(state: WorkflowChannelsState) {
    // The user's own attached photos take precedence over DALL-E — don't
    // generate new images when they already brought their own.
    if (state.isPicture && !state.userMedia?.length) {
      return 'generate-picture';
    }

    return 'attach-user-media';
  }

  async postDateTime(state: WorkflowChannelsState) {
    return { date: await this._postsService.findFreeDateTime(state.orgId) };
  }

  async *start(orgId: string, body: GeneratorDto) {
    const state = AgentGraphService.state();
    const workflow = state
      .addNode('describe-pictures', this.describePictures.bind(this))
      .addNode('agent', this.startCall.bind(this))
      .addNode('research', toolNode)
      .addNode('save-research', this.saveResearch.bind(this))
      .addNode('find-category', this.findCategories.bind(this))
      .addNode('find-topic', this.findTopic.bind(this))
      .addNode('find-popular-posts', this.findPopularPosts.bind(this))
      .addNode('generate-hook', this.generateHook.bind(this))
      .addNode('generate-content', this.generateContent.bind(this))
      .addNode('generate-content-fix', this.fixArray.bind(this))
      .addNode('generate-picture', this.generatePictures.bind(this))
      .addNode('upload-pictures', this.uploadPictures.bind(this))
      .addNode('attach-user-media', this.attachUserMedia.bind(this))
      .addNode('post-time', this.postDateTime.bind(this))
      .addEdge(START, 'describe-pictures')
      .addEdge('describe-pictures', 'agent')
      .addEdge('agent', 'research')
      .addEdge('research', 'save-research')
      .addEdge('save-research', 'find-category')
      .addEdge('find-category', 'find-topic')
      .addEdge('find-topic', 'find-popular-posts')
      .addEdge('find-popular-posts', 'generate-hook')
      .addEdge('generate-hook', 'generate-content')
      .addEdge('generate-content', 'generate-content-fix')
      .addConditionalEdges(
        'generate-content-fix',
        this.isGeneratePicture.bind(this)
      )
      .addEdge('generate-picture', 'upload-pictures')
      .addEdge('upload-pictures', 'attach-user-media')
      .addEdge('attach-user-media', 'post-time')
      .addEdge('post-time', END);

    const app = workflow.compile();

    const input = {
      messages: [new HumanMessage(body.research)],
      isPicture: body.isPicture,
      format: body.format,
      tone: body.tone,
      pictures: body.pictures?.map((p) => ({ id: p.id })),
      orgId,
    };

    // Drive the graph in `updates` mode — one event PER NODE completion, not per
    // token. The previous `streamEvents(v2)` streamed every model token, which on
    // a reasoning model (DeepSeek) re-serialises the growing reasoning on each
    // delta (O(n^2), multi-MB, 90s+ and cut mid-stream). In `updates` mode each
    // node's model runs via a single `.invoke()` (~10s, non-streamed) and emits
    // one compact event. We re-shape each update into the `{ name, data: { output } }`
    // envelope the frontend consumes: it switches progress labels on `name`, and
    // when the stream ends it reads the final `data.output` (the accumulated
    // { hook, content, ... } state).
    let accumulated: Record<string, any> = {};
    for await (const chunk of await app.stream(input, {
      streamMode: 'updates',
    })) {
      for (const [nodeName, update] of Object.entries(
        chunk as Record<string, any>
      )) {
        if (update && typeof update === 'object') {
          accumulated = { ...accumulated, ...update };
        }
        yield { name: nodeName, data: { output: accumulated } };
      }
    }
  }
}
