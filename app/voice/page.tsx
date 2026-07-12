"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "./voice.css";

type Turn = { role: "user" | "assistant"; content: string };
type CallState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "ended";
type Summary = {
  outcome: string;
  summary: string;
  next_best_action: string;
} | null;

const GREETING =
  "Namaste! This is Aria calling from City Law College, Lucknow. I saw you were interested in our law programmes. Do you have a minute to talk?";

export default function VoicePage() {
  const [state, setState] = useState<CallState>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [summary, setSummary] = useState<Summary>(null);
  const [supported, setSupported] = useState(true);
  const [interim, setInterim] = useState("");

  const stateRef = useRef<CallState>("idle");
  const turnsRef = useRef<Turn[]>([]);
  const recRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // stable per-visit key for the TTS rate limiter (per-session, not per-IP)
  const ttsSessionRef = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random())
  );

  useEffect(() => {
    const w = window as any;
    if (!w.SpeechRecognition && !w.webkitSpeechRecognition)
      queueMicrotask(() => setSupported(false));
    return () => endCallCleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setSt(s: CallState) {
    stateRef.current = s;
    setState(s);
  }
  // reads through a function so TS doesn't over-narrow across awaits
  const ended = () => stateRef.current === "ended";
  function pushTurn(t: Turn) {
    turnsRef.current = [...turnsRef.current, t];
    setTurns(turnsRef.current);
  }

  /* ---------- speech synthesis: rumik TTS with browser fallback ---------- */
  async function speak(text: string): Promise<void> {
    setSt("speaking");
    const clean = text.replace(/\n+/g, " ").trim();
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, sessionId: ttsSessionRef.current }),
      });
      if (!res.ok) throw new Error("tts unavailable");
      const blob = await res.blob();
      await new Promise<void>((resolve) => {
        const audio = new Audio(URL.createObjectURL(blob));
        audioRef.current = audio;
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
    } catch {
      // fallback: browser voice
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(clean);
        const v = speechSynthesis
          .getVoices()
          .find((v) => /en-IN|hi-IN/.test(v.lang));
        if (v) u.voice = v;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        speechSynthesis.speak(u);
      });
    }
    audioRef.current = null;
  }

  function stopSpeaking() {
    audioRef.current?.pause();
    audioRef.current = null;
    speechSynthesis.cancel();
  }

  /* ---------- speech recognition loop ---------- */
  function listen() {
    if (stateRef.current === "ended" || stateRef.current === "idle") return;
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    recRef.current = rec;
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    setSt("listening");
    setInterim("");
    let finalText = "";
    rec.onresult = (e: any) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      setInterim(txt);
      if (e.results[e.results.length - 1].isFinal) finalText = txt;
    };
    rec.onerror = () => {
      if (stateRef.current === "listening") setTimeout(() => listen(), 400);
    };
    rec.onend = async () => {
      setInterim("");
      const text = finalText.trim();
      if (ended()) return;
      if (!text) {
        // silence — keep listening
        setTimeout(() => listen(), 300);
        return;
      }
      pushTurn({ role: "user", content: text });
      await respond();
    };
    try {
      rec.start();
    } catch {
      /* already started */
    }
  }

  async function respond() {
    setSt("thinking");
    let reply =
      "Sorry, I had trouble hearing that. Could you say it once more?";
    try {
      const res = await fetch("/api/aria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: sessionStorage.getItem("clc_leadId") || undefined,
          conversationId: sessionStorage.getItem("clc_voice_convId") || undefined,
          channel: "voice",
          messages: turnsRef.current.slice(-24),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        reply = String(data.reply || reply).replace(/\n{2,}/g, " ");
        if (data.leadId) sessionStorage.setItem("clc_leadId", data.leadId);
        if (data.conversationId)
          sessionStorage.setItem("clc_voice_convId", data.conversationId);
      }
    } catch {
      /* keep fallback reply */
    }
    if (ended()) return;
    pushTurn({ role: "assistant", content: reply });
    await speak(reply);
    if (!ended()) listen();
  }

  /* ---------- call control ---------- */
  async function startCall() {
    turnsRef.current = [];
    setTurns([]);
    setSummary(null);
    setSeconds(0);
    setSt("connecting");
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    // mic permission upfront so the loop runs smoothly
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setSt("idle");
      if (timerRef.current) clearInterval(timerRef.current);
      alert("Microphone access is needed for the call.");
      return;
    }
    pushTurn({ role: "assistant", content: GREETING });
    await speak(GREETING);
    if (!ended()) listen();
  }

  function endCallCleanup() {
    recRef.current?.abort?.();
    stopSpeaking();
    if (timerRef.current) clearInterval(timerRef.current);
  }

  async function endCall() {
    setSt("ended");
    endCallCleanup();
    if (turnsRef.current.filter((t) => t.role === "user").length >= 1) {
      try {
        const res = await fetch("/api/voice/call-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: sessionStorage.getItem("clc_leadId") || undefined,
            transcript: turnsRef.current,
          }),
        });
        if (res.ok) setSummary(await res.json());
      } catch {
        /* summary is best-effort */
      }
    }
  }

  /* barge-in: tap while Aria talks → she stops and listens */
  function bargeIn() {
    if (stateRef.current === "speaking") {
      stopSpeaking();
      listen();
    }
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const live = state !== "idle" && state !== "ended";

  return (
    <div className="vc-page">
      <nav className="vc-nav">
        <Link href="/" className="vc-back">← City Law College</Link>
        <span className="vc-kick">Voice Counsel · live AI call</span>
      </nav>

      <div className="vc-grid">
        <div className="vc-phone" onClick={bargeIn}>
          <div className="vc-notch" />
          <div className="vc-callee">
            <div className="vc-av">A</div>
            <div className="vc-nm">Aria · Junior Counsel</div>
            <div className="vc-st">
              {
                {
                  idle: "Ready to call",
                  connecting: "Connecting…",
                  listening: "Listening — speak now",
                  thinking: "Thinking…",
                  speaking: "Speaking (tap to interrupt)",
                  ended: "Call ended",
                }[state]
              }
            </div>
            <div className="vc-timer">{mm}:{ss}</div>
          </div>

          <div className={`vc-wave ${state === "speaking" ? "talk" : state === "listening" ? "listen" : ""}`}>
            {Array.from({ length: 24 }).map((_, i) => (
              <i key={i} style={{ animationDelay: `${(i % 8) * 0.08}s` }} />
            ))}
          </div>

          <div className="vc-transcript">
            {turns.length === 0 && state === "idle" && (
              <p className="vc-hint">
                Press the green button. Aria speaks with a realistic Indian
                voice, understands English and Hinglish, and everything said
                lands in the college&apos;s CRM.
              </p>
            )}
            {turns.slice(-6).map((t, i) => (
              <div key={i} className={`vc-line ${t.role}`}>
                <span className="who">{t.role === "assistant" ? "Aria" : "You"}</span>
                {t.content}
              </div>
            ))}
            {interim && (
              <div className="vc-line user interim">
                <span className="who">You</span>
                {interim}…
              </div>
            )}
          </div>

          <div className="vc-btns">
            {!live ? (
              <button
                className="vc-btn call"
                onClick={startCall}
                disabled={!supported}
                title="Start call"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2a1 1 0 011-.24 11.4 11.4 0 003.6.6 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.4 11.4 0 00.6 3.6 1 1 0 01-.24 1l-2.26 2.2z"/></svg>
              </button>
            ) : (
              <button className="vc-btn end" onClick={endCall} title="End call">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ transform: "rotate(135deg)" }}><path d="M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2a1 1 0 011-.24 11.4 11.4 0 003.6.6 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.4 11.4 0 00.6 3.6 1 1 0 01-.24 1l-2.26 2.2z"/></svg>
              </button>
            )}
          </div>
          {!supported && (
            <p className="vc-warn">
              Voice input needs Chrome or Edge. Please open this page in Chrome.
            </p>
          )}
        </div>

        <div className="vc-right">
          <h1>
            The counsellor who <span className="gold">calls back</span> before
            the lead cools.
          </h1>
          <div className="vc-feats">
            <div className="vf">
              <b>Real conversation, realistic voice</b>
              <p>
                Aria speaks via rumik.ai&apos;s Silk voice — natural Hinglish, not a
                robot — and reasons with the same AI brain as the website chat.
              </p>
            </div>
            <div className="vf">
              <b>Parent-aware</b>
              <p>
                If a parent answers, she switches to a formal, outcomes-first
                script — affiliation, placements, ROI.
              </p>
            </div>
            <div className="vf">
              <b>Writes to the CRM</b>
              <p>
                When the call ends, AI files the outcome — visit booked,
                callback, not interested — straight onto the lead&apos;s card for
                your team.
              </p>
            </div>
          </div>

          {summary && (
            <div className="vc-summary">
              <div className="k">Call filed to CRM</div>
              <div className={`outcome ${summary.outcome}`}>
                {summary.outcome.replace(/_/g, " ").toUpperCase()}
              </div>
              <p>{summary.summary}</p>
              <p className="nba">
                <b>Next ▸</b> {summary.next_best_action}
              </p>
            </div>
          )}
        </div>
      </div>
      <p className="vc-foot">
        Trial build: in-browser call. Real outbound telephony (auto call-back on
        enquiry) ships in the full rollout.
      </p>
    </div>
  );
}
