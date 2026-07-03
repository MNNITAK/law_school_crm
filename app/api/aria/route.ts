import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateStructured, aiConfigured } from "@/lib/ai";
import { ariaSystemPrompt } from "@/lib/prompts/aria";
import { upsertLead, addMessage, type LeadEvent, type LeadPatch } from "@/lib/leads";
import { scheduleDrip } from "@/lib/followups";
import { HOT_THRESHOLD } from "@/lib/scoring";

export const runtime = "nodejs";
export const maxDuration = 60;

/* ---------- structured output schema (same shape the demo UI already consumes) ---------- */
const Envelope = z.object({
  reply: z
    .string()
    .describe("The counsellor reply. Use \\n\\n between short text bubbles (max 3)."),
  sentiment: z.enum([
    "excited",
    "curious",
    "anxious",
    "skeptical",
    "neutral",
    "frustrated",
    "ready",
  ]),
  speaker: z.enum(["student", "parent"]),
  stage: z.number().int().min(0).max(2),
  readiness: z.number().int().min(0).max(100),
  temp: z.enum(["cold", "warm", "hot"]),
  lead: z.object({
    name: z.string().nullable(),
    phone: z.string().nullable(),
    course: z.string().nullable(),
  }),
  extracted: z.object({
    city: z.string().nullable(),
    percent: z.number().nullable(),
    category: z.enum(["general", "sc_st"]).nullable(),
  }),
  signals: z.object({
    asked_fees: z.boolean(),
    visit_intent: z.boolean(),
    wa_opt_in: z.boolean(),
  }),
  nba: z.string(),
  chips: z.array(z.string()).max(3),
  handoff: z.boolean(),
});

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

/* ---------- naive per-IP rate limit (per serverless instance; fine for the trial) ---------- */
const hits = new Map<string, { n: number; t: number }>();
function rateLimited(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 60_000) {
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  h.n++;
  return h.n > 20; // 20 turns/minute/IP
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (rateLimited(ip))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { leadId, channel, messages } = parsed.data;
  let { conversationId } = parsed.data;

  if (!aiConfigured())
    return NextResponse.json({ error: "ai_unconfigured" }, { status: 503 });

  // per-conversation turn cap (abuse guard)
  if (messages.filter((m) => m.role === "user").length > 40)
    return NextResponse.json({ error: "turn_cap" }, { status: 429 });

  let out: z.infer<typeof Envelope>;
  const usage: unknown = null;
  try {
    out = await generateStructured({
      system: ariaSystemPrompt(channel),
      messages,
      schema: Envelope,
      maxTokens: 1024,
      tier: "main",
    });
  } catch (e) {
    console.error("[/api/aria] model call failed:", e);
    return NextResponse.json({ error: "ai_failed" }, { status: 502 });
  }

  /* ---------- persistence + scoring (best-effort; the reply is returned regardless) ---------- */
  let persistedLeadId: string | null = leadId ?? null;
  try {
    conversationId ||= crypto.randomUUID();

    const events: LeadEvent[] = [];
    if (out.signals.asked_fees) events.push({ type: "asked_fees" });
    if (out.signals.visit_intent) events.push({ type: "visit_intent" });
    if (out.signals.wa_opt_in) events.push({ type: "wa_opt_in" });
    const userTurns = messages.filter((m) => m.role === "user").length;
    if (userTurns === 6) events.push({ type: "long_conversation" });

    const patch: LeadPatch = {
      name: out.lead.name ?? undefined,
      phone: out.lead.phone?.replace(/[^\d+]/g, "") ?? undefined,
      city: out.extracted.city ?? undefined,
      course: out.lead.course
        ? out.lead.course.startsWith("BA")
          ? "ba_llb"
          : "llb"
        : undefined,
      qualifyingPercent: out.extracted.percent ?? undefined,
      category: out.extracted.category ?? undefined,
      persona: out.speaker,
      llmReadiness: out.readiness,
      sentiment: out.sentiment,
      nextBestAction: out.nba,
      stage: out.stage >= 2 ? "qualified" : out.stage >= 1 ? "engaged" : undefined,
      waOptIn: out.signals.wa_opt_in ? true : undefined,
    };

    const result = await upsertLead({
      leadId: leadId || undefined,
      source: channel === "voice" ? "voice" : "aria_chat",
      patch,
      events,
    });
    persistedLeadId = result.leadId;

    if (persistedLeadId) {
      if (out.handoff || result.score >= HOT_THRESHOLD) {
        await upsertLead({
          leadId: persistedLeadId,
          patch: { handoffAt: "now" } as LeadPatch,
        });
      }
      if (out.signals.wa_opt_in) {
        await scheduleDrip(persistedLeadId, out.speaker);
      }
      const lastUser = messages.filter((m) => m.role === "user").at(-1);
      if (lastUser)
        await addMessage({
          leadId: persistedLeadId,
          conversationId,
          channel: channel === "voice" ? "voice" : "web_chat",
          role: "user",
          content: lastUser.content,
        });
      await addMessage({
        leadId: persistedLeadId,
        conversationId,
        channel: channel === "voice" ? "voice" : "web_chat",
        role: "assistant",
        content: out.reply,
        meta: {
          sentiment: out.sentiment,
          speaker: out.speaker,
          stage: out.stage,
          readiness: out.readiness,
          nba: out.nba,
          usage,
        },
      });
    }
  } catch (e) {
    console.error("[/api/aria] persistence failed (reply still returned):", e);
  }

  return NextResponse.json({
    ...out,
    leadId: persistedLeadId,
    conversationId,
  });
}
