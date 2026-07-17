"use client";
import { useCallback, useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { firebaseConfigured } from "@/lib/firebase/client";

type Insights = {
  topObjections?: { objection: string; note: string }[];
  dropoffStages?: { stage: string; why: string }[];
  whatsWorking?: string[];
  recommendations?: string[];
  sampleSize?: number;
  cached?: boolean;
};

export default function InsightsPage() {
  const [data, setData] = useState<Insights | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async (refresh: boolean) => {
    if (!firebaseConfigured()) return;
    setBusy(true);
    setErr("");
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch(`/api/admin/insights${refresh ? "?refresh=1" : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setData(d as Insights);
      else
        setErr(
          d.error === "no_conversations"
            ? "No conversations to analyse yet."
            : d.error === "ai_unconfigured"
              ? "AI is not configured."
              : `Failed: ${d.error ?? res.status}`
        );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => load(false));
  }, [load]);

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <h1 style={{ marginBottom: 8 }}>Conversation insights</h1>
        <button className="adm-btn ghost sm" disabled={busy} onClick={() => load(true)}>
          {busy ? "Analysing…" : "↻ Refresh analysis"}
        </button>
        {data?.sampleSize != null && (
          <span style={{ color: "#8fa1b3", fontSize: ".75rem" }}>
            Based on {data.sampleSize} recent conversation
            {data.sampleSize === 1 ? "" : "s"}
            {data.cached ? " · cached today" : " · just generated"}
          </span>
        )}
      </div>

      {err && <p className="empty">{err}</p>}
      {!data && !err && <p className="empty">{busy ? "Reading conversations…" : "No analysis yet."}</p>}

      {data && (
        <>
          <div className="detail-grid">
            <div className="panel">
              <div className="ttl">Top objections</div>
              {data.topObjections?.length ? (
                data.topObjections.map((o, i) => (
                  <div className="evt" key={i} style={{ display: "block" }}>
                    <b>{o.objection}</b>
                    <div style={{ color: "#8fa1b3", fontSize: ".76rem" }}>{o.note}</div>
                  </div>
                ))
              ) : (
                <p className="empty">None found.</p>
              )}
            </div>
            <div className="panel">
              <div className="ttl">Where leads drop off</div>
              {data.dropoffStages?.length ? (
                data.dropoffStages.map((s, i) => (
                  <div className="evt" key={i} style={{ display: "block" }}>
                    <b>{s.stage}</b>
                    <div style={{ color: "#8fa1b3", fontSize: ".76rem" }}>{s.why}</div>
                  </div>
                ))
              ) : (
                <p className="empty">None found.</p>
              )}
            </div>
          </div>
          <div className="detail-grid">
            <div className="panel">
              <div className="ttl">What&apos;s working</div>
              {data.whatsWorking?.length ? (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: ".82rem" }}>
                  {data.whatsWorking.map((w, i) => (
                    <li key={i} style={{ marginBottom: 6 }}>{w}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty">Nothing notable yet.</p>
              )}
            </div>
            <div className="panel">
              <div className="ttl">Recommendations</div>
              {data.recommendations?.length ? (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: ".82rem" }}>
                  {data.recommendations.map((r, i) => (
                    <li key={i} style={{ marginBottom: 6, color: "#ecd9a8" }}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty">None yet.</p>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
