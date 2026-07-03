import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, ARIA_MODEL, TASK_MODEL } from "@/lib/anthropic";

/**
 * Provider-agnostic structured generation.
 *  - GROQ_API_KEY set  → Groq (OpenAI-compatible, free tier — used for the trial)
 *  - else ANTHROPIC_API_KEY → Claude structured outputs (production path)
 * Returns a schema-validated object or throws.
 */
export type ChatMsg = { role: "user" | "assistant"; content: string };

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// solid free-tier default; override with GROQ_MODEL
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export function aiConfigured() {
  return !!(process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY);
}

export async function generateStructured<T extends z.ZodType>(opts: {
  system: string;
  messages: ChatMsg[];
  schema: T;
  maxTokens?: number;
  tier?: "main" | "task"; // main = Aria; task = summaries/verdicts
}): Promise<z.infer<T>> {
  if (process.env.GROQ_API_KEY) return groqStructured(opts);
  const client = getAnthropic();
  if (!client) throw new Error("no AI provider configured");
  const msg = await client.messages.parse({
    model: opts.tier === "task" ? TASK_MODEL : ARIA_MODEL,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages: opts.messages,
    output_config: { format: zodOutputFormat(opts.schema) },
  });
  if (!msg.parsed_output) throw new Error("no parsed output");
  return msg.parsed_output as z.infer<T>;
}

async function groqStructured<T extends z.ZodType>(opts: {
  system: string;
  messages: ChatMsg[];
  schema: T;
  maxTokens?: number;
}): Promise<z.infer<T>> {
  const jsonSchema = z.toJSONSchema(opts.schema);
  const system =
    opts.system +
    "\n\nOUTPUT FORMAT: Respond with ONLY a single JSON object (no markdown, no commentary) that validates against this JSON Schema:\n" +
    JSON.stringify(jsonSchema);

  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
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
      }),
    });
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
