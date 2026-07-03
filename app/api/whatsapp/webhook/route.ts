import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase/admin";
import { upsertLead, addMessage } from "@/lib/leads";
import { pauseAutomation } from "@/lib/followups";

export const runtime = "nodejs";

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

/** Inbound WhatsApp messages → attach to lead, score, pause automation (human takes over). */
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
          const phone = msg.from.startsWith("91") ? msg.from.slice(2) : msg.from;
          const name = value?.contacts?.[0]?.profile?.name;
          const { leadId } = await upsertLead({
            source: "whatsapp",
            patch: { phone, name: name || undefined },
            events: [{ type: "wa_replied" }],
          });
          if (leadId) {
            await addMessage({
              leadId,
              conversationId: "whatsapp",
              channel: "whatsapp",
              role: "user",
              content: msg.text.body,
              meta: { waMessageId: msg.id },
            });
            // human handoff: an inbound reply stops the automated drip
            await pauseAutomation(leadId, "lead replied — human takes over");
            await upsertLead({
              leadId,
              patch: { handoffAt: "now" } as Parameters<typeof upsertLead>[0]["patch"],
            });
          }
        }
      }
    }
  } catch (e) {
    console.error("[wa webhook]", e);
  }
  return NextResponse.json({ ok: true });
}
