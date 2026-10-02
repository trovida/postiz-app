/**
 * Centralised AI provider configuration.
 *
 * Postiz talks to an LLM through four different libraries (the official `openai`
 * SDK, the Vercel AI SDK via Mastra, LangChain, and CopilotKit) and every one
 * of them was hard-wired to OpenAI (`process.env.OPENAI_API_KEY`, base URL
 * `api.openai.com`, and OpenAI-only model names). This module makes the
 * provider configurable so ANY OpenAI-compatible endpoint (DeepSeek, Together,
 * DeepInfra, a local LiteLLM/Ollama, …) can drive the text + agent features.
 *
 * It is BACKWARD COMPATIBLE: a deployment that only sets `OPENAI_API_KEY` and no
 * `AI_*` vars behaves exactly as before (real OpenAI, same models).
 *
 * Env:
 *   AI_TEXT_API_KEY / AI_TEXT_BASE_URL / AI_TEXT_MODEL   text + agent provider
 *   AI_AGENT_MODEL                                        override just the agent model
 *   AI_IMAGE_API_KEY / AI_IMAGE_BASE_URL / AI_IMAGE_MODEL image provider (optional)
 *   AI_STRUCTURED_MODE = auto|json_schema|json_object|none  (default: auto)
 *
 * Fallbacks: AI_TEXT_* fall back to OPENAI_API_KEY / OPENAI_BASE_URL. Images
 * only fall back to OPENAI_API_KEY when the text provider is still plain OpenAI
 * (no custom base URL) — so a DeepSeek text deployment does not accidentally try
 * to generate images against DeepSeek (which has no image model); it stays off
 * until AI_IMAGE_* is set.
 */
import OpenAI from 'openai';
import { ChatOpenAI, DallEAPIWrapper } from '@langchain/openai';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { OpenAIAdapter } from '@copilotkit/runtime';
import { zodResponseFormat } from 'openai/helpers/zod';
import { RunnableLambda } from '@langchain/core/runnables';
import { SystemMessage } from '@langchain/core/messages';
import type { Runnable } from '@langchain/core/runnables';
import type { ZodType } from 'zod';

const env = process.env;

const TEXT_KEY = env.AI_TEXT_API_KEY || env.OPENAI_API_KEY || '';
const TEXT_BASE = env.AI_TEXT_BASE_URL || env.OPENAI_BASE_URL || undefined;
// No custom base URL => we are pointed at the real OpenAI API.
const PLAIN_OPENAI = !TEXT_BASE;

const IMAGE_KEY =
  env.AI_IMAGE_API_KEY || (PLAIN_OPENAI ? env.OPENAI_API_KEY || '' : '');
const IMAGE_BASE = env.AI_IMAGE_BASE_URL || undefined;
const IMAGE_MODEL = env.AI_IMAGE_MODEL || 'chatgpt-image-latest';

/** Is text/agent generation configured? */
export const aiTextEnabled = () => !!TEXT_KEY;
/** Is image generation configured? (DeepSeek has no image model, so this is
 *  off unless AI_IMAGE_* is set — or we're on plain OpenAI.) */
export const aiImageEnabled = () => !!IMAGE_KEY;

/**
 * Does the configured text provider support OpenAI structured outputs
 * (`response_format: { type: 'json_schema' }`)? Only OpenAI and xAI do today;
 * DeepSeek et al. 400 on it and need the json_object fallback.
 */
export const supportsJsonSchema = () => {
  const mode = (env.AI_STRUCTURED_MODE || '').toLowerCase();
  if (mode === 'json_schema') return true;
  if (mode === 'json_object' || mode === 'none') return false;
  // auto-detect
  if (PLAIN_OPENAI) return true;
  return /(^|\.)(openai\.com|openai\.azure\.com|x\.ai)/i.test(TEXT_BASE || '');
};

/** The chat model for a given call site. A single AI_TEXT_MODEL (e.g.
 *  `deepseek-v4-flash`) overrides every site; otherwise each keeps its own
 *  OpenAI default. */
export const textModel = (fallback: string) => env.AI_TEXT_MODEL || fallback;

/** The agent (Mastra) model. */
export const agentModel = () =>
  env.AI_AGENT_MODEL || env.AI_TEXT_MODEL || 'gpt-5.2';

export const imageModel = () => IMAGE_MODEL;

/** Official `openai` SDK client for TEXT. */
export const getTextClient = () =>
  new OpenAI({ apiKey: TEXT_KEY || 'sk-noop', baseURL: TEXT_BASE });

