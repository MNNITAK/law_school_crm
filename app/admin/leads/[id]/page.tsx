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
  deleteField,
  Timestamp,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { clientDb, firebaseConfigured } from "@/lib/firebase/client";
import { WA_TEMPLATES } from "@/lib/templates";

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
                  <CallNow leadId={id} onDone={flash} />
                </>
              )}
              {Boolean(lead.handoffAt) && (
                <button
                  className="adm-btn ghost sm"
                  title="Handoff mutes the WhatsApp bot for this lead — this hands the conversation back to Aria"
                  onClick={async () => {
                    await updateDoc(doc(clientDb(), "leads", id), {
                      handoffAt: deleteField(),
                      updatedAt: serverTimestamp(),
                    });
                    flash("Bot resumed for this lead");
                  }}
                >
                  🤖 Resume bot
                </button>
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

          <Copilot lead={lead} messages={messages} onDone={flash} />

          {phone && (
            <TemplatePanel
              leadId={id}
              persona={String(lead.persona ?? "student")}
              onDone={flash}
            />
          )}

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

function CallNow({ leadId, onDone }: { leadId: string; onDone: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="adm-btn sm"
      style={{ background: "#8a2735", color: "#fff" }}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const token = await getAuth().currentUser?.getIdToken();
          const res = await fetch("/api/voice/outbound-call", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ leadId }),
          });
          const data = await res.json();
          if (data.status === "placed") onDone("📞 AI is calling the lead now");
          else if (data.status === "queued")
            onDone("Call queued — connect the telephony provider (Vapi) to dial");
          else onDone(`Not called: ${data.detail}`);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Dialling…" : "📞 Call now (AI)"}
    </button>
  );
}

type CopilotResult = {
  headline?: string;
  journey?: string;
  signals?: string[];
  risks?: string[];
  action?: string;
  why?: string;
  urgency?: string;
  reply?: string;
  tone_note?: string;
};

/** AI copilot: one-click lead summary, next-best-action, or a drafted reply.
 *  Reuses the lead's already-loaded messages — no re-fetch. */
