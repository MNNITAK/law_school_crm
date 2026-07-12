import { NextRequest, NextResponse } from "next/server";
import { makeLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Server proxy to rumik.ai Silk TTS (the key never reaches the browser).
 * POST { text, sessionId? } → audio/wav. Client falls back to browser speechSynthesis on any failure.
 * Model: "muga" — rumik's expressive Hinglish voice.
 */
const RUMIK_URL = process.env.RUMIK_TTS_URL || "https://silk-api.rumik.ai/v1/tts";

/* 30/min per voice session + high per-IP ceiling (campus NAT — see lib/rateLimit) */
const limited = makeLimiter({ perKey: 30, perIp: 120 });

export async function POST(req: NextRequest) {
  const key = process.env.RUMIK_API_KEY;
  if (!key) return NextResponse.json({ error: "tts_unconfigured" }, { status: 503 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";

  const body = (await req.json().catch(() => null)) as {
    text?: string;
    sessionId?: string;
  } | null;
  const text = body?.text?.slice(0, 600);
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  if (limited(body?.sessionId?.slice(0, 64), ip))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  try {
    const res = await fetch(RUMIK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: process.env.RUMIK_MODEL || "muga", text }),
    });
    if (!res.ok) {
      console.error("[tts] rumik error", res.status, await res.text().catch(() => ""));
      return NextResponse.json({ error: "tts_failed" }, { status: 502 });
    }
    const audio = await res.arrayBuffer();
    return new NextResponse(audio, {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[tts]", e);
    return NextResponse.json({ error: "tts_failed" }, { status: 502 });
  }
}
