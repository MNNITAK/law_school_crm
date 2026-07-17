import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase/admin";
import { EVENT_POINTS, blendScore, temperatureFor, clamp } from "@/lib/scoring";

export type LeadEvent = { type: string; points?: number; detail?: unknown };

export type LeadPatch = Partial<{
  name: string;
  phone: string;
  email: string;
  city: string;
  course: "ba_llb" | "llb";
  qualifyingPercent: number;
  category: string;
  eligibilityStatus: string;
  persona: "student" | "parent";
  stage: string;
  llmReadiness: number;
  waOptIn: boolean;
  lastCallOutcome: string;
  notes: string;
  nextBestAction: string;
  sentiment: string;
  handoffAt: unknown;
  assignedTo: string;
}>;

/** Create or update a lead, apply scored events, recompute blended score. Returns leadId (or null when Firestore isn't configured). */
export async function upsertLead(opts: {
  leadId?: string;
  source?: string;
  patch?: LeadPatch;
  events?: LeadEvent[];
}): Promise<{
  leadId: string | null;
  score: number;
  temperature: string;
  created: boolean;
}> {
  const db = getDb();
  if (!db) return { leadId: null, score: 0, temperature: "cold", created: false };

  const leads = db.collection("leads");
  let ref = opts.leadId ? leads.doc(opts.leadId) : null;
  let existing: FirebaseFirestore.DocumentData | null = null;

  if (ref) {
    const snap = await ref.get();
    existing = snap.exists ? snap.data()! : null;
    if (!existing) ref = null;
  }
  // dedupe by phone when creating and a phone is arriving
  if (!ref && opts.patch?.phone) {
    const dup = await leads
      .where("phone", "==", opts.patch.phone)
      .limit(1)
      .get();
    if (!dup.empty) {
      ref = dup.docs[0].ref;
      existing = dup.docs[0].data();
    }
  }
  let created = false;
  if (!ref) {
    created = true;
    ref = leads.doc();
    await ref.set({
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastContactAt: FieldValue.serverTimestamp(),
      source: opts.source ?? "web",
      stage: "new",
      persona: "student",
      ruleScore: 0,
      llmReadiness: null,
      score: 0,
      temperature: "cold",
      waOptIn: false,
      name: null,
      phone: null,
      email: null,
      city: null,
      course: null,
    });
    existing = (await ref.get()).data()!;
  }

  // derive implicit capture events
  const events: LeadEvent[] = [...(opts.events ?? [])];
  const patch: Record<string, unknown> = { ...(opts.patch ?? {}) };
  if (patch.name && !existing?.name) events.push({ type: "name_captured" });
  if (patch.phone && !existing?.phone) events.push({ type: "phone_captured" });
  if (patch.city && !existing?.city) events.push({ type: "city_captured" });
  if (patch.persona === "parent" && existing?.persona !== "parent")
    events.push({ type: "parent_detected" });

  // don't clobber existing values with null/undefined
  for (const k of Object.keys(patch)) {
    if (patch[k] == null || patch[k] === "") delete patch[k];
  }

  // stage only ever progresses (except explicit "dead")
  const STAGE_ORDER = [
    "new",
    "engaged",
    "qualified",
    "visit_scheduled",
    "applied",
    "enrolled",
  ];
  if (patch.stage && patch.stage !== "dead") {
    const cur = STAGE_ORDER.indexOf(existing?.stage ?? "new");
    const next = STAGE_ORDER.indexOf(String(patch.stage));
    if (next <= cur) delete patch.stage;
  }

  // "now" sentinel: set handoffAt once, never overwrite
  if (patch.handoffAt === "now") {
    if (existing?.handoffAt) delete patch.handoffAt;
    else patch.handoffAt = FieldValue.serverTimestamp();
  }

  let ruleScore = existing?.ruleScore ?? 0;
  const batch = db.batch();
  for (const ev of events) {
    const points = ev.points ?? EVENT_POINTS[ev.type] ?? 0;
    ruleScore = clamp(ruleScore + points, 0, 100);
    batch.set(ref.collection("events").doc(), {
      type: ev.type,
      points,
      detail: ev.detail ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  const llmReadiness =
    (patch.llmReadiness as number | undefined) ?? existing?.llmReadiness ?? null;
  const score = blendScore(ruleScore, llmReadiness);
  const temperature = temperatureFor(score);

  batch.set(
    ref,
    {
      ...patch,
      ruleScore,
      score,
      temperature,
      updatedAt: FieldValue.serverTimestamp(),
      lastContactAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await batch.commit();
  return { leadId: ref.id, score, temperature, created };
}

export async function addMessage(opts: {
  leadId: string;
  conversationId: string;
  channel: "web_chat" | "voice" | "whatsapp";
  role: "user" | "assistant" | "counsellor";
  content: string;
  meta?: unknown;
}) {
  const db = getDb();
  if (!db) return;
  const leadRef = db.collection("leads").doc(opts.leadId);
  await leadRef.collection("messages").add({
    conversationId: opts.conversationId,
    channel: opts.channel,
    role: opts.role,
    content: opts.content,
    meta: opts.meta ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });

  // Speed-to-lead: stamp the first time Aria (the agent) contacts this lead,
  // once, so reports can measure enquiry → first-response time. A transaction
  // keeps two concurrent assistant turns from both writing it.
  if (opts.role === "assistant") {
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(leadRef);
        if (snap.exists && !snap.data()!.firstContactAt) {
          tx.update(leadRef, {
            firstContactAt: FieldValue.serverTimestamp(),
            firstContactChannel: opts.channel,
          });
        }
      });
    } catch (e) {
      console.error("[leads] firstContactAt stamp failed:", e);
    }
  }
}

export function dbOrNull(): Firestore | null {
  return getDb();
}
