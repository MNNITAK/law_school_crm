import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase/admin";
import { verifyAdmin } from "@/lib/adminAuth";
import { generateStructured, aiConfigured } from "@/lib/ai";
import { COLLEGE } from "@/lib/college";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Conversational analytics — an LLM reads recent lead transcripts and reports
 * the patterns a dashboard can't: top objections, where leads drop off, what's
 * working, and recommendations. Admin-only. Result is cached per IST day in
 * settings/insights:{date}; ?refresh=1 recomputes.
 *
 * Honesty: we bound how much we read (lead count + a character budget) and
 * report the actual sampleSize, so this never implies it read everything.
 */
const LEAD_CAP = 60; // most recent leads considered
const MSGS_PER_LEAD = 12;
const CHAR_BUDGET = 24_000; // total transcript characters fed to the model

const Insights = z.object({
  topObjections: z
    .array(z.object({ objection: z.string(), note: z.string() }))
    .max(6),
  dropoffStages: z
    .array(z.object({ stage: z.string(), why: z.string() }))
    .max(5),
  whatsWorking: z.array(z.string()).max(6),
  recommendations: z.array(z.string()).max(6),
});

function istDateKey() {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const uid = await verifyAdmin(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "unconfigured" }, { status: 503 });

  const cacheRef = db.collection("settings").doc(`insights:${istDateKey()}`);
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  if (!refresh) {
    const cached = await cacheRef.get();
    if (cached.exists) return NextResponse.json({ cached: true, ...cached.data() });
  }

  if (!aiConfigured())
    return NextResponse.json({ error: "ai_unconfigured" }, { status: 503 });

  // pull the most recent leads and their conversations
  const leadSnap = await db
    .collection("leads")
    .orderBy("createdAt", "desc")
    .limit(LEAD_CAP)
    .get();

  const blocks = await Promise.all(
    leadSnap.docs.map(async (d) => {
      const l = d.data();
      const msgs = await d.ref
        .collection("messages")
        .orderBy("createdAt", "asc")
        .limit(MSGS_PER_LEAD)
        .get();
      if (msgs.empty) return null;
      const lines = msgs.docs
        .map((m) => {
          const r = m.data().role;
          const who = r === "user" ? "Lead" : r === "counsellor" ? "Counsellor" : "Aria";
          return `${who}: ${String(m.data().content).slice(0, 200)}`;
        })
        .join("\n");
      return `--- Lead (stage ${l.stage ?? "?"}, ${l.temperature ?? "?"}) ---\n${lines}`;
    })
  );

  // apply the character budget; sampleSize = conversations actually included
  let used = 0;
  let sampleSize = 0;
  const chosen: string[] = [];
  for (const b of blocks) {
    if (!b) continue;
    if (used + b.length > CHAR_BUDGET) break;
    chosen.push(b);
    used += b.length;
    sampleSize++;
  }

  if (!sampleSize)
    return NextResponse.json({ error: "no_conversations" }, { status: 404 });

  try {
    const result = await generateStructured({
      system: `You analyse recent admissions conversations for ${COLLEGE.name} and report patterns for the admissions team. Ground every point in what leads actually said across the transcripts below — do not invent. Programmes: ${COLLEGE.programmes.ba_llb.label}, ${COLLEGE.programmes.llb.label}.`,
      messages: [
        {
          role: "user",
          content: `Here are ${sampleSize} recent lead conversations:\n\n${chosen.join(
            "\n\n"
          )}\n\nReport the top objections, the stages where leads drop off, what's working well, and concrete recommendations.`,
        },
      ],
      schema: Insights,
      maxTokens: 1500,
      tier: "main",
    });

    const payload = {
      ...result,
      sampleSize,
      generatedAt: FieldValue.serverTimestamp(),
    };
    await cacheRef.set(payload, { merge: true });
    return NextResponse.json({ cached: false, ...result, sampleSize });
  } catch (e) {
    console.error("[/api/admin/insights]", e);
    return NextResponse.json({ error: "ai_failed" }, { status: 502 });
  }
}
