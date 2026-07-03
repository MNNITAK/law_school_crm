"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  addDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { clientDb, firebaseConfigured } from "@/lib/firebase/client";

type AnyDoc = Record<string, unknown> & { id: string };

const STAGES = [
  "new",
  "engaged",
  "qualified",
  "visit_scheduled",
  "applied",
  "enrolled",
  "dead",
];

function fmt(ts?: unknown) {
  if (!ts || !(ts instanceof Timestamp)) return "";
  return ts.toDate().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const [lead, setLead] = useState<AnyDoc | null>(null);
  const [messages, setMessages] = useState<AnyDoc[]>([]);
  const [events, setEvents] = useState<AnyDoc[]>([]);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!firebaseConfigured() || !id) return;
    const db = clientDb();
    const un1 = onSnapshot(doc(db, "leads", id), (d) =>
      setLead(d.exists() ? ({ id: d.id, ...d.data() } as AnyDoc) : null)
    );
    const un2 = onSnapshot(
      query(collection(db, "leads", id, "messages"), orderBy("createdAt", "asc")),
      (s) => setMessages(s.docs.map((d) => ({ id: d.id, ...d.data() }) as AnyDoc))
    );
    const un3 = onSnapshot(
      query(collection(db, "leads", id, "events"), orderBy("createdAt", "desc")),
      (s) => setEvents(s.docs.map((d) => ({ id: d.id, ...d.data() }) as AnyDoc))
    );
    return () => {
      un1();
      un2();
      un3();
    };
  }, [id]);

  if (!lead)
    return (
      <>
        <Link href="/admin">← Back to board</Link>
        <p className="empty">Loading lead…</p>
      </>
    );

  const phone = (lead.phone as string) || "";
  const waText = encodeURIComponent(
    `Hi ${lead.name || "there"}! This is the admissions team at City Law College, Lucknow — following up on your enquiry. How can we help? 🙂`
  );

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  };

  return (
    <>
      <Link href="/admin" style={{ color: "#8fa1b3", fontSize: ".8rem" }}>
        ← Back to board
      </Link>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <h1 style={{ marginBottom: 8 }}>{(lead.name as string) || "Anonymous lead"}</h1>
        <span className={`score ${lead.temperature === "hot" ? "h" : lead.temperature === "warm" ? "w" : "c"}`} style={{ fontSize: "1rem", border: "1px solid", borderRadius: 20, padding: "2px 12px" }}>
          {String(lead.score ?? 0)} / 100 · {String(lead.temperature ?? "cold")}
        </span>
        {toast && <span style={{ color: "#7ee0a0", fontSize: ".8rem" }}>{toast}</span>}
      </div>

      <div className="detail-grid">
        <div>
          <div className="panel">
            <div className="ttl">Conversation — all channels</div>
            <div className="chatlog">
              {messages.length === 0 && <p className="empty">No messages yet.</p>}
              {messages.map((m) => (
                <div key={m.id} className={`msg ${m.role}`}>
                  <span className="who">
                    {m.role === "assistant" ? "Aria" : m.role === "counsellor" ? "Counsellor" : "Lead"} · {String(m.channel ?? "chat").replace("_", " ")} · {fmt(m.createdAt)}
                  </span>
                  {String(m.content)}
                </div>
              ))}
            </div>
          </div>
          {typeof lead.lastCallSummary === "string" && lead.lastCallSummary && (
            <div className="panel">
              <div className="ttl">Last voice call — AI summary</div>
              <p style={{ fontSize: ".85rem", margin: 0 }}>{lead.lastCallSummary}</p>
            </div>
          )}
        </div>

        <div>
          <div className="panel">
            <div className="ttl">Lead file</div>
            {[
              ["Phone", phone || "—"],
              ["City", lead.city || "—"],
              ["Course", lead.course === "ba_llb" ? "BA LL.B (Hons.)" : lead.course === "llb" ? "LL.B" : "—"],
              ["Marks", lead.qualifyingPercent ? `${lead.qualifyingPercent}%` : "—"],
              ["Eligibility", lead.eligibilityStatus || "—"],
              ["Persona", lead.persona || "student"],
              ["Source", lead.source || "—"],
              ["Sentiment", lead.sentiment || "—"],
              ["Call outcome", lead.lastCallOutcome || "—"],
              ["WhatsApp opt-in", lead.waOptIn ? "Yes" : "No"],
            ].map(([k, v]) => (
              <div className="kv" key={String(k)}>
                <span>{String(k)}</span>
                <span>{String(v)}</span>
              </div>
            ))}
            <div className="kv">
              <span>Stage</span>
              <select
                value={String(lead.stage ?? "new")}
                onChange={async (e) => {
                  await updateDoc(doc(clientDb(), "leads", id), {
                    stage: e.target.value,
                    updatedAt: serverTimestamp(),
                  });
                  flash("Stage updated");
                }}
                style={{ width: "auto" }}
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            {lead.nextBestAction ? (
              <div className="kv">
                <span>Next best action</span>
                <span style={{ color: "#ecd9a8" }}>{String(lead.nextBestAction)}</span>
              </div>
            ) : null}
            <div className="row-actions">
              {phone && (
                <>
                  <a
                    className="adm-btn sm"
                    href={`https://wa.me/${phone.replace(/^\+/, "")}?text=${waText}`}
                    target="_blank"
                    rel="noopener"
                  >
                    Open WhatsApp
                  </a>
                  <a className="adm-btn ghost sm" href={`tel:${phone}`}>
                    Call
                  </a>
                  <SendTemplate leadId={id} onDone={() => flash("Template sent ✓")} />
                </>
              )}
              <button
                className="adm-btn ghost sm"
                onClick={async () => {
                  await addDoc(collection(clientDb(), "leads", id, "events"), {
                    type: "marked_contacted",
                    points: 0,
                    detail: null,
                    createdAt: serverTimestamp(),
                  });
                  await updateDoc(doc(clientDb(), "leads", id), {
                    lastContactAt: serverTimestamp(),
                  });
                  flash("Marked contacted");
                }}
              >
                Mark contacted
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="ttl">Score history (audit trail)</div>
            {events.length === 0 && <p className="empty">No events yet.</p>}
            {events.slice(0, 25).map((e) => (
              <div className="evt" key={e.id}>
                <b>{String(e.type).replace(/_/g, " ")}</b>
                <span>
                  {Number(e.points) > 0
                    ? `+${Number(e.points)}`
                    : Number(e.points) < 0
                      ? String(e.points)
                      : ""}{" "}
                  · {fmt(e.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function SendTemplate({ leadId, onDone }: { leadId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="adm-btn ghost sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const token = await getAuth().currentUser?.getIdToken();
          const res = await fetch("/api/whatsapp/send", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ leadId, step: "day1_eligibility" }),
          });
          if (res.ok) onDone();
          else alert("Send failed — is the number a registered test recipient?");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Sending…" : "Send Day-1 (WA)"}
    </button>
  );
}
