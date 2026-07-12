"use client";

import { useEffect, useRef, useState } from "react";

/* Standalone Aria chat for the embeddable iframe widget (/widget).
   Talks to the same /api/aria engine as the site chat, but is a clean
   React component with no CRM sidebar and no window-global wiring. */

type Msg = { id: number; who: "me" | "them"; text: string };
type Card = { emo?: string; t?: string; msg: string; label: string };

const GREETING =
  "Namaste! 🙏 I'm Aria, your personal admissions counsellor at City Law College.\n\nNo forms, no pressure — just tap what's on your mind and I'll take it from there. 👇";

const START_CARDS: Card[] = [
  { emo: "🎓", t: "I want to apply", msg: "I want to apply for admission. Please guide me.", label: "I want to apply" },
  { emo: "❓", t: "Am I eligible?", msg: "Can you check if I am eligible? I will tell you my marks.", label: "Am I eligible?" },
  { emo: "💰", t: "Fees & scholarships", msg: "What are the fees and are there any scholarships?", label: "Fees & scholarships" },
  { emo: "⚖️", t: "Why this college?", msg: "Why should I choose City Law College over others in Lucknow?", label: "Why this college?" },
  { emo: "🗺️", t: "Visit campus", msg: "I want to visit the campus. How do I reach and when can I come?", label: "Visit campus" },
];

/* sessionStorage may be blocked/partitioned inside a third-party iframe
   (Safari ITP, strict cookie settings) — fall back to in-memory. */
function makeStore() {
  const mem = new Map<string, string>();
  let ok = false;
  try {
    sessionStorage.setItem("__clc_probe", "1");
    sessionStorage.removeItem("__clc_probe");
    ok = true;
  } catch {}
  return {
    get(k: string) {
      if (ok) {
        try {
          return sessionStorage.getItem(k) ?? undefined;
        } catch {}
      }
      return mem.get(k);
    },
    set(k: string, v: string) {
      mem.set(k, v);
      if (ok) {
        try {
          sessionStorage.setItem(k, v);
        } catch {}
      }
    },
  };
}

function splitMsg(t: string) {
  const parts = t
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  parts.forEach((p) => {
    if (p.length > 150) {
      const s = p.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) || [p];
      let buf = "";
      s.forEach((x) => {
        if ((buf + x).length > 150) {
          if (buf) out.push(buf.trim());
          buf = x;
        } else buf += x;
      });
      if (buf) out.push(buf.trim());
    } else out.push(p);
  });
  return out.slice(0, 3);
}

