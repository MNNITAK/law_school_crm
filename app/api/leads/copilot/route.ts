import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateStructured, aiConfigured } from "@/lib/ai";
import { verifyAdmin } from "@/lib/adminAuth";
import { copilotSystem } from "@/lib/prompts/copilot";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Counsellor copilot — on-demand AI over a single lead's conversation.
 * action: "summary" | "draft" | "nba". Admin-only. The client passes the
 * already-loaded messages (like /api/voice/call-summary passes a transcript),
 * so the route doesn't re-read Firestore.
 */
const Body = z.object({
  action: z.enum(["summary", "draft", "nba"]),
  lead: z
    .object({
      name: z.string().max(120).nullish(),
      course: z.string().max(40).nullish(),
      city: z.string().max(80).nullish(),
      qualifyingPercent: z.union([z.number(), z.string()]).nullish(),
      persona: z.string().max(20).nullish(),
      stage: z.string().max(40).nullish(),
    })
    .partial()
    .optional(),
  messages: z
    .array(
      z.object({
        role: z.string().max(20),
        content: z.string().max(4000),
      })
    )
    .min(1)
    .max(200),
});

const Summary = z.object({
  headline: z.string().describe("one-line status of where this lead stands"),
  journey: z.string().describe("2-4 sentences on what happened across the conversation"),
  signals: z.array(z.string()).max(6).describe("concrete buying/interest signals seen"),
  risks: z.array(z.string()).max(6).describe("concerns, objections or drop-off risks"),
});

const Nba = z.object({
  action: z.string().describe("the single next action, imperative and specific"),
  why: z.string().describe("one sentence: why this, now"),
  urgency: z.enum(["low", "medium", "high"]),
});

const Draft = z.object({
  reply: z.string().describe("the message the counsellor can send, in the lead's language"),
  tone_note: z.string().describe("one short note on the tone/approach chosen"),
});

function whoLabel(role: string): string {
  if (role === "user") return "Lead";
  if (role === "counsellor") return "Counsellor";
  return "Aria";
}

export async function POST(req: NextRequest) {
  const uid = await verifyAdmin(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (!aiConfigured())
    return NextResponse.json({ error: "ai_unconfigured" }, { status: 503 });

  const { action, lead, messages } = parsed.data;
  const convo = messages
    .map((mm) => `${whoLabel(mm.role)}: ${mm.content}`)
    .join("\n");
  const leadLine = lead
    ? `Lead file: ${[
        lead.name && `name ${lead.name}`,
        lead.course && `course ${lead.course}`,
        lead.city && `city ${lead.city}`,
        lead.qualifyingPercent != null && `marks ${lead.qualifyingPercent}%`,
        lead.persona && `persona ${lead.persona}`,
        lead.stage && `stage ${lead.stage}`,
      ]
        .filter(Boolean)
        .join(", ")}\n\n`
    : "";

  const schema = action === "summary" ? Summary : action === "nba" ? Nba : Draft;
  const verb =
    action === "summary"
      ? "Brief the counsellor on this lead."
      : action === "nba"
        ? "Give the single next best action."
        : "Draft the counsellor's next reply to this lead.";

  try {
    const result = await generateStructured({
      system: copilotSystem(action),
      messages: [
        { role: "user", content: `${leadLine}Conversation:\n${convo}\n\n${verb}` },
      ],
      schema,
      maxTokens: 600,
      tier: action === "draft" ? "main" : "task",
    });
    return NextResponse.json({ action, result });
  } catch (e) {
    console.error("[/api/leads/copilot]", e);
    return NextResponse.json({ error: "ai_failed" }, { status: 502 });
  }
}
