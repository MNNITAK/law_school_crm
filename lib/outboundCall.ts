import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase/admin";
import { COLLEGE } from "@/lib/college";
import { normalizePhone } from "@/lib/whatsapp";

/**
 * Outbound AI calling agent.
 *
 * When a lead turns HOT (on WhatsApp, web chat, or by counsellor click) we place
 * an immediate personalised voice call via Vapi (vapi.ai — bundles telephony,
 * STT, LLM and TTS behind one API).
 *
 * Without VAPI_* env vars the intent is still recorded in the `callQueue`
 * collection and surfaced in the CRM — so the trigger logic is demoable before
 * the telephony account exists, and nothing breaks.
 *
 * Env:
 *   OUTBOUND_CALLS_ENABLED=true       master switch for AUTO calls (manual CRM
 *                                     button works whenever Vapi is configured)
 *   VAPI_API_KEY=...                  dashboard.vapi.ai → API key
 *   VAPI_PHONE_NUMBER_ID=...          a Vapi phone number (import Twilio/Exotel or buy)
 *   APP_BASE_URL=https://law-school-crm.vercel.app   (for the end-of-call webhook)
 *   OUTBOUND_WEBHOOK_SECRET=...       random string; Vapi calls back with it
 */

export function vapiConfigured() {
  return !!(process.env.VAPI_API_KEY && process.env.VAPI_PHONE_NUMBER_ID);
}
export function autoCallsEnabled() {
  return process.env.OUTBOUND_CALLS_ENABLED === "true";
}

/** DEMO_MODE=true → no business-hours gate + 10-min cooldown (instead of 24h),
 *  so a 30-min client demo can fire multiple instant calls. */
export function demoMode() {
  return process.env.DEMO_MODE === "true";
}
/** Score needed for the automatic call. Production default 70 (hot);
 *  set CALL_SCORE_THRESHOLD=50 for the demo's "even mediocre leads get a call". */
export function callScoreThreshold() {
  const n = parseInt(process.env.CALL_SCORE_THRESHOLD || "", 10);
  return Number.isFinite(n) ? n : 70;
}

/** Demo: NO cooldown — every trigger dials instantly. Production: one auto-call/day. */
const COOLDOWN_MS = () => (demoMode() ? 0 : 24 * 3600_000);

type LeadDoc = FirebaseFirestore.DocumentData;

/** Guards for AUTOMATED calls (manual clicks and lead-requested calls bypass hours). */
export function autoCallAllowed(
  lead: LeadDoc,
  trigger: "auto_hot" | "requested" = "auto_hot"
): { ok: boolean; reason: string } {
  if (!autoCallsEnabled()) return { ok: false, reason: "auto calls disabled" };
  if (!lead.phone) return { ok: false, reason: "no phone" };
  if (["dead", "enrolled"].includes(lead.stage))
    return { ok: false, reason: "stage closed" };
  const last = lead.lastAutoCallAt?.toDate?.()?.getTime?.() ?? 0;
  if (Date.now() - last < COOLDOWN_MS())
    return { ok: false, reason: "cooldown (called recently)" };
  // 9:00–20:00 IST window — skipped in demo mode and when the lead ASKED for the call
  if (!demoMode() && trigger !== "requested") {
    const istHour = (new Date().getUTCHours() + 5.5) % 24;
    if (istHour < 9 || istHour >= 20)
      return { ok: false, reason: "outside 9am–8pm IST" };
  }
  return { ok: true, reason: "ok" };
}

