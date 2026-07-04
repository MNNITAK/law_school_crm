import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/adminAuth";
import { placeOrQueueCall } from "@/lib/outboundCall";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Counsellor-triggered AI call from the CRM ("Call now (AI)" button). */
export async function POST(req: NextRequest) {
  const uid = await verifyAdmin(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { leadId?: string } | null;
  if (!body?.leadId)
    return NextResponse.json({ error: "leadId required" }, { status: 400 });

  const result = await placeOrQueueCall({
    leadId: body.leadId,
    reason: "counsellor requested an immediate AI call from the CRM",
    trigger: "counsellor",
  });
  return NextResponse.json(result, {
    status: result.status === "skipped" ? 409 : 200,
  });
}
