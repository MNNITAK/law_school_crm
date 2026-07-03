"use client";
import { useState } from "react";
import Link from "next/link";
import "./first-case.css";

type Answers = { side?: string; open?: string; push?: string };
type Verdict = {
  archetype: string;
  headline: string;
  reasoning: string;
  strengths: string[];
  advocacy_instinct: number;
  reasoning_style: string;
  suggested_programme: string;
};

const STEPS = [
  {
    key: "side",
    eyebrow: "Step 01 · Choose your client",
    q: "Who do you represent?",
    opts: [
      { v: "buyer", lt: "A", t: "The buyer.", d: "A displayed price is a promise. Hold them to the tag." },
      { v: "owner", lt: "B", t: "The shop owner.", d: "A genuine error can't bind you to a loss. Argue mistake." },
    ],
  },
  {
    key: "open",
    eyebrow: "Step 02 · Your opening",
    q: "What's your strongest line first?",
    opts: [
      { v: "rule", lt: "A", t: "Lead with the rule", d: "— what the displayed price legally means." },
      { v: "fair", lt: "B", t: "Lead with fairness", d: "— what an ordinary person would expect." },
      { v: "fact", lt: "C", t: "Lead with the facts", d: "— pin down exactly what was said, and when." },
    ],
  },
  {
    key: "push",
    eyebrow: "Step 03 · The bench pushes back",
    q: "The judge says: “Isn't this just a small sum to fuss over?”",
    opts: [
      { v: "principle", lt: "A", t: "Stand on principle.", d: "“The amount is small; the principle isn't. A promise on a label is still a promise.”" },
      { v: "concede", lt: "B", t: "Narrow the claim.", d: "“Fair point — I'll narrow my claim to what's clearly owed and concede the rest.”" },
      { v: "evidence", lt: "C", t: "Point to the record.", d: "“Let the record decide — here's exactly what was displayed and agreed.”" },
    ],
  },
];

