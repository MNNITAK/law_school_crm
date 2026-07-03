import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase/admin";
import { renderDrip, REVIVAL_MESSAGE } from "@/lib/followups";
import { sendWhatsAppText, waDeepLink, waConfigured } from "@/lib/whatsapp";
import { addMessage, upsertLead } from "@/lib/leads";

export const runtime = "nodejs";
export const maxDuration = 300;

const DAY = 24 * 60 * 60 * 1000;

/**
 * Daily runner (Vercel Cron, 09:00 IST):
 *  1. send due drip/revival steps (Cloud API for test recipients; assisted wa.me otherwise)
 *  2. dead-lead revival for leads quiet > 14 days (+ inactivity score decay after 7)
 *  3. keeps Firestore warm and rolls up daily counters for /admin/reports
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, reason: "db unconfigured" });

  const now = Date.now();
  const report = { sent: 0, assisted: 0, revived: 0, decayed: 0, failed: 0 };

  /* ---- 1. due followups ---- */
  const due = await db
    .collection("followups")
    .where("status", "==", "pending")
    .where("dueAt", "<=", Timestamp.fromMillis(now))
    .limit(100)
    .get();

  for (const doc of due.docs) {
    const f = doc.data();
    try {
      const leadSnap = await db.collection("leads").doc(f.leadId).get();
      if (!leadSnap.exists) {
        await doc.ref.update({ status: "skipped", skipReason: "lead missing" });
        continue;
      }
      const lead = leadSnap.data()!;
      // automation stops after human handoff or dead/enrolled stages
      if (lead.handoffAt || ["dead", "enrolled"].includes(lead.stage)) {
        await doc.ref.update({ status: "skipped", skipReason: "handoff/closed" });
        continue;
      }
      if (!lead.phone) {
        await doc.ref.update({ status: "skipped", skipReason: "no phone" });
        continue;
      }
      const text = renderDrip(f.step, f.persona ?? lead.persona ?? "student", lead.name);
      let delivered = false;
      if (waConfigured()) {
        const res = await sendWhatsAppText(lead.phone, text);
        if (res.ok) {
          delivered = true;
          await doc.ref.update({
            status: "sent",
            sentAt: FieldValue.serverTimestamp(),
            payload: { text, waMessageId: res.id ?? null },
          });
          await addMessage({
            leadId: f.leadId,
            conversationId: "whatsapp",
            channel: "whatsapp",
            role: "assistant",
            content: text,
            meta: { automated: true, step: f.step },
          });
          report.sent++;
        }
      }
      if (!delivered) {
        // outside the 5 test recipients (or WA unconfigured) → assisted send
        await doc.ref.update({
          status: "ready_for_counsellor",
          payload: { text, waLink: waDeepLink(lead.phone, text) },
        });
        report.assisted++;
      }
    } catch (e) {
      console.error("[cron] followup failed", doc.id, e);
      await doc.ref.update({ status: "failed" });
      report.failed++;
    }
  }

  /* ---- 2. revival + decay ---- */
  const quietCutoff = Timestamp.fromMillis(now - 14 * DAY);
  const quiet = await db
    .collection("leads")
    .where("lastContactAt", "<=", quietCutoff)
    .limit(100)
    .get();

  for (const doc of quiet.docs) {
    const lead = doc.data();
    if (["dead", "enrolled", "applied"].includes(lead.stage)) continue;
    if (lead.revivalScheduled) {
      // second time quiet after a revival — decay the score
      if (!lead.decayed) {
        await upsertLead({
          leadId: doc.id,
          events: [{ type: "inactivity_decay" }],
        });
        await doc.ref.update({ decayed: true });
        report.decayed++;
      }
      continue;
    }
    await db.collection("followups").add({
      leadId: doc.id,
      sequence: "dead_lead_revival",
      step: REVIVAL_MESSAGE.step,
      channel: "whatsapp",
      persona: lead.persona ?? "student",
      dueAt: Timestamp.fromMillis(now), // due immediately (next run or this one's tail)
      status: "pending",
      payload: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    await doc.ref.update({ revivalScheduled: true });
    await upsertLead({ leadId: doc.id, events: [{ type: "revived" }] });
    report.revived++;
  }

  /* ---- 3. daily rollup ---- */
  const dayKey = new Date().toISOString().slice(0, 10);
  const allLeads = await db.collection("leads").count().get();
  const hot = await db
    .collection("leads")
    .where("temperature", "==", "hot")
    .count()
    .get();
  await db
    .collection("settings")
    .doc(`report:${dayKey}`)
    .set(
      {
        date: dayKey,
        totalLeads: allLeads.data().count,
        hotLeads: hot.data().count,
        ...report,
        ranAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  return NextResponse.json({ ok: true, ...report });
}
