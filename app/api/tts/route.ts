import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Server proxy to rumik.ai Silk TTS (the key never reaches the browser).
 * POST { text } → audio/wav. Client falls back to browser speechSynthesis on any failure.
 * Model: "muga" — rumik's expressive Hinglish voice.
 */
const RUMIK_URL = process.env.RUMIK_TTS_URL || "https://silk-api.rumik.ai/v1/tts";

const hits = new Map<string, { n: number; t: number }>();
function rateLimited(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 60_000) {
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  h.n++;
  return h.n > 30;
}

export async function POST(req: NextRequest) {
  const key = process.env.RUMIK_API_KEY;
  if (!key) return NextResponse.json({ error: "tts_unconfigured" }, { status: 503 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (rateLimited(ip))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { text?: string } | null;
  const text = body?.text?.slice(0, 600);
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

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