/* offline fallback — used only if /api/aria is unreachable or errors */
type FallbackState = {
  readiness: number;
  lead: { name: string | null; phone: string | null; course: string | null };
};
function localFallback(t: string, st: FallbackState) {
  const q = t.toLowerCase();
  const lead = { ...st.lead };
  const pm = t.match(/\b\d{10}\b/);
  if (pm) lead.phone = pm[0];
  const nm = t.match(/(?:i am|i'm|my name is|naam|this is|myself)\s+([a-z]{3,})/i);
  if (nm) lead.name = nm[1].replace(/^\w/, (c) => c.toUpperCase());
  if (/ba.?ll|integrated|5.?year|12th|after 12/.test(q)) lead.course = "BA LL.B (Hons.)";
  else if (/ll\.?b|3.?year|graduat/.test(q) && !lead.course) lead.course = "LL.B";
  let reply: string,
    readiness = Math.min(95, st.readiness + 12),
    chips: string[] = [];
  if (/fee|fees|cost|kitni|kitna|price|scholarship/.test(q)) {
    reply =
      "Great question!\n\nFees depend on the programme and current session, and I'd rather give you the exact figure than a guess — so our team will send the full structure (and any scholarships) today.\n\nMay I have your name and mobile number?";
    chips = ["My name is…", "BA LL.B", "Call me on…"];
  } else if (/eligib|percent|%|marks|qualify|hoga|chance/.test(q)) {
    const mm2 = t.match(/(\d{2,3})\s?%?/);
    const m = mm2 ? +mm2[1] : null;
    if (m) {
      const ok = m >= 45;
      reply = ok
        ? `Wonderful — with ${m}% you comfortably meet our BA LL.B cut-off (45%, or 40% SC/ST). You're in a strong spot! 🎉\n\nShall I help you apply? What's your name and number?`
        : `${m}% is not the end of the story — far from it. There are real options worth exploring together. 💪\n\nCould I have your name and number so a counsellor guides you personally?`;
      readiness = ok ? 80 : 60;
      chips = ok ? ["Yes, help me apply", "My name is…"] : ["What are my options?", "My name is…"];
    } else {
      reply =
        "Happy to check instantly!\n\nBA LL.B needs 45% in 12th (40% SC/ST); LL.B needs 50% in graduation. What were your marks?";
      chips = ["I got 60% in 12th", "52% in graduation"];
    }
  } else if (/apply|application|admission|join|enroll|guide/.test(q)) {
    reply =
      "Lovely — applying is simple and fully merit-based, and I'll walk you through every step. 🙌\n\nTo start, what's your name, mobile number, and which programme interests you?";
    readiness = Math.max(readiness, 82);
    chips = ["BA LL.B (after 12th)", "LL.B (after graduation)", "My name is…"];
  } else if (/visit|campus|reach|location|address|direction|come/.test(q)) {
    reply =
      "You're very welcome to visit! 😊\n\nWe're in Sector 9, Jankipuram Vistar, on the AKTU–CDRI Road.\n\nShall I have a counsellor fix a convenient time? What's your name and number?";
    chips = ["Fix a visit for me", "Get directions"];
  } else {
    reply =
      "That's a thoughtful question — and the fact you're asking tells me you'd take law seriously. 🙂\n\nTell me a little about your goal, and your name and number, so I can guide you the right way?";
    chips = ["I want to apply", "Am I eligible?", "Just exploring"];
  }
  if (lead.name && lead.phone) readiness = Math.max(readiness, 86);
  return { reply, chips, readiness, lead };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function post(msg: Record<string, unknown>) {
  if (typeof window !== "undefined" && window.parent !== window)
    // "*" is fine: payload carries no data worth protecting (ready/close only)
    window.parent.postMessage({ source: "clc-aria", ...msg }, "*");
}

let nextId = 1;

export default function AriaChatWidget() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [typing, setTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const [value, setValue] = useState("");

  const store = useRef<ReturnType<typeof makeStore> | null>(null);
  const history = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const fb = useRef<FallbackState>({
    readiness: 0,
    lead: { name: null, phone: null, course: null },
  });
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, typing, cards]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    store.current = makeStore();
    post({ type: "ready" });

    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.source !== "clc-aria") return;
      if (d.type === "visibility" && d.open) inputRef.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") post({ type: "close" });
    };
    window.addEventListener("message", onMsg);
    window.addEventListener("keydown", onKey);

    (async () => {
      await botSayHuman(GREETING);
      setCards(START_CARDS);
    })();

    return () => {
      window.removeEventListener("message", onMsg);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function append(who: "me" | "them", text: string) {
    setMsgs((m) => [...m, { id: nextId++, who, text }]);
  }

  async function botSayHuman(text: string) {
    const parts = splitMsg(text);
    for (const p of parts) {
      setTyping(true);
      await wait(Math.min(2200, 650 + p.length * 22));
      setTyping(false);
      append("them", p);
      await wait(300);
    }
  }

  async function send(raw?: string) {
    const text = (raw ?? value).trim();
    if (!text || sending) return;
    setValue("");
    setCards([]);
    setSending(true);
    append("me", text);
    history.current.push({ role: "user", content: text });
    setTyping(true);

    let p: {
      reply?: string;
      chips?: string[];
      leadId?: string;
      conversationId?: string;
    } | null = null;
    try {
      const res = await fetch("/api/aria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: store.current?.get("clc_leadId") || undefined,
          conversationId: store.current?.get("clc_convId") || undefined,
          channel: "web_chat",
          messages: history.current.slice(-24),
        }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      p = await res.json();
      if (p?.leadId) store.current?.set("clc_leadId", p.leadId);
      if (p?.conversationId) store.current?.set("clc_convId", p.conversationId);
    } catch {
      p = null;
    }
    setTyping(false);
    if (!p || !p.reply) {
      const f = localFallback(text, fb.current);
      fb.current = { readiness: f.readiness, lead: f.lead };
      p = { reply: f.reply, chips: f.chips };
    }
    await botSayHuman(p.reply!);
    history.current.push({ role: "assistant", content: p.reply! });
    setCards((p.chips ?? []).slice(0, 3).map((c) => ({ msg: c, label: c })));
    setSending(false);
    inputRef.current?.focus();
  }

  return (
    <div className="widget-root">
      <header className="widget-head">
        <div className="widget-ava">A</div>
        <div className="widget-id">
          <b>Aria</b>
          <span>Admissions Counsellor · online</span>
        </div>
        <button
          className="widget-close"
          aria-label="Close chat"
          onClick={() => post({ type: "close" })}
        >
          ✕
        </button>
      </header>

      <div className="ai-log" ref={logRef}>
        {msgs.map((m) => (
          <div key={m.id} className={`row ${m.who}`}>
            <div className="bubble">{m.text}</div>
            {m.who === "me" && <div className="tick">Delivered</div>}
          </div>
        ))}
        {typing && (
          <div className="row them">
            <div className="typing-b">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
      </div>

      {cards.length > 0 && (
        <div className="ai-cards">
          {cards.map((c) => (
            <button key={c.label} className="ai-card" onClick={() => send(c.msg)}>
              {c.emo && <span className="emo">{c.emo}</span>}
              {c.t ?? c.label}
            </button>
          ))}
        </div>
      )}

      <div className="ai-input">
        <input
          ref={inputRef}
          value={value}
          placeholder="Message Aria…"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
        />
        <button
          className="widget-send"
          aria-label="Send"
          disabled={sending}
          onClick={() => send()}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