export default function FirstCase() {
  const [screen, setScreen] = useState(0); // 0 intro, 1-3 steps, 4 verdict
  const [answers, setAnswers] = useState<Answers>({});
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  async function pick(key: string, v: string) {
    const next = { ...answers, [key]: v };
    setAnswers(next);
    if (screen < 3) {
      setScreen(screen + 1);
      return;
    }
    // all three answered → verdict
    setLoading(true);
    setScreen(4);
    try {
      const res = await fetch("/api/quiz/verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: next }),
      });
      if (!res.ok) throw new Error();
      setVerdict(await res.json());
    } catch {
      setVerdict({
        archetype: "The Counsel",
        headline: "A careful builder of the record.",
        reasoning:
          "Your choices show a preference for grounding arguments in what can be shown, not just asserted — the instinct careful counsel is made of.",
        strengths: ["Evidence-led", "Composed under pressure", "Precise"],
        advocacy_instinct: 78,
        reasoning_style: "Evidence-led",
        suggested_programme: "Either",
      });
    } finally {
      setLoading(false);
    }
  }

  async function saveResult() {
    if (!name || !phone) return;
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: sessionStorage.getItem("clc_leadId") || undefined,
          source: "quiz",
          patch: { name, phone },
          event: { type: "quiz_done", detail: { verdict: verdict?.archetype, answers } },
        }),
      });
      const data = await res.json();
      if (data?.leadId) sessionStorage.setItem("clc_leadId", data.leadId);
      setSaved(true);
    } catch {
      setSaved(true);
    }
  }

  function discussWithAria() {
    sessionStorage.setItem(
      "clc_aria_prefill",
      `I just took The First Case and my verdict was "${verdict?.archetype}" (${verdict?.reasoning_style}). What does that mean for studying law?`
    );
  }

  const step = screen >= 1 && screen <= 3 ? STEPS[screen - 1] : null;

  return (
    <div className="fc-page">
      <nav className="fc-nav">
        <Link href="/" className="fc-back">← City Law College</Link>
        <span className="fc-kick">The First Case · 60 seconds</span>
      </nav>

      <div className="fc-stage">
        <div className="fc-bar">
          <span>The Brief · Case No. 2027-001</span>
          <span className="fc-prog">
            {[0, 1, 2, 3].map((i) => (
              <i key={i} className={screen > i || screen === 4 ? "on" : i === 0 && screen === 0 ? "on" : ""} />
            ))}
          </span>
        </div>
        <div className="fc-body">
          {screen === 0 && (
            <div className="fc-screen">
              <div className="fc-eyebrow">The matter before you</div>
              <p className="fc-facts">
                A shop tags a phone at <span className="gold">₹15,000</span>. At the
                counter the owner says the real price is ₹18,000 — “the label was a
                mistake.” The buyer refuses to pay a rupee more than the tag.
              </p>
              <p className="fc-note">
                There&apos;s no trick and no prior knowledge needed. We&apos;re
                not testing what you <i>know</i> — we&apos;re watching how you{" "}
                <i>think</i>. Your verdict is read by AI, live.
              </p>
              <button className="fc-btn" onClick={() => setScreen(1)}>
                Take the case ▸
              </button>
            </div>
          )}

          {step && (
            <div className="fc-screen" key={step.key}>
              <div className="fc-eyebrow">{step.eyebrow}</div>
              <h3 className="fc-q">{step.q}</h3>
              <div className="fc-opts">
                {step.opts.map((o) => (
                  <button key={o.v} className="fc-opt" onClick={() => pick(step.key, o.v)}>
                    <span className="lt">{o.lt}</span>
                    <span>
                      <b>{o.t}</b> {o.d}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {screen === 4 && (
            <div className="fc-screen">
              {loading || !verdict ? (
                <div className="fc-loading">
                  <div className="fc-eyebrow">The bench is deliberating…</div>
                  <p className="fc-facts">Weighing your three calls.</p>
                </div>
              ) : (
                <>
                  <div className="fc-eyebrow">Verdict on your instinct — by AI</div>
                  <div className="fc-track">{verdict.archetype}</div>
                  <p className="fc-headline">{verdict.headline}</p>
                  <p className="fc-note">{verdict.reasoning}</p>
                  <div className="fc-read">
                    <div className="fc-stat">
                      <div className="k">Advocacy instinct</div>
                      <div className="v">{verdict.advocacy_instinct}/100</div>
                      <div className="bar">
                        <i style={{ width: `${verdict.advocacy_instinct}%` }} />
                      </div>
                    </div>
                    <div className="fc-stat">
                      <div className="k">Reasoning style</div>
                      <div className="v">{verdict.reasoning_style}</div>
                      <div className="fc-strengths">
                        {verdict.strengths.map((s) => (
                          <span key={s}>{s}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {!saved ? (
                    <div className="fc-save">
                      <p className="fc-note" style={{ marginBottom: 10 }}>
                        Save your verdict — our counsellor will tell you what it
                        means for {verdict.suggested_programme === "Either" ? "BA LL.B or LL.B" : verdict.suggested_programme}:
                      </p>
                      <div className="fc-save-row">
                        <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
                        <input placeholder="10-digit mobile" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} />
                        <button className="fc-btn" onClick={saveResult}>Save my result</button>
                      </div>
                    </div>
                  ) : (
                    <p className="fc-saved">✓ Saved — our team will reach out with your full read.</p>
                  )}

                  <div className="fc-cta">
                    <Link href="/#aria" className="fc-btn" onClick={discussWithAria}>
                      Argue it with Aria ▸
                    </Link>
                    <button
                      className="fc-restart"
                      onClick={() => {
                        setScreen(0);
                        setAnswers({});
                        setVerdict(null);
                        setSaved(false);
                      }}
                    >
                      ↺ Re-open the case
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <p className="fc-foot">
        City Law College, Lucknow · University of Lucknow · Code 1238
      </p>
    </div>
  );
}
