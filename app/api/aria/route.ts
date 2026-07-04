import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { aiConfigured } from "@/lib/ai";
import { runAria } from "@/lib/ariaEngine";

export const runtime = "nodejs";
export const maxDuration = 60;

const InMsg = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});
const Body = z.object({
  leadId: z.string().max(64).optional(),
  conversationId: z.string().max(64).optional(),
  channel: z.enum(["web_chat", "voice"]).default("web_chat"),
  messages: z.array(InMsg).min(1).max(50),
});

/* naive per-IP rate limit (per serverless instance; fine for the trial) */
const hits = new Map<string, { n: number; t: number }>();
function rateLimited(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 60_000) {
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  h.n++;
  return h.n > 20;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (rateLimited(ip))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { leadId, conversationId, channel, messages } = parsed.data;

  if (!aiConfigured())
    return NextResponse.json({ error: "ai_unconfigured" }, { status: 503 });
  if (messages.filter((m) => m.role === "user").length > 40)
    return NextResponse.json({ error: "turn_cap" }, { status: 429 });

  try {
    const result = await runAria({ leadId, conversationId, channel, messages });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[/api/aria] model call failed:", e);
    return NextResponse.json({ error: "ai_failed" }, { status: 502 });
  }
}
