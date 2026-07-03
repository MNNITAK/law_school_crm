import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/** Model is env-switchable: set ARIA_MODEL=claude-haiku-4-5-20251001 as the cheap lever. */
export const ARIA_MODEL = process.env.ARIA_MODEL || "claude-opus-4-8";
/** Small/cheap tasks (quiz verdicts, call summaries) can ride a lighter model. */
export const TASK_MODEL = process.env.TASK_MODEL || ARIA_MODEL;

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic | null {
  if (client) return client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.warn("[anthropic] ANTHROPIC_API_KEY not set — AI routes disabled.");
    return null;
  }
  client = new Anthropic({ apiKey: key });
  return client;
}
