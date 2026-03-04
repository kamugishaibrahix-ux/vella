/**
 * OpenAI Safety Hardening: deterministic AI boundaries.
 *
 * Every OpenAI chat completion MUST:
 * - Use explicit max_tokens
 * - Use explicit temperature
 * - Use explicit timeout (AbortController)
 * - Optionally validate response with zod (throw in production on failure)
 *
 * Use this module for all chat.completions.create calls so refund + logging
 * can be applied consistently in routes.
 */
import type OpenAI from "openai";
import type { z } from "zod";
import { isProduction } from "@/lib/server/env";

const DEFAULT_TIMEOUT_MS = 60_000;

export type SafeChatCompletionOptions = {
  client: OpenAI;
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  max_tokens: number;
  temperature: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Optional zod schema to validate choices[0].message.content (string). In production, throws if invalid. */
  responseContentSchema?: z.ZodType<string>;
  /** Optional zod schema to validate parsed JSON from content. In production, throws if invalid. */
  responseJsonSchema?: z.ZodType<unknown>;
  /** Extra options passed through to create() (e.g. response_format, top_p) */
  extra?: Record<string, unknown>;
};

/**
 * Create a chat completion with explicit max_tokens, temperature, and timeout.
 * Uses AbortController so the request is aborted after timeoutMs.
 * If responseContentSchema or responseJsonSchema is provided and validation fails, throws in production.
 */
export async function createChatCompletion(options: SafeChatCompletionOptions): Promise<OpenAI.Chat.ChatCompletion> {
  const {
    client,
    model,
    messages,
    max_tokens,
    temperature,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: externalSignal,
    responseContentSchema,
    responseJsonSchema,
    extra = {},
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const signal = externalSignal ?? controller.signal;

  const cleanup = () => {
    clearTimeout(timeoutId);
  };

  try {
    const completion = await client.chat.completions.create(
      {
        model,
        messages,
        max_tokens,
        temperature,
        ...extra,
      },
      { signal }
    );

    cleanup();

    const content = completion.choices[0]?.message?.content ?? "";

    if (responseContentSchema) {
      const parsed = responseContentSchema.safeParse(content);
      if (!parsed.success && isProduction()) {
        throw new Error(`OpenAI response validation failed: ${parsed.error.message}`);
      }
    }

    if (responseJsonSchema && content) {
      try {
        const json = JSON.parse(content) as unknown;
        const parsed = responseJsonSchema.safeParse(json);
        if (!parsed.success && isProduction()) {
          throw new Error(`OpenAI JSON response validation failed: ${parsed.error.message}`);
        }
      } catch (e) {
        if (e instanceof SyntaxError && isProduction()) {
          throw new Error(`OpenAI response invalid JSON: ${e.message}`);
        }
        throw e;
      }
    }

    return completion;
  } catch (err) {
    cleanup();
    throw err;
  }
}

/** Default max_tokens when not specified by caller (safety ceiling). */
export const DEFAULT_MAX_TOKENS = 4096;

/** Default temperature when not specified (deterministic-friendly). */
export const DEFAULT_TEMPERATURE = 0.4;
