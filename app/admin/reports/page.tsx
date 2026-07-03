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
};

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
        <Stat v={m.handoffs} k="Handoffs to team" />
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
      <p style={{ color: "#8fa1b3", fontSize: ".75rem" }}>
        Use “Export CSV” on the Leads Board for the full monthly data dump.
      </p>
    </>
  );
}

function Stat({ v, k }: { v: number; k: string }) {
  return (
    <div className="stat-card">
      <div className="v">{v}</div>
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