/** Personalised system prompt for the phone call, built from the lead's CRM file. */
export function callPrompt(lead: LeadDoc, reason: string, recentContext: string) {
  const course =
    lead.course === "ba_llb"
      ? COLLEGE.programmes.ba_llb.label
      : lead.course === "llb"
        ? COLLEGE.programmes.llb.label
        : null;
  const facts = [
    lead.name && `Their name: ${lead.name}.`,
    course && `Interested in: ${course}.`,
    lead.city && `From: ${lead.city}.`,
    lead.qualifyingPercent && `Qualifying marks: ${lead.qualifyingPercent}%.`,
    lead.persona === "parent" && "You are speaking with a PARENT/GUARDIAN — formal, respectful, ROI-focused.",
  ]
    .filter(Boolean)
    .join(" ");

  return `You are Aria, the admissions counsellor calling from ${COLLEGE.name} (affiliated to ${COLLEGE.affiliation}, College Code ${COLLEGE.collegeCode}). This is a warm follow-up phone call, NOT a cold call — this person just showed strong interest (${reason}).

WHO YOU ARE CALLING: ${facts || "A prospective law student who enquired recently."}
RECENT CONVERSATION CONTEXT: ${recentContext || "They enquired about admissions."}

CALL GOALS, in order: (1) reference what they asked about so the call feels personal, (2) answer remaining questions, (3) book a campus visit (${COLLEGE.address}) or guide them to apply, (4) confirm the best time for a human counsellor to assist if needed.

STYLE: natural spoken Hindi-English mix matching how they speak; short sentences; never robotic; this is a phone call so no lists or formatting. Be warm and human. ROMANIZATION FOR THE VOICE: always write the Hindi pronoun मैं as "mein" (never "main"), and prefer spellings that read correctly aloud (e.g. "hoon", "nahin", "kripya").

HARD RULES: never invent fees, dates, scholarship amounts or placement figures — for those, say the admissions office will confirm (${COLLEGE.phone}). Never claim the campus is open or closed on any particular day, and never invent timings — say the office will confirm the visit slot on ${COLLEGE.phone}. When they want to visit, ACCEPT the day they propose, note it down, and say the team will confirm. If they're busy, offer to call later and end politely. If they ask to stop calls, apologise and end immediately. Keep the call under 5 minutes. Never repeat the same sentence twice.`;
}

function firstMessage(lead: LeadDoc) {
  const name = lead.name ? `, ${String(lead.name).split(" ")[0]}` : "";
  // "mein" (not "main") so the TTS pronounces मैं correctly instead of English "main"
  return lead.persona === "parent"
    ? `Namaste, mein City Law College, Lucknow se Aria bol rahi hoon. Aapne humse enquiry ki thi, isliye personally baat karne ke liye call kiya. Kahiye, mein aapki kya madad kar sakti hoon?`
    : `Hi${name}! Mein Aria, City Law College Lucknow se. Aapne abhi humse baat ki thi na — bas usi baare mein personally baat karne ke liye call kiya. Kaise hain aap?`;
}

/**
 * Place the call via Vapi, or queue the intent if Vapi isn't configured yet.
 * Returns what happened so callers/CRM can show it.
 */
