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

type FollowUp = {
  id: string;
  leadId: string;
  sequence: string;
  step: string;
  persona?: string;
  status: string;
  dueAt?: Timestamp;
  sentAt?: Timestamp;
  payload?: { text?: string; waLink?: string } | null;
};

function fmt(ts?: Timestamp) {
  return ts ? ts.toDate().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function Sequences() {
  const [rows, setRows] = useState<FollowUp[]>([]);
  useEffect(() => {
    if (!firebaseConfigured()) return;
    const q = query(
      collection(clientDb(), "followups"),
      orderBy("dueAt", "asc"),
      limit(200)
    );
    return onSnapshot(q, (s) =>
      setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }) as FollowUp))
    );
  }, []);

  return (
    <>
      <h1>WhatsApp sequences — drip &amp; revival</h1>
      <p style={{ color: "#8fa1b3", fontSize: ".82rem", maxWidth: 720 }}>
        Steps are sent automatically by the daily runner to registered test
        numbers. For other numbers the runner prepares the message and marks it{" "}
        <b>ready for counsellor</b> — one click opens WhatsApp with the text
        prefilled (assisted send).
      </p>
      {rows.length === 0 ? (
        <p className="empty">
          No sequences scheduled yet. They start when a lead opts in to
          WhatsApp during an Aria chat.
        </p>
      ) : (
        <div className="panel" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Lead</th>
                <th>Sequence</th>
                <th>Step</th>
                <th>Due</th>
                <th>Status</th>
                <th>Sent</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/leads/${r.leadId}`} style={{ color: "#ecd9a8" }}>
                      {r.leadId.slice(0, 6)}…
                    </Link>
                  </td>
                  <td>{r.sequence.replace(/_/g, " ")}</td>
                  <td>{r.step.replace(/_/g, " ")}</td>
                  <td>{fmt(r.dueAt)}</td>
                  <td>
                    <span className={`pill-status ${r.status}`}>
                      {r.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td>{fmt(r.sentAt)}</td>
                  <td>
                    {r.status === "ready_for_counsellor" && r.payload?.waLink && (
                      <a className="adm-btn sm" href={r.payload.waLink} target="_blank" rel="noopener">
                        Send via WhatsApp
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