/** Official `openai` SDK client for IMAGES (may be a different provider). */
export const getImageClient = () =>
  new OpenAI({ apiKey: IMAGE_KEY || 'sk-noop', baseURL: IMAGE_BASE });

/** LangChain ChatOpenAI pointed at the configured text provider. */
export const getLangchainChat = (
  fallbackModel: string,
  opts: { temperature?: number } = {}
) =>
  new ChatOpenAI({
    apiKey: TEXT_KEY || 'sk-noop',
    model: textModel(fallbackModel),
    // Non-streaming: ChatOpenAI.invoke() with streaming:true still streams
    // internally (token-by-token aggregation) — on a reasoning model that
    // re-serialises the growing reasoning per token (O(n^2), 90s+). streaming:false
    // uses the plain completions endpoint (~10s, verified). These models run under
    // the generator/autopost graphs, which surface progress via app.stream
    // (streamMode:'updates') / app.invoke — node-level, NOT token-level — so no
    // token stream is needed. (The Mastra agent uses getAgentModel, a separate path.)
    streaming: false,
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(TEXT_BASE ? { configuration: { baseURL: TEXT_BASE } } : {}),
  });

/** Extract the raw JSON-Schema object that `zodResponseFormat` derives, for
 *  embedding in a prompt (the json_object fallback path). */
const schemaJson = (schema: ZodType<any>, name: string): string => {
  const rf = zodResponseFormat(schema, name) as any;
  return JSON.stringify(rf?.json_schema?.schema ?? {});
};

/** Strip markdown code-fences a model sometimes wraps JSON in. */
const unfence = (raw: string): string =>
  raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');

/** Pull plain text out of a LangChain AIMessage `.content` (string | parts). */
const messageText = (res: any): string => {
  const c = res?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c))
    return c.map((p: any) => (typeof p === 'string' ? p : p?.text ?? '')).join('');
  return String(c ?? '');
};

/**
 * A LangChain structured-output step that works on EVERY provider.
 *
 * OpenAI/xAI/Azure  -> native `withStructuredOutput({ method: 'jsonSchema' })`.
 * DeepSeek/others   -> `response_format: { type: 'json_object' }` + the schema
 *                      injected into the prompt + client-side Zod validation.
 *
 * DeepSeek's thinking models reject BOTH of LangChain's normal structured modes:
 * `functionCalling` forces a `tool_choice` (400 "Thinking mode does not support
 * this tool_choice") and `jsonSchema` uses `response_format: json_schema` (400
 * "This response_format type is unavailable now"). json_object is the only mode
 * they accept, so for non-OpenAI providers we drive it ourselves.
 *
 * Drop-in for `model.withStructuredOutput(schema, …)`: pipe a prompt into it
 * (`prompt.pipe(getLangchainStructured(model, schema, 'name'))`) and it resolves
 * to the parsed+validated object.
 */
export const getLangchainStructured = <T>(
  model: ChatOpenAI,
  schema: ZodType<T>,
  name: string
): Runnable<any, T> => {
  if (supportsJsonSchema()) {
    return model.withStructuredOutput(schema, {
      method: 'jsonSchema',
      name,
    }) as unknown as Runnable<any, T>;
  }

  const jsonSchema = schemaJson(schema, name);

  return RunnableLambda.from(async (input: any): Promise<T> => {
    // `input` is whatever the upstream prompt produced — a ChatPromptValue, a
    // message array, or a string. Normalise to a message array.
    const base =
      typeof input?.toChatMessages === 'function'
        ? input.toChatMessages()
        : Array.isArray(input)
        ? input
        : [input];
    const messages = [
      new SystemMessage(
        `You must respond with ONLY a single JSON object and nothing else ` +
          `(no prose, no markdown code fences). It must validate against this ` +
          `JSON schema:\n${jsonSchema}`
      ),
      ...base,
    ];
    // Per-invocation call options (not `.bind`, which LangChain v1 does not type
    // on ChatOpenAI). `response_format: json_object` is the only structured mode
    // DeepSeek's thinking models accept.
    const res = await model.invoke(messages, {
      response_format: { type: 'json_object' },
    } as any);
    return schema.parse(JSON.parse(unfence(messageText(res))));
  });
};

/**
 * LangChain image generator. Returns a DallEAPIWrapper pointed at the
 * configured image provider when one is set, otherwise a stub whose `.invoke`
 * throws a clear error (images are off by default when the text provider is a
 * non-OpenAI host like DeepSeek, which has no image model).
 */
