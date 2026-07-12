import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, ARIA_MODEL, TASK_MODEL } from "@/lib/anthropic";

/**
 * Provider-agnostic structured generation.
 *  - GROQ_API_KEY set  → Groq (OpenAI-compatible) is primary
 *  - ANTHROPIC_API_KEY → Claude; used directly when Groq is unset, or as an
 *    automatic fallback when Groq errors (429/5xx/timeout/validation-exhausted)
 * Returns a schema-validated object or throws.
 */
export type ChatMsg = { role: "user" | "assistant"; content: string };

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
// per-attempt Groq timeout; keeps the worst chain (timeout → fallback) inside
// the 60s webhook budget
const GROQ_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 15_000;
const ANTHROPIC_TIMEOUT_MS = 30_000;

export function aiConfigured() {
  return !!(process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY);
}

type GenOpts<T extends z.ZodType> = {
  system: string;
  messages: ChatMsg[];
  schema: T;
  maxTokens?: number;
  tier?: "main" | "task"; // main = Aria; task = summaries/verdicts
};

export async function generateStructured<T extends z.ZodType>(
  opts: GenOpts<T>
): Promise<z.infer<T>> {
  if (process.env.GROQ_API_KEY) {
    try {
      return await groqStructured(opts);
    } catch (e) {
      if (!process.env.ANTHROPIC_API_KEY) throw e;
      console.error("[ai] groq failed, falling back to anthropic:", e);
      return anthropicStructured(opts);
    }
  }
  return anthropicStructured(opts);
}

async function anthropicStructured<T extends z.ZodType>(
  opts: GenOpts<T>
): Promise<z.infer<T>> {
  const client = getAnthropic();
  if (!client) throw new Error("no AI provider configured");
  const msg = await client.messages.parse(
    {
      model: opts.tier === "task" ? TASK_MODEL : ARIA_MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: opts.messages,
      output_config: { format: zodOutputFormat(opts.schema) },
    },
    { timeout: ANTHROPIC_TIMEOUT_MS }
  );
  if (!msg.parsed_output) throw new Error("no parsed output");
  return msg.parsed_output as z.infer<T>;
}

/* One Groq HTTP round-trip with a hard timeout; retries once on 429/5xx
   (a slow model won't get faster — timeouts go straight to the caller). */
async function groqFetch(body: string): Promise<Response> {
  for (let httpTry = 0; httpTry < 2; httpTry++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GROQ_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if ((res.status === 429 || res.status >= 500) && httpTry === 0) {
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      await new Promise((r) =>
        setTimeout(r, Math.min(Math.max(retryAfter * 1000, 750), 3000))
      );
      continue;
    }
    return res;
  }
  throw new Error("unreachable");
}

async function groqStructured<T extends z.ZodType>(
  opts: GenOpts<T>
): Promise<z.infer<T>> {
  const jsonSchema = z.toJSONSchema(opts.schema);
  const system =
    opts.system +
    "\n\nOUTPUT FORMAT: Respond with ONLY a single JSON object (no markdown, no commentary) that validates against this JSON Schema:\n" +
    JSON.stringify(jsonSchema);

  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await groqFetch(
      JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: 0.6,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          ...opts.messages,
          ...(attempt > 0
            ? [
                {
                  role: "system" as const,
                  content: `Your previous output failed validation: ${lastErr}. Return corrected JSON only.`,
                },
              ]
            : []),
        ],
      })
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`groq HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content ?? "";
    try {
      const obj = JSON.parse(extractJSON(raw));
      const parsed = opts.schema.safeParse(obj);
      if (parsed.success) return parsed.data;
      lastErr = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .slice(0, 5)
        .join("; ");
    } catch (e) {
      lastErr = `invalid JSON: ${String(e).slice(0, 120)}`;
    }
  }
  throw new Error(`groq output failed validation: ${lastErr}`);
}

function extractJSON(t: string): string {
  const m = t.match(/\{[\s\S]*\}/);
  return m ? m[0] : t;
}
