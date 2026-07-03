import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase/admin";
import { COLLEGE } from "@/lib/college";

const DAY = 24 * 60 * 60 * 1000;

/** Drip copy — persona-aware. {name} is replaced at send time. */
export const DRIP_STEPS = [
  {
    step: "day1_eligibility",
    afterDays: 1,
    student: `Hi {name}! 👋 Riya here from City Law College, Lucknow. Great news — based on what you shared, you're eligible to apply for ${COLLEGE.session}. Want me to walk you through the next step? It takes 5 minutes.`,
    parent: `Namaste, this is the admissions office of City Law College, Lucknow (University of Lucknow, Code ${COLLEGE.collegeCode}). Following up on your enquiry — your ward is eligible to apply for ${COLLEGE.session}. We would be glad to assist with the application or arrange a campus visit. — ${COLLEGE.phone}`,
  },
  {
    step: "day3_success_story",
    afterDays: 3,
    student: `Quick story {name} — one of our students walked into her first moot court terrified, and by final year she was interning with a High Court advocate. That's what 5 years here does. ⚖️ Any questions I can answer about BA LL.B or LL.B?`,
    parent: `A note from City Law College: our Training & Placement Cell arranges structured internships across Lucknow's courts and chambers for every batch. Happy to share programme details for your ward — or arrange a call with our senior counsellor at your convenience. — ${COLLEGE.phone}`,
  },
  {
    step: "day7_visit_invite",
    afterDays: 7,
    student: `{name}, the best way to choose a college is to walk its corridors. 🏛️ Come see the moot court hall and campus — we're in Sector 9, Jankipuram Vistar. Reply with a day that works and I'll set up your visit!`,
    parent: `You are warmly invited to visit City Law College with your ward — Sector 9, Jankipuram Vistar (AKTU–CDRI Road), Lucknow. Our team can arrange a guided visit at a time convenient to you. Kindly share a preferred day, or call ${COLLEGE.phone}.`,
  },
] as const;

export const REVIVAL_MESSAGE = {
  step: "revival_1",
  student: `Hi {name}! It's been a while since you looked at City Law College. Admissions for ${COLLEGE.session} are moving — seats fill on merit, and I'd hate for you to miss the window. Still thinking about law? I'm right here. 🙂`,
  parent: `Greetings from City Law College, Lucknow. Admissions for ${COLLEGE.session} are underway and seats are allotted on merit. If your ward is still considering law, our team would be glad to assist. — ${COLLEGE.phone}`,
};

/** Schedule the Day 1/3/7 drip for a lead (idempotent — skips if already scheduled). */
export async function scheduleDrip(
  leadId: string,
  persona: "student" | "parent" = "student"
) {
  const db = getDb();
  if (!db) return false;
  const existing = await db
    .collection("followups")
    .where("leadId", "==", leadId)
    .where("sequence", "==", "onboarding_drip")
    .limit(1)
    .get();
  if (!existing.empty) return false;

  const batch = db.batch();
  const now = Date.now();
  for (const s of DRIP_STEPS) {
    batch.set(db.collection("followups").doc(), {
      leadId,
      sequence: "onboarding_drip",
      step: s.step,
      channel: "whatsapp",
      persona,
      dueAt: new Date(now + s.afterDays * DAY),
      status: "pending",
      payload: null,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  return true;
}

export function renderDrip(
  step: string,
  persona: "student" | "parent",
  name?: string | null
): string {
  const all = [...DRIP_STEPS.map((s) => ({ step: s.step, student: s.student, parent: s.parent })), REVIVAL_MESSAGE];
  const s = all.find((x) => x.step === step);
  if (!s) return "";
  const tmpl = persona === "parent" ? s.parent : s.student;
  return tmpl.replace(/\{name\}/g, name || "there");
}

/** Stop pending automated sends for a lead (called on human handoff / inbound reply). */
export async function pauseAutomation(leadId: string, reason: string) {
  const db = getDb();
  if (!db) return;
  const pending = await db
    .collection("followups")
    .where("leadId", "==", leadId)
    .where("status", "==", "pending")
    .get();
  const batch = db.batch();
  pending.docs.forEach((doc) =>
    batch.update(doc.ref, { status: "skipped", skipReason: reason })
  );
  await batch.commit();
}