export const getLangchainImage = (): { invoke(prompt: string): Promise<string> } => {
  if (!aiImageEnabled()) {
    return {
      invoke: async () => {
        throw new Error(
          'AI image generation is not configured (set AI_IMAGE_API_KEY / AI_IMAGE_BASE_URL / AI_IMAGE_MODEL).'
        );
      },
    };
  }
  const dalle = new DallEAPIWrapper({
    apiKey: IMAGE_KEY,
    model: IMAGE_MODEL,
    ...(IMAGE_BASE ? ({ baseUrl: IMAGE_BASE } as any) : {}),
  });
  return { invoke: (prompt: string) => dalle.invoke(prompt) };
};

/**
 * Vercel AI SDK model for the Mastra agent. `.chat()` forces the Chat
 * Completions API — the default `provider(model)` uses the Responses API, which
 * 404s against DeepSeek and every other OpenAI-compatible host.
 */
// Return type is annotated `any` deliberately: `provider.chat(...)` infers a
// LanguageModelV2 that lives in a nested `@ai-sdk/openai/node_modules/@ai-sdk/
// provider`, which TS cannot name portably across projects (TS2742). The value
// is only ever handed to Mastra's `new Agent({ model })`, which accepts it.
export const getAgentModel = (): any => {
  if (PLAIN_OPENAI) {
    // Real OpenAI keeps the original bare-call form (`openai(model)` = the
    // Responses API, the prior behavior).
    const provider = createOpenAI({ apiKey: TEXT_KEY || 'sk-noop' });
    return provider(agentModel());
  }
  // A custom OpenAI-compatible endpoint (DeepSeek, …) uses the purpose-built
  // compatible provider: Chat Completions + the `system` role (the standard
  // `@ai-sdk/openai` provider maps system→`developer` for reasoning models,
  // which DeepSeek rejects with 400 "unknown variant `developer`"), and none of
  // the OpenAI-only request fields these hosts don't understand.
  const provider = createOpenAICompatible({
    name: 'custom',
    baseURL: TEXT_BASE!,
    apiKey: TEXT_KEY || 'sk-noop',
  });
  return provider.chatModel(agentModel());
};

/** CopilotKit service adapter backed by the configured text provider. */
export const getCopilotAdapter = () =>
  PLAIN_OPENAI
    ? // Plain OpenAI: let CopilotKit build its own client (prior behavior).
      new OpenAIAdapter({ model: textModel('gpt-4.1') })
    : // Custom endpoint: OpenAIAdapter ignores OPENAI_BASE_URL, so inject a
      // client already pointed at it (the documented Azure/custom pattern).
      new OpenAIAdapter({
        openai: getTextClient() as any,
        model: textModel('gpt-4.1'),
      });

/**
 * Run a structured-output chat call with graceful degradation:
 *   - OpenAI/xAI  -> native json_schema via `chat.completions.parse`
 *   - DeepSeek/…  -> json_object mode + the schema embedded in the prompt,
 *                    validated client-side with Zod.
 * Returns the parsed+validated object, or null if it could not be produced.
 */
export async function parseStructured<T>(
  params: { model: string; messages: any[] },
  schema: ZodType<T>,
  name: string,
  requestOpts: { timeout?: number; maxRetries?: number } = {}
): Promise<T | null> {
  const client = getTextClient();
  const model = textModel(params.model);

  if (supportsJsonSchema()) {
    const r = await client.chat.completions.parse(
      {
        model,
        messages: params.messages,
        response_format: zodResponseFormat(schema, name),
      },
      requestOpts
    );
    return (r.choices[0]?.message?.parsed as T) ?? null;
  }

  // json_object fallback (DeepSeek and other OpenAI-compatible hosts).
  // The literal word "json" must appear in the prompt for json_object mode.
  const rf = zodResponseFormat(schema, name) as any;
  const jsonSchema = JSON.stringify(rf?.json_schema?.schema ?? {});
  const messages = [
    {
      role: 'system',
      content:
        `You must respond with ONLY a single JSON object and nothing else ` +
        `(no prose, no markdown code fences). It must validate against this ` +
        `JSON schema:\n${jsonSchema}`,
    },
    ...params.messages,
  ];

  const r = await client.chat.completions.create(
    { model, messages, response_format: { type: 'json_object' } },
    requestOpts
  );

  const raw = r.choices[0]?.message?.content ?? '';
  try {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '');
    return schema.parse(JSON.parse(cleaned));
  } catch {
    return null;
  }
}
