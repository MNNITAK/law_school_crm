import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase/admin";
import { upsertLead, addMessage } from "@/lib/leads";
import { pauseAutomation } from "@/lib/followups";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { runAria } from "@/lib/ariaEngine";
import { aiConfigured, type ChatMsg } from "@/lib/ai";
import { renderTemplate } from "@/lib/templates";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Meta webhook verification handshake. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (
    sp.get("hub.mode") === "subscribe" &&
    sp.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

/**
 * Inbound WhatsApp → the Aria bot converses right on WhatsApp:
 *  1. attach the message to the lead (dedupe by phone), score +15 wa_replied
 *  2. run the same Aria engine as web chat — extraction, scoring, drip opt-in
 *  3. reply via Cloud API (compliant: inside the 24h customer-service window)
 *  4. once the lead goes hot / asks for a human, Aria stops and the counsellor takes over
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    entry?: {
      changes?: {
        value?: {
          messages?: {
            from: string;
            id: string;
            type: string;
            text?: { body: string };
          }[];
          contacts?: { profile?: { name?: string }; wa_id: string }[];
        };
      }[];
    }[];
  } | null;

  // Always 200 quickly — Meta retries otherwise.
  if (!body?.entry || !getDb()) return NextResponse.json({ ok: true });

  try {
    for (const entry of body.entry) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        for (const msg of value?.messages ?? []) {
          if (msg.type !== "text" || !msg.text?.body) continue;
          await handleInbound(
            msg.from,
            msg.text.body,
            msg.id,
            value?.contacts?.[0]?.profile?.name
          );
        }
      }
    }
  } catch (e) {
    console.error("[wa webhook]", e);
  }
  return NextResponse.json({ ok: true });
}

async function handleInbound(
  from: string,
  text: string,
  waMessageId: string,
  profileName?: string
) {
  const db = getDb()!;
  const phone = from.startsWith("91") && from.length === 12 ? from.slice(2) : from;

  // 1. lead + inbound message + engagement score
  const { leadId, created } = await upsertLead({
    source: "whatsapp",
    patch: { phone, name: profileName || undefined, waOptIn: true },
    events: [{ type: "wa_replied" }],
  });
  if (!leadId) return;
  await addMessage({
    leadId,
    conversationId: "whatsapp",
    channel: "whatsapp",
    role: "user",
    content: text,
    meta: { waMessageId },
  });

  // first contact → instant welcome card with the college essentials,
  // then Aria's personal reply follows
  if (created) {
    const welcome = renderTemplate("welcome_details", "student", profileName);
    if (welcome) {
      await sendWhatsAppText(from, welcome);
      await addMessage({
        leadId,
        conversationId: "whatsapp",
        channel: "whatsapp",
        role: "assistant",
        content: welcome,
        meta: { template: "welcome_details", automated: true },
      });
    }
  }
  // they're actively talking — pending drip steps would be noise
  await pauseAutomation(leadId, "lead is in live conversation");

  // 2. human handoff check: once a counsellor owns the lead, the bot stays quiet
  const lead = (await db.collection("leads").doc(leadId).get()).data()!;
  if (lead.handoffAt || ["dead", "enrolled"].includes(lead.stage)) return;
  if (!aiConfigured()) return;

  // 3. rebuild recent WhatsApp history for context (oldest → newest)
  // (channel filtered in memory — avoids needing a composite Firestore index)
  const historySnap = await db
    .collection("leads")
    .doc(leadId)
    .collection("messages")
    .orderBy("createdAt", "desc")
    .limit(30)
    .get();
  const history: ChatMsg[] = historySnap.docs
    .map((d) => d.data())
    .filter((m) => m.channel === "whatsapp")
    .slice(0, 12)
    .reverse()
    .map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: String(m.content).slice(0, 2000),
    }));
  if (!history.length || history.at(-1)?.role !== "user")
    history.push({ role: "user", content: text.slice(0, 2000) });

  // 4. Aria turn (persists reply + scoring; user turn already stored above)
  try {
    const out = await runAria({
      leadId,
      conversationId: "whatsapp",
      channel: "whatsapp",
      messages: history,
      skipUserPersist: true,
    });
    const replyText = out.reply.replace(/\n{2,}/g, "\n\n").trim();
    if (replyText) await sendWhatsAppText(from, replyText);
  } catch (e) {
    console.error("[wa webhook] aria turn failed:", e);
  }
}
