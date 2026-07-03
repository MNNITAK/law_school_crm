import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateStructured, aiConfigured } from "@/lib/ai";
import { getDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const maxDuration = 30;

const Verdict = z.object({
  archetype: z.enum(["The Litigator", "The Counsel", "The Negotiator"]),
  headline: z.string().describe("One punchy line delivering the verdict"),
  reasoning: z
    .string()
    .describe(
      "2-3 warm sentences that reference the aspirant's ACTUAL choices and what they reveal about how they reason"
    ),
  strengths: z.array(z.string()).length(3).describe("three short strength labels"),
  advocacy_instinct: z.number().int().min(50).max(98),
  reasoning_style: z.string().describe("2-4 word label, e.g. 'Principle-first' or 'Evidence-led'"),
  suggested_programme: z.enum(["BA LL.B (Hons.)", "LL.B", "Either"]),
});

const Body = z.object({
  answers: z.object({
    side: z.enum(["buyer", "owner"]),
    open: z.enum(["rule", "fair", "fact"]),
    push: z.enum(["principle", "concede", "evidence"]),
  }),
});

const CASE = `Fact pattern shown to the aspirant: A shop tags a phone at ₹15,000. At the counter the owner says the real price is ₹18,000 — "the label was a mistake." The buyer refuses to pay a rupee more than the tag.
Step 1 (side): buyer = "a displayed price is a promise", owner = "a genuine error can't bind you to a loss".
Step 2 (opening): rule = lead with what the displayed price legally means; fair = lead with what an ordinary person expects; fact = pin down exactly what was said and when.
Step 3 (judge pushes back "isn't this a small sum to fuss over?"): principle = "the amount is small, the principle isn't"; concede = narrow the claim to what's clearly owed; evidence = "let the record decide".`;

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });

  if (!aiConfigured())
    return NextResponse.json({ error: "ai_unconfigured" }, { status: 503 });

  const { answers } = parsed.data;
  try {
    const verdict = await generateStructured({
      system: `You judge "The First Case" — a 60-second advocacy-instinct read for law-school aspirants at City Law College, Lucknow. You are warm, specific and encouraging: every archetype is a strength, never a criticism. Litigator ≈ principle/rule-driven fighters; Counsel ≈ evidence-led, precise builders of a record; Negotiator ≈ pragmatic, fairness-driven dealmakers. Pick the archetype that best fits the pattern of their three choices (not any single answer).\n\n${CASE}`,
      messages: [
        {
          role: "user",
          content: `The aspirant chose: side=${answers.side}, opening=${answers.open}, response to the bench=${answers.push}. Deliver the verdict.`,
        },
      ],
      schema: Verdict,
      maxTokens: 800,
      tier: "task",
    });

    // persist attempt (best effort)
    try {
      const db = getDb();
      if (db)
        await db.collection("quizAttempts").add({
          answers,
          ...verdict,
          createdAt: FieldValue.serverTimestamp(),
        });
    } catch (e) {
      console.error("[quiz] persist failed", e);
    }

    return NextResponse.json(verdict);
  } catch (e) {
    console.error("[/api/quiz/verdict]", e);
    return NextResponse.json({ error: "ai_failed" }, { status: 502 });
  }
}
