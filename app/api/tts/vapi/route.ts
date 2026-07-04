import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Vapi custom-TTS bridge → rumik.ai Silk.
 * Vapi POSTs { message: { type: "voice-request", text, sampleRate } } and expects
 * raw PCM back: 16-bit signed LE, mono, at the requested sampleRate.
 * rumik returns a WAV file — we strip the container, downmix and resample.
 * This puts the SAME voice on phone calls as on the website's Voice Counsel.
 */
const RUMIK_URL = process.env.RUMIK_TTS_URL || "https://silk-api.rumik.ai/v1/tts";

export async function POST(req: NextRequest) {
  // Vapi forwards the voice.server.secret as x-vapi-secret
  const secret = process.env.OUTBOUND_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-vapi-secret") !== secret)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const key = process.env.RUMIK_API_KEY;
  if (!key) return NextResponse.json({ error: "tts_unconfigured" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as {
    message?: { type?: string; text?: string; sampleRate?: number };
  } | null;
  const m = body?.message;
  if (m?.type !== "voice-request" || !m.text)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const targetRate = m.sampleRate || 24000;

  try {
    const res = await fetch(RUMIK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.RUMIK_MODEL || "muga",
        text: m.text.slice(0, 1000),
      }),
    });
    if (!res.ok) {
      console.error("[tts/vapi] rumik", res.status, await res.text().catch(() => ""));
      return NextResponse.json({ error: "tts_failed" }, { status: 502 });
    }
    const wav = Buffer.from(await res.arrayBuffer());
    const pcm = wavToPcm(wav, targetRate);
    if (!pcm) return NextResponse.json({ error: "decode_failed" }, { status: 502 });
    return new NextResponse(new Uint8Array(pcm), {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[tts/vapi]", e);
    return NextResponse.json({ error: "tts_failed" }, { status: 502 });
  }
}

/** Parse WAV → mono 16-bit LE PCM at targetRate (linear resample). */
function wavToPcm(wav: Buffer, targetRate: number): Buffer | null {
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF") return null;
  let pos = 12;
  let fmt: { channels: number; rate: number; bits: number } | null = null;
  let data: Buffer | null = null;
  while (pos + 8 <= wav.length) {
    const id = wav.toString("ascii", pos, pos + 4);
    const size = wav.readUInt32LE(pos + 4);
    const chunkStart = pos + 8;
    if (id === "fmt ") {
      fmt = {
        channels: wav.readUInt16LE(chunkStart + 2),
        rate: wav.readUInt32LE(chunkStart + 4),
        bits: wav.readUInt16LE(chunkStart + 14),
      };
    } else if (id === "data") {
      data = wav.subarray(chunkStart, Math.min(chunkStart + size, wav.length));
    }
    pos = chunkStart + size + (size % 2);
  }
  if (!fmt || !data || fmt.bits !== 16) return null;

  // downmix to mono
  const frames = Math.floor(data.length / 2 / fmt.channels);
  let mono: Int16Array;
  if (fmt.channels === 1) {
    mono = new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + frames * 2));
  } else {
    mono = new Int16Array(frames);
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (let c = 0; c < fmt.channels; c++)
        sum += data.readInt16LE((i * fmt.channels + c) * 2);
      mono[i] = Math.round(sum / fmt.channels);
    }
  }

  // resample (linear interpolation)
  if (fmt.rate !== targetRate) {
    const outLen = Math.floor((mono.length * targetRate) / fmt.rate);
    const out = new Int16Array(outLen);
    const ratio = fmt.rate / targetRate;
    for (let i = 0; i < outLen; i++) {
      const src = i * ratio;
      const i0 = Math.floor(src);
      const i1 = Math.min(i0 + 1, mono.length - 1);
      const frac = src - i0;
      out[i] = Math.round(mono[i0] * (1 - frac) + mono[i1] * frac);
    }
    mono = out;
  }
  return Buffer.from(mono.buffer, mono.byteOffset, mono.length * 2);
}
