"use client";
import { useState } from "react";
import Link from "next/link";
import "./precedents.css";

type Precedent = {
  id?: string;
  cite: string;
  hold: string;
  body: string;
  a: string;
  aL: string;
  b: string;
  bL: string;
  sample?: boolean;
};

const TAGS = ["placements", "judiciary", "moot court", "fees & ROI", "affiliation", "hostel"];

export default function Precedents() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Precedent[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(query?: string) {
    const term = (query ?? q).trim();
    if (!term) return;
    if (query) setQ(query);
    setBusy(true);
    try {
      const res = await fetch("/api/precedents/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: term }),
      });
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pr-page">
      <nav className="pr-nav">
        <Link href="/" className="pr-back">← City Law College</Link>
        <span className="pr-kick">The Precedent Engine</span>
      </nav>

      <div className="pr-grid">
        <div className="pr-left">
          <h1>
            Every college shows a brochure.
            <br />
            This one <span className="gold">cites precedent.</span>
          </h1>
          <p>
            Type the worry a parent actually has — placements, judiciary, ROI —
            and the engine answers the way a lawyer does: not with adjectives,
            but with citations from the college&apos;s record.
          </p>
          <div className="pr-search">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="Ask the record — e.g. “placements”, “judiciary”, “fees”…"
            />
            <button onClick={() => run()} disabled={busy}>
              {busy ? "…" : "Cite ▸"}
            </button>
          </div>
          <div className="pr-tags">
            {TAGS.map((t) => (
              <button key={t} className="pr-tag" onClick={() => run(t)}>
                {t}
              </button>
            ))}
          </div>
          <div className="pr-flag">
            Sample precedents shown for the trial. Before launch, every citation
            is replaced with the college&apos;s own verified outcomes — never
            invented. The library is maintained live by the admissions office.
          </div>
        </div>

        <div className="pr-results">
          {results === null && (
            <div className="pr-empty">Ask the record a question to see how it argues.</div>
          )}
          {results !== null && results.length === 0 && !busy && (
            <div className="pr-empty">
              Nothing on record for that yet — ask the admissions office directly
              at +91 81770 01081.
            </div>
          )}
          {results?.map((d, i) => (
            <div className="pr-card" style={{ animationDelay: `${i * 0.08}s` }} key={d.id ?? i}>
              <div className="cite">
                {d.cite}
                {d.sample && <span className="sample">sample</span>}
              </div>
              <div className="hold">{d.hold}</div>
              <div className="body">{d.body}</div>
              <div className="meta">
                <span>
                  <b>{d.a}</b>
                  {d.aL}
                </span>
                <span>
                  <b>{d.b}</b>
                  {d.bL}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="pr-foot">City Law College, Lucknow · University of Lucknow · Code 1238</p>
    </div>
  );
}
