import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase/admin";
import { verifyAdmin } from "@/lib/adminAuth";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { renderDrip } from "@/lib/followups";
import { addMessage } from "@/lib/leads";

export const runtime = "nodejs";

/** Counsellor-triggered send (admin only): a drip step or free-form text to a lead. */
export async function POST(req: NextRequest) {
  const uid = await verifyAdmin(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "unconfigured" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as {
    leadId?: string;
    step?: string;
    text?: string;
  } | null;
  if (!body?.leadId)
    return NextResponse.json({ error: "leadId required" }, { status: 400 });

  const leadSnap = await db.collection("leads").doc(body.leadId).get();
  if (!leadSnap.exists)
    return NextResponse.json({ error: "lead not found" }, { status: 404 });
  const lead = leadSnap.data()!;
  if (!lead.phone)
    return NextResponse.json({ error: "lead has no phone" }, { status: 400 });

  const text =
    body.text ??
    renderDrip(
      body.step ?? "day1_eligibility",
      (lead.persona as "student" | "parent") ?? "student",
      lead.name
    );
  const result = await sendWhatsAppText(lead.phone, text);
  if (!result.ok)
    return NextResponse.json({ error: result.error }, { status: 502 });

  await addMessage({
    leadId: body.leadId,
    conversationId: "whatsapp",
    channel: "whatsapp",
    role: "counsellor",
    content: text,
    meta: { waMessageId: result.id, sentBy: uid, step: body.step ?? null },
  });
  await leadSnap.ref.update({ lastContactAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true, id: result.id });
}
