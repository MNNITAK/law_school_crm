import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getDb } from "@/lib/firebase/admin";
import { generateStructured, aiConfigured } from "@/lib/ai";
import { upsertLead, addMessage, type LeadEvent, type LeadPatch } from "@/lib/leads";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vapi server webhook. We act on `end-of-call-report`: store the transcript
 * on the lead, AI-summarise the outcome, and update stage/score — the same
 * write-back the in-browser Voice Counsel does.
 */
const Summary = z.object({
  outcome: z.enum([
    "visit_booked",
    "interested",
    "callback_requested",
    "not_interested",
    "no_answer",
  ]),
  summary: z.string(),
  next_best_action: z.string(),
  followup_needed: z.boolean(),
});

export async function POST(req: NextRequest) {
  // shared-secret check (set OUTBOUND_WEBHOOK_SECRET; Vapi calls back with it in the URL)
  const secret = process.env.OUTBOUND_WEBHOOK_SECRET;
  if (secret && req.nextUrl.searchParams.get("key") !== secret)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const payload = (await req.json().catch(() => null)) as {
    message?: {
      type?: string;
      call?: { id?: string; assistant?: { metadata?: { leadId?: string } } };
      assistant?: { metadata?: { leadId?: string } };
      artifact?: { messages?: { role?: string; message?: string }[] };
      transcript?: string;
      endedReason?: string;
    };
  } | null;

  const m = payload?.message;
  if (!m || m.type !== "end-of-call-report") return NextResponse.json({ ok: true });

  const leadId =
    m.assistant?.metadata?.leadId ?? m.call?.assistant?.metadata?.leadId;
  const db = getDb();
  if (!leadId || !db) return NextResponse.json({ ok: true });

  try {
    // transcript: prefer structured messages, fall back to the flat transcript string
    const turns = (m.artifact?.messages ?? [])
      .filter((x) => x.role === "user" || x.role === "bot" || x.role === "assistant")
      .map((x) => ({
        role: x.role === "user" ? ("user" as const) : ("assistant" as const),
        content: String(x.message ?? "").slice(0, 1500),
      }))
      .filter((x) => x.content);

    for (const t of turns) {
      await addMessage({
        leadId,
        conversationId: m.call?.id ?? "outbound_call",
        channel: "voice",
        role: t.role,
        content: t.content,
        meta: { outbound: true },
      });
    }

    const convoText = turns.length
      ? turns.map((t) => `${t.role === "user" ? "Lead" : "Aria"}: ${t.content}`).join("\n")
      : (m.transcript ?? "");

    if (!convoText || !aiConfigured()) {
      // no answer / no transcript → record the attempt
      await upsertLead({
        leadId,
        patch: { lastCallOutcome: "no_answer" } as LeadPatch,
        events: [{ type: "voice_call_completed", points: 0, detail: { endedReason: m.endedReason } }],
      });
      return NextResponse.json({ ok: true });
    }

    const s = await generateStructured({
      system:
        "You summarize an admissions phone call made by City Law College, Lucknow's AI counsellor to a prospective student. Be factual and concise; judge the outcome conservatively from what the lead actually said.",
      messages: [{ role: "user", content: `Call transcript:\n${convoText}\n\nSummarize.` }],
      schema: Summary,
      maxTokens: 500,
      tier: "task",
    });

    const events: LeadEvent[] = [{ type: "voice_call_completed" }];
    if (s.outcome === "visit_booked") events.push({ type: "call_outcome_visit_booked" });
    if (s.outcome === "interested") events.push({ type: "call_outcome_interested" });
    if (s.outcome === "callback_requested") events.push({ type: "call_outcome_callback" });

    const patch: LeadPatch = {
      lastCallOutcome: s.outcome,
      nextBestAction: s.next_best_action,
      stage: s.outcome === "visit_booked" ? "visit_scheduled" : undefined,
    };
    if (s.outcome === "not_interested") patch.stage = "dead";
    await upsertLead({ leadId, patch, events });
    await db
      .collection("leads")
      .doc(leadId)
      .set({ lastCallSummary: s.summary, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch (e) {
    console.error("[outbound-webhook]", e);
  }
  return NextResponse.json({ ok: true });
}
