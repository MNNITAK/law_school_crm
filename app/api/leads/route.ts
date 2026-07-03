import { NextRequest, NextResponse } from "next/server";
import { upsertLead, type LeadEvent, type LeadPatch } from "@/lib/leads";

export const runtime = "nodejs";

/** Public lead capture: apply form, eligibility checker, quiz end-screen. */
export async function POST(req: NextRequest) {
  let body: {
    leadId?: string;
    source?: string;
    patch?: LeadPatch;
    event?: LeadEvent;
    events?: LeadEvent[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const events = [...(body.events ?? []), ...(body.event ? [body.event] : [])];
  // basic abuse guard: cap payload sizes
  if (events.length > 10)
    return NextResponse.json({ error: "too many events" }, { status: 400 });

  try {
    const result = await upsertLead({
      leadId: body.leadId,
      source: body.source,
      patch: sanitizePatch(body.patch),
      events,
    });
    return NextResponse.json({ ok: true, persisted: !!result.leadId, ...result });
  } catch (e) {
    console.error("[/api/leads]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

/** Only allow whitelisted fields from the public site. */
function sanitizePatch(patch?: LeadPatch): LeadPatch | undefined {
  if (!patch) return undefined;
  const allowed: (keyof LeadPatch)[] = [
    "name",
    "phone",
    "email",
    "city",
    "course",
    "qualifyingPercent",
    "category",
    "eligibilityStatus",
    "persona",
    "stage",
    "waOptIn",
  ];
  const out: Record<string, unknown> = {};
  for (const k of allowed) {
    if (patch[k] !== undefined) out[k] = patch[k];
  }
  // never allow the public site to set arbitrary stages
  if (out.stage && !["new", "engaged", "applied"].includes(String(out.stage)))
    delete out.stage;
  if (out.name) out.name = String(out.name).slice(0, 80);
  if (out.phone) out.phone = String(out.phone).replace(/[^\d+]/g, "").slice(0, 15);
  return out as LeadPatch;
}
