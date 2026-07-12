import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { aiConfigured } from "@/lib/ai";
import { runAria } from "@/lib/ariaEngine";
import { makeLimiter } from "@/lib/rateLimit";

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

/* 20/min per conversation + a high per-IP ceiling — a whole campus can sit
   behind one NAT IP, so keying on IP alone falsely blocks real students */
const limited = makeLimiter({ perKey: 20, perIp: 120 });

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { leadId, conversationId, channel, messages } = parsed.data;

  if (limited(conversationId ?? leadId, ip))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });

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