export async function placeOrQueueCall(opts: {
  leadId: string;
  reason: string; // e.g. "went HOT on WhatsApp — asked about fees and visit"
  trigger: "auto_hot" | "requested" | "counsellor";
}): Promise<{ status: "placed" | "queued" | "skipped"; detail: string }> {
  const db = getDb();
  if (!db) return { status: "skipped", detail: "db unconfigured" };
  const ref = db.collection("leads").doc(opts.leadId);
  const snap = await ref.get();
  if (!snap.exists) return { status: "skipped", detail: "lead not found" };
  const lead = snap.data()!;

  if (opts.trigger === "auto_hot" || opts.trigger === "requested") {
    const gate = autoCallAllowed(lead, opts.trigger);
    if (!gate.ok) {
      // log the skip so "no call" is never a mystery in the dashboard/queue
      await db.collection("callQueue").add({
        leadId: opts.leadId,
        phone: lead.phone ?? null,
        name: lead.name ?? null,
        reason: opts.reason,
        trigger: opts.trigger,
        status: "skipped",
        error: gate.reason,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { status: "skipped", detail: gate.reason };
    }
  } else if (!lead.phone) {
    return { status: "skipped", detail: "no phone" };
  }

  // recent context = last few messages, newest last
  const msgs = await ref
    .collection("messages")
    .orderBy("createdAt", "desc")
    .limit(6)
    .get();
  const recentContext = msgs.docs
    .reverse()
    .map((m) => `${m.data().role === "user" ? "Lead" : "Aria"}: ${String(m.data().content).slice(0, 160)}`)
    .join(" | ");

  const queueDoc = {
    leadId: opts.leadId,
    phone: lead.phone,
    name: lead.name ?? null,
    reason: opts.reason,
    trigger: opts.trigger,
    createdAt: FieldValue.serverTimestamp(),
  };

  if (!vapiConfigured()) {
    await db.collection("callQueue").add({ ...queueDoc, status: "pending_provider" });
    await ref.collection("events").add({
      type: "outbound_call_queued",
      points: 0,
      detail: { reason: opts.reason, note: "telephony provider not connected yet" },
      createdAt: FieldValue.serverTimestamp(),
    });
    return { status: "queued", detail: "Vapi not configured — intent recorded in callQueue" };
  }

  const base = process.env.APP_BASE_URL || "https://law-school-crm.vercel.app";
  const secret = process.env.OUTBOUND_WEBHOOK_SECRET || "";
  const body = {
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
    customer: {
      number: "+" + normalizePhone(String(lead.phone)),
      name: lead.name ?? undefined,
    },
    assistant: {
      firstMessage: firstMessage(lead),
      model: {
        provider: "openai",
        model: process.env.VAPI_MODEL || "gpt-4o",
        messages: [
          { role: "system", content: callPrompt(lead, opts.reason, recentContext) },
        ],
      },
      // VAPI_VOICE_PROVIDER=rumik → our custom-TTS bridge: the SAME rumik voice
      // as the website's Voice Counsel, with ElevenLabs as automatic fallback.
      // Otherwise: ElevenLabs multilingual (or whatever env overrides say).
      voice:
        process.env.VAPI_VOICE_PROVIDER === "rumik"
          ? {
              provider: "custom-voice",
              server: {
                url: `${base}/api/tts/vapi`,
                secret: secret || undefined,
                timeoutSeconds: 20,
              },
              fallbackPlan: {
                voices: [{ provider: "11labs", voiceId: "sarah" }],
              },
            }
          : {
              provider: process.env.VAPI_VOICE_PROVIDER || "11labs",
              voiceId: process.env.VAPI_VOICE_ID || "sarah",
              ...(!process.env.VAPI_VOICE_PROVIDER ||
              process.env.VAPI_VOICE_PROVIDER === "11labs"
                ? { model: process.env.VAPI_VOICE_MODEL || "eleven_turbo_v2_5" }
                : {}),
            },
      transcriber: {
        provider: "deepgram",
        model: "nova-2",
        language: process.env.VAPI_STT_LANG || "hi",
      },
      server: { url: `${base}/api/voice/outbound-webhook?key=${secret}` },
      maxDurationSeconds: 360,
      metadata: { leadId: opts.leadId, trigger: opts.trigger },
    },
  };

  const res = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) {
    console.error("[outboundCall] vapi error", res.status, data);
    await db.collection("callQueue").add({ ...queueDoc, status: "failed", error: data.message ?? res.status });
    return { status: "skipped", detail: `vapi error: ${data.message ?? res.status}` };
  }

  await db.collection("callQueue").add({ ...queueDoc, status: "placed", vapiCallId: data.id ?? null });
  await ref.set(
    { lastAutoCallAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  await ref.collection("events").add({
    type: "outbound_call_placed",
    points: 0,
    detail: { reason: opts.reason, vapiCallId: data.id ?? null, trigger: opts.trigger },
    createdAt: FieldValue.serverTimestamp(),
  });
  return { status: "placed", detail: data.id ?? "call created" };
}
