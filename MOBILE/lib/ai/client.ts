import OpenAI from "openai";

/** Timeout for all OpenAI API calls (ms). Prevents hung requests in production. */
const OPENAI_TIMEOUT_MS = 60_000;

export const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: OPENAI_TIMEOUT_MS,
    })
  : null;

export const model =
  process.env.OPENAI_MODEL && process.env.OPENAI_MODEL.length > 0
    ? process.env.OPENAI_MODEL
    : "gpt-4o";

