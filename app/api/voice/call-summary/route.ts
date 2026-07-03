import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateStructured, aiConfigured } from "@/lib/ai";
import { upsertLead, type LeadEvent, type LeadPatch } from "@/lib/leads";

export const runtime = "nodejs";
export const maxDuration = 30;

const Summary = z.object({
  outcome: z.enum([
    "visit_booked",
    "interested",
    "callback_requested",
    "not_interested",
    "unclear",
  ]),
  summary: z.string().describe("2-3 sentence factual summary of the call for the counsellor"),
  next_best_action: z.string().describe("one concrete instruction for the human counsellor"),
  followup_needed: z.boolean(),
});

const Body = z.object({
  leadId: z.string().max(64).optional(),
  transcript: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(2000),
      })
    )
    .min(2)
    .max(80),
});

const OUTCOME_EVENT: Record<string, string> = {
  visit_booked: "call_outcome_visit_booked",
  interested: "call_outcome_interested",
  callback_requested: "call_outcome_callback",
};

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });

  if (!aiConfigured())
    return NextResponse.json({ error: "ai_unconfigured" }, { status: 503 });

  const { leadId, transcript } = parsed.data;
  const convo = transcript
    .map((t) => `${t.role === "user" ? "Caller" : "Aria"}: ${t.content}`)
    .join("\n");

  try {
    const s = await generateStructured({
      system:
        "You summarize an admissions voice call for City Law College, Lucknow for the human counsellor team. Be factual and concise; judge the outcome conservatively from what the caller actually said.",
      messages: [{ role: "user", content: `Call transcript:\n${convo}\n\nSummarize.` }],
      schema: Summary,
      maxTokens: 500,
      tier: "task",
    });

    // update the lead: outcome, stage, summary + scored event
    if (leadId) {
      const events: LeadEvent[] = [{ type: "voice_call_completed" }];
      if (OUTCOME_EVENT[s.outcome]) events.push({ type: OUTCOME_EVENT[s.outcome] });
      const patch: LeadPatch & { lastCallSummary?: string } = {
        lastCallOutcome: s.outcome,
        lastCallSummary: s.summary,
        nextBestAction: s.next_best_action,
      };
      if (s.outcome === "visit_booked") patch.stage = "visit_scheduled";
      if (s.outcome === "not_interested") patch.stage = "dead";
      await upsertLead({ leadId, patch: patch as LeadPatch, events });
    }

    return NextResponse.json(s);
  } catch (e) {
    console.error("[/api/voice/call-summary]", e);
    return NextResponse.json({ error: "ai_failed" }, { status: 502 });
  }
}