function Copilot({
  lead,
  messages,
  onDone,
}: {
  lead: AnyDoc;
  messages: AnyDoc[];
  onDone: (m: string) => void;
}) {
  const [busy, setBusy] = useState<string>("");
  const [res, setRes] = useState<CopilotResult | null>(null);
  const [kind, setKind] = useState<string>("");

  const phone = ((lead.phone as string) || "").replace(/^\+/, "");

  const run = async (action: "summary" | "draft" | "nba") => {
    if (!messages.length) {
      onDone("No conversation yet to analyse");
      return;
    }
    setBusy(action);
    setRes(null);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const r = await fetch("/api/leads/copilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action,
          lead: {
            name: lead.name ?? null,
            course: lead.course ?? null,
            city: lead.city ?? null,
            qualifyingPercent: lead.qualifyingPercent ?? null,
            persona: lead.persona ?? null,
            stage: lead.stage ?? null,
          },
          messages: messages.slice(-60).map((m) => ({
            role: String(m.role),
            content: String(m.content).slice(0, 4000),
          })),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.result) {
        setRes(data.result as CopilotResult);
        setKind(action);
      } else onDone(`Copilot failed: ${data.error ?? r.status}`);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="panel">
      <div className="ttl">✦ AI copilot</div>
      <div className="row-actions" style={{ marginBottom: res ? 12 : 0 }}>
        <button className="adm-btn sm" disabled={!!busy} onClick={() => run("summary")}>
          {busy === "summary" ? "Reading…" : "Summarise lead"}
        </button>
        <button className="adm-btn ghost sm" disabled={!!busy} onClick={() => run("nba")}>
          {busy === "nba" ? "Thinking…" : "Next best action"}
        </button>
        <button className="adm-btn ghost sm" disabled={!!busy} onClick={() => run("draft")}>
          {busy === "draft" ? "Writing…" : "Draft reply"}
        </button>
      </div>

      {res && kind === "summary" && (
        <div style={{ fontSize: ".82rem" }}>
          <p style={{ color: "#ecd9a8", fontWeight: 600, margin: "0 0 6px" }}>
            {res.headline}
          </p>
          <p style={{ margin: "0 0 8px" }}>{res.journey}</p>
          {!!res.signals?.length && (
            <p style={{ margin: "0 0 6px" }}>
              <b style={{ color: "#7ee0a0" }}>Signals:</b> {res.signals.join(" · ")}
            </p>
          )}
          {!!res.risks?.length && (
            <p style={{ margin: 0 }}>
              <b style={{ color: "#e0a07e" }}>Risks:</b> {res.risks.join(" · ")}
            </p>
          )}
        </div>
      )}

      {res && kind === "nba" && (
        <div style={{ fontSize: ".82rem" }}>
          <p style={{ color: "#ecd9a8", fontWeight: 600, margin: "0 0 4px" }}>
            {res.action}{" "}
            <span
              style={{
                fontSize: ".68rem",
                border: "1px solid",
                borderRadius: 10,
                padding: "1px 7px",
                color:
                  res.urgency === "high"
                    ? "#ff9d9d"
                    : res.urgency === "medium"
                      ? "#ecd9a8"
                      : "#8fa1b3",
              }}
            >
              {res.urgency}
            </span>
          </p>
          <p style={{ margin: 0, color: "#8fa1b3" }}>{res.why}</p>
        </div>
      )}

      {res && kind === "draft" && (
        <div style={{ fontSize: ".82rem" }}>
          <p
            style={{
              background: "#0a1722",
              border: "1px solid rgba(202,164,80,.2)",
              borderRadius: 8,
              padding: "8px 10px",
              whiteSpace: "pre-wrap",
              margin: "0 0 8px",
            }}
          >
            {res.reply}
          </p>
          <div className="row-actions">
            <button
              className="adm-btn sm"
              onClick={() => {
                navigator.clipboard?.writeText(res.reply ?? "");
                onDone("Draft copied");
              }}
            >
              Copy
            </button>
            {phone && (
              <a
                className="adm-btn ghost sm"
                href={`https://wa.me/${phone}?text=${encodeURIComponent(res.reply ?? "")}`}
                target="_blank"
                rel="noopener"
              >
                Open in WhatsApp
              </a>
            )}
          </div>
          {res.tone_note && (
            <p style={{ color: "#8fa1b3", fontSize: ".7rem", margin: "8px 0 0" }}>
              {res.tone_note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Demo weapon: fire any nurture template at this lead, instantly, with the
 *  psychology explained — "this is what the system sends in this scenario". */
function TemplatePanel({
  leadId,
  persona,
  onDone,
}: {
  leadId: string;
  persona: string;
  onDone: (m: string) => void;
}) {
  const [sel, setSel] = useState(WA_TEMPLATES[0].id);
  const [busy, setBusy] = useState(false);
  const t = WA_TEMPLATES.find((x) => x.id === sel)!;
  const preview = (persona === "parent" ? t.parent : t.student).replace(
    /\{name\}/g,
    "…"
  );
  return (
    <div className="panel">
      <div className="ttl">WhatsApp nurture templates — manual trigger</div>
      <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ marginBottom: 8 }}>
        {WA_TEMPLATES.map((x) => (
          <option key={x.id} value={x.id}>
            {x.label}
          </option>
        ))}
      </select>
      <p style={{ fontSize: ".7rem", color: "#8fa1b3", margin: "0 0 4px" }}>
        <b style={{ color: "#ecd9a8" }}>Auto-fires:</b> {t.scenario}
      </p>
      <p style={{ fontSize: ".7rem", color: "#8fa1b3", margin: "0 0 8px" }}>
        <b style={{ color: "#ecd9a8" }}>Psychology:</b> {t.psychology}
      </p>
      <p
        style={{
          fontSize: ".76rem",
          background: "#0a1722",
          border: "1px solid rgba(202,164,80,.2)",
          borderRadius: 8,
          padding: "8px 10px",
          whiteSpace: "pre-wrap",
          maxHeight: 140,
          overflowY: "auto",
        }}
      >
        {preview}
      </p>
      <button
        className="adm-btn sm"
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
              body: JSON.stringify({ leadId, step: sel }),
            });
            if (res.ok) onDone(`✓ "${t.label}" sent on WhatsApp`);
            else {
              const d = await res.json().catch(() => ({}));
              onDone(`Send failed: ${d.error ?? res.status}`);
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Sending…" : "Send this template now →"}
      </button>
    </div>
  );
}
