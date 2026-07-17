"use client";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { clientDb, firebaseConfigured } from "@/lib/firebase/client";

type Lead = {
  id: string;
  source?: string;
  temperature?: string;
  stage?: string;
  score?: number;
  persona?: string;
  eligibilityStatus?: string;
  handoffAt?: Timestamp;
  lastCallOutcome?: string;
  createdAt?: Timestamp;
  firstContactAt?: Timestamp;
};

/** human-readable duration from seconds, e.g. 42 → "42s", 190 → "3m", 5400 → "1.5h" */
function fmtDur(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  return `${(secs / 3600).toFixed(1)}h`;
}

export default function Reports() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [now] = useState(() => Date.now());
  useEffect(() => {
    if (!firebaseConfigured()) return;
    const q = query(
      collection(clientDb(), "leads"),
      orderBy("createdAt", "desc"),
      limit(1000)
    );
    return onSnapshot(q, (s) =>
      setLeads(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Lead))
    );
  }, []);

  const m = useMemo(() => {
    const total = leads.length;
    const by = (fn: (l: Lead) => string | undefined) => {
      const map = new Map<string, number>();
      leads.forEach((l) => {
        const k = fn(l) || "unknown";
        map.set(k, (map.get(k) ?? 0) + 1);
      });
      return [...map.entries()].sort((a, b) => b[1] - a[1]);
    };
    const last7 = leads.filter(
      (l) => l.createdAt && now - l.createdAt.toDate().getTime() < 7 * 864e5
    ).length;

    // Speed-to-lead: enquiry (createdAt) → first Aria response (firstContactAt)
    const respSecs = leads
      .filter((l) => l.firstContactAt && l.createdAt)
      .map(
        (l) =>
          (l.firstContactAt!.toDate().getTime() -
            l.createdAt!.toDate().getTime()) /
          1000
      )
      .filter((s) => s >= 0)
      .sort((a, b) => a - b);
    const medianResp = respSecs.length
      ? respSecs[Math.floor(respSecs.length / 2)]
      : null;
    const respBuckets: [string, number][] = [
      ["under 1 min", respSecs.filter((s) => s < 60).length],
      ["1–5 min", respSecs.filter((s) => s >= 60 && s < 300).length],
      ["5–60 min", respSecs.filter((s) => s >= 300 && s < 3600).length],
      ["over 1 hr", respSecs.filter((s) => s >= 3600).length],
    ];

    return {
      total,
      last7,
      hot: leads.filter((l) => l.temperature === "hot").length,
      warm: leads.filter((l) => l.temperature === "warm").length,
      handoffs: leads.filter((l) => l.handoffAt).length,
      applied: leads.filter((l) => ["applied", "enrolled"].includes(l.stage ?? "")).length,
      eligible: leads.filter((l) => l.eligibilityStatus === "eligible").length,
      parents: leads.filter((l) => l.persona === "parent").length,
      calls: leads.filter((l) => l.lastCallOutcome).length,
      avgScore: total
        ? Math.round(leads.reduce((s, l) => s + (l.score ?? 0), 0) / total)
        : 0,
      medianResp,
      respCount: respSecs.length,
      respBuckets,
      sources: by((l) => l.source),
      stages: by((l) => l.stage),
      outcomes: by((l) => l.lastCallOutcome).filter(([k]) => k !== "unknown"),
    };
  }, [leads, now]);

  return (
    <>
      <h1>Reports — admissions funnel</h1>
      <div className="stat-row">
        <Stat v={m.total} k="Total leads" />
        <Stat v={m.last7} k="New this week" />
        <Stat v={m.hot} k="Hot now" />
        <Stat vs={m.medianResp != null ? fmtDur(m.medianResp) : "—"} k="Median response" />
        <Stat v={m.applied} k="Applications" />
        <Stat v={m.avgScore} k="Avg. score" />
      </div>

      <div className="detail-grid">
        <div className="panel">
          <div className="ttl">Lead sources</div>
          <Bars data={m.sources} total={m.total} />
        </div>
        <div className="panel">
          <div className="ttl">Funnel stages</div>
          <Bars data={m.stages} total={m.total} />
        </div>
      </div>
      <div className="detail-grid">
        <div className="panel">
          <div className="ttl">Temperature</div>
          <Bars
            data={[
              ["hot", m.hot],
              ["warm", m.warm],
              ["cold", m.total - m.hot - m.warm],
            ]}
            total={m.total}
          />
        </div>
        <div className="panel">
          <div className="ttl">Voice-call outcomes</div>
          {m.outcomes.length ? (
            <Bars data={m.outcomes} total={m.calls} />
          ) : (
            <p className="empty">No calls yet.</p>
          )}
        </div>
      </div>
      <div className="detail-grid">
        <div className="panel">
          <div className="ttl">Speed-to-lead — time to first response</div>
          {m.respCount ? (
            <>
              <Bars data={m.respBuckets} total={m.respCount} />
              <p style={{ color: "#8fa1b3", fontSize: ".7rem", marginTop: 6 }}>
                Based on {m.respCount} lead{m.respCount === 1 ? "" : "s"} Aria has
                engaged. Median: {m.medianResp != null ? fmtDur(m.medianResp) : "—"}.
              </p>
            </>
          ) : (
            <p className="empty">No responses recorded yet.</p>
          )}
        </div>
        <div className="panel">
          <div className="ttl">Handoffs to the human team</div>
          <Bars
            data={[
              ["handed off", m.handoffs],
              ["AI-handled", Math.max(0, m.total - m.handoffs)],
            ]}
            total={m.total}
          />
        </div>
      </div>
      <p style={{ color: "#8fa1b3", fontSize: ".75rem" }}>
        Use “Export CSV” on the Leads Board for the full monthly data dump.
      </p>
    </>
  );
}

function Stat({ v, vs, k }: { v?: number; vs?: string; k: string }) {
  return (
    <div className="stat-card">
      <div className="v">{vs ?? v}</div>
      <div className="k">{k}</div>
    </div>
  );
}

function Bars({
  data,
  total,
}: {
  data: [string, number][];
  total: number;
}) {
  if (!data.length || !total) return <p className="empty">No data yet.</p>;
  return (
    <>
      {data.map(([k, n]) => (
        <div className="bar-row" key={k}>
          <span className="lbl">{k.replace(/_/g, " ")}</span>
          <div className="track">
            <div className="fill" style={{ width: `${(n / total) * 100}%` }} />
          </div>
          <span style={{ width: 30, textAlign: "right" }}>{n}</span>
        </div>
      ))}
    </>
  );
}
