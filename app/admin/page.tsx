"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
  Timestamp,
} from "firebase/firestore";
import { clientDb, firebaseConfigured } from "@/lib/firebase/client";
import { getAuth } from "firebase/auth";

type Lead = {
  id: string;
  name?: string;
  phone?: string;
  city?: string;
  course?: string;
  score?: number;
  temperature?: "cold" | "warm" | "hot";
  stage?: string;
  persona?: string;
  source?: string;
  nextBestAction?: string;
  lastCallOutcome?: string;
  handoffAt?: Timestamp;
  updatedAt?: Timestamp;
};

const COURSE: Record<string, string> = { ba_llb: "BA LL.B", llb: "LL.B" };

export default function LeadsBoard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  useEffect(() => {
    if (!firebaseConfigured()) return;
    const q = query(
      collection(clientDb(), "leads"),
      orderBy("score", "desc"),
      limit(200)
    );
    return onSnapshot(q, (snap) =>
      setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Lead))
    );
  }, []);

  const hot = leads.filter((l) => l.temperature === "hot");
  const warm = leads.filter((l) => l.temperature === "warm");
  const cold = leads.filter((l) => !l.temperature || l.temperature === "cold");

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ flex: 1 }}>Leads — live board</h1>
        <ExportButton />
      </div>
      <div className="board">
        <Column title="⬤ Hot · call now" cls="hot" leads={hot} />
        <Column title="⬤ Warm · nurturing" cls="warm" leads={warm} />
        <Column title="⬤ Cold · automated" cls="" leads={cold} />
      </div>
      {leads.length === 0 && (
        <p className="empty">
          No leads yet — chat with Aria on the website or submit the apply form
          and watch this board update live.
        </p>
      )}
    </>
  );
}

function Column({
  title,
  cls,
  leads,
}: {
  title: string;
  cls: string;
  leads: Lead[];
}) {
  return (
    <div>
      <div className={`col-h ${cls}`}>
        <span>{title}</span>
        <span>{leads.length}</span>
      </div>
      {leads.map((l) => (
        <Link key={l.id} href={`/admin/leads/${l.id}`} className="lead-card">
          <div className="nm">
            {l.name || "Anonymous"}
            <span
              className={`score ${l.temperature === "hot" ? "h" : l.temperature === "warm" ? "w" : "c"}`}
            >
              {l.score ?? 0}
            </span>
          </div>
          <div className="meta">
            {[COURSE[l.course ?? ""] ?? null, l.city, l.phone, l.source]
              .filter(Boolean)
              .join(" · ") || "—"}
          </div>
          {l.nextBestAction && (
            <div className="nba">
              <b>Next ▸</b> {l.nextBestAction}
            </div>
          )}
          <div className="flags">
            {l.persona === "parent" && <span className="flag">⚖ Parent engaged</span>}
            {l.handoffAt && <span className="flag hot">🔥 Handoff</span>}
            {l.lastCallOutcome && (
              <span className="flag">📞 {l.lastCallOutcome.replace(/_/g, " ")}</span>
            )}
            {l.stage && l.stage !== "new" && (
              <span className="flag">{l.stage.replace(/_/g, " ")}</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

function ExportButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="adm-btn ghost sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const token = await getAuth().currentUser?.getIdToken();
          const res = await fetch("/api/leads/export", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Exporting…" : "⬇ Export CSV"}
    </button>
  );
}
