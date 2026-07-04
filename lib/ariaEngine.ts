import "server-only";
import { z } from "zod";
import { generateStructured, type ChatMsg } from "@/lib/ai";
import { ariaSystemPrompt, type AriaChannel } from "@/lib/prompts/aria";
import { upsertLead, addMessage, type LeadEvent, type LeadPatch } from "@/lib/leads";
import { scheduleDrip } from "@/lib/followups";
import { HOT_THRESHOLD } from "@/lib/scoring";
import { placeOrQueueCall, callScoreThreshold } from "@/lib/outboundCall";

/** Aria's structured envelope — same shape the site's demo CRM panel consumes. */
export const Envelope = z.object({
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
    call_requested: z.boolean(),
  }),
  nba: z.string(),
  chips: z.array(z.string()).max(3),
  handoff: z.boolean(),
});
export type AriaEnvelope = z.infer<typeof Envelope>;

/**
 * One Aria turn: model call + full CRM persistence (lead upsert, events,
 * scoring, transcript, handoff, drip scheduling). Used by web chat, voice
 * and the WhatsApp bot so every channel behaves identically.
 */
export async function runAria(opts: {
  leadId?: string;
  conversationId?: string;
  channel: AriaChannel;
  messages: ChatMsg[];
  /** already-persisted user turns (e.g. WhatsApp webhook stores inbound itself) */
  skipUserPersist?: boolean;
}): Promise<AriaEnvelope & { leadId: string | null; conversationId: string }> {
  const out = await generateStructured({
    system: ariaSystemPrompt(opts.channel),
    messages: opts.messages,
    schema: Envelope,
    maxTokens: 1024,
    tier: "main",
  });

  let persistedLeadId: string | null = opts.leadId ?? null;
  const conversationId = opts.conversationId || crypto.randomUUID();
  try {
    const events: LeadEvent[] = [];
    if (out.signals.asked_fees) events.push({ type: "asked_fees" });
    if (out.signals.visit_intent) events.push({ type: "visit_intent" });
    if (out.signals.wa_opt_in) events.push({ type: "wa_opt_in" });
    const userTurns = opts.messages.filter((m) => m.role === "user").length;
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
      leadId: opts.leadId || undefined,
      source:
        opts.channel === "voice"
          ? "voice"
          : opts.channel === "whatsapp"
            ? "whatsapp"
            : "aria_chat",
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
      // Instant outbound call, two ways in (guards: cooldown, master switch,
      // business hours unless demo mode / lead-requested):
      //  1. the lead explicitly said yes to a call ("call_requested")
      //  2. the score crossed CALL_SCORE_THRESHOLD (demo: 50, production: 70)
      // Phone presence is checked against the lead doc inside placeOrQueueCall —
      // on WhatsApp the number comes from message metadata, not the chat text.
      if (opts.channel !== "voice") {
        if (out.signals.call_requested) {
          placeOrQueueCall({
            leadId: persistedLeadId,
            reason: `lead asked for a call right now on ${opts.channel.replace("_", " ")} — ${out.nba}`,
            trigger: "requested",
          }).catch((e) => console.error("[ariaEngine] requested-call failed:", e));
        } else if (result.score >= callScoreThreshold()) {
          placeOrQueueCall({
            leadId: persistedLeadId,
            reason: `crossed call threshold (${result.score}) on ${opts.channel.replace("_", " ")} — ${out.nba}`,
            trigger: "auto_hot",
          }).catch((e) => console.error("[ariaEngine] auto-call failed:", e));
        }
      }
      if (out.signals.wa_opt_in) await scheduleDrip(persistedLeadId, out.speaker);

      const msgChannel =
        opts.channel === "voice"
          ? "voice"
          : opts.channel === "whatsapp"
            ? "whatsapp"
            : "web_chat";
      if (!opts.skipUserPersist) {
        const lastUser = opts.messages.filter((m) => m.role === "user").at(-1);
        if (lastUser)
          await addMessage({
            leadId: persistedLeadId,
            conversationId,
            channel: msgChannel,
            role: "user",
            content: lastUser.content,
          });
      }
      await addMessage({
        leadId: persistedLeadId,
        conversationId,
        channel: msgChannel,
        role: "assistant",
        content: out.reply,
        meta: {
          sentiment: out.sentiment,
          speaker: out.speaker,
          stage: out.stage,
          readiness: out.readiness,
          nba: out.nba,
        },
      });
    }
  } catch (e) {
    console.error("[ariaEngine] persistence failed (reply still returned):", e);
  }

  return { ...out, leadId: persistedLeadId, conversationId };
}
