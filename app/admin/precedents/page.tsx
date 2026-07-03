"use client";
import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { clientDb, firebaseConfigured } from "@/lib/firebase/client";

type P = {
  id: string;
  cite: string;
  hold: string;
  body: string;
  tags: string[];
  a: string;
  aL: string;
  b: string;
  bL: string;
  sample?: boolean;
};

const EMPTY = { cite: "", hold: "", body: "", tags: "", a: "", aL: "", b: "", bL: "" };

function kw(p: { cite: string; hold: string; body: string; tags: string[] }) {
  const text = [p.cite, p.hold, p.body, ...p.tags].join(" ").toLowerCase();
  return [...new Set(text.match(/[a-z]{3,}/g) ?? [])];
}

export default function AdminPrecedents() {
  const [rows, setRows] = useState<P[]>([]);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!firebaseConfigured()) return;
    const qy = query(collection(clientDb(), "precedents"), orderBy("cite"));
    return onSnapshot(qy, (s) =>
      setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }) as P))
    );
  }, []);

  async function save() {
    if (!form.cite || !form.body) {
      setMsg("Citation and body are required.");
      return;
    }
    const tags = form.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    const data = {
      cite: form.cite,
      hold: form.hold,
      body: form.body,
      tags,
      a: form.a,
      aL: form.aL,
      b: form.b,
      bL: form.bL,
      sample: false,
      keywords: kw({ ...form, tags }),
    };
    if (editing) {
      await updateDoc(doc(clientDb(), "precedents", editing), data);
      setMsg("Updated ✓ — live on the public engine immediately.");
    } else {
      await addDoc(collection(clientDb(), "precedents"), {
        ...data,
        createdAt: serverTimestamp(),
      });
      setMsg("Added ✓ — live on the public engine immediately.");
    }
    setForm(EMPTY);
    setEditing(null);
  }

  return (
    <>
      <h1>Precedent library</h1>
      <p style={{ color: "#8fa1b3", fontSize: ".82rem", maxWidth: 700 }}>
        These records power the public Precedent Engine. Replace the{" "}
        <b>sample</b> entries with verified outcomes — a record added here is
        citable to parents seconds later.
      </p>

      <div className="panel">
        <div className="ttl">{editing ? "Edit record" : "Add a record"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label>Citation (e.g. “Re: Placement Record, Batch of 2025”)</label>
            <input value={form.cite} onChange={(e) => setForm({ ...form, cite: e.target.value })} />
          </div>
          <div>
            <label>Holding (one-line claim)</label>
            <input value={form.hold} onChange={(e) => setForm({ ...form, hold: e.target.value })} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Body (the verified fact, 1–2 sentences)</label>
            <textarea rows={2} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </div>
          <div>
            <label>Tags (comma separated: placement, job, career…)</label>
            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
            <div><label>Stat A</label><input value={form.a} onChange={(e) => setForm({ ...form, a: e.target.value })} /></div>
            <div><label>A label</label><input value={form.aL} onChange={(e) => setForm({ ...form, aL: e.target.value })} /></div>
            <div><label>Stat B</label><input value={form.b} onChange={(e) => setForm({ ...form, b: e.target.value })} /></div>
            <div><label>B label</label><input value={form.bL} onChange={(e) => setForm({ ...form, bL: e.target.value })} /></div>
          </div>
        </div>
        <div className="row-actions">
          <button className="adm-btn sm" onClick={save}>
            {editing ? "Save changes" : "Add to library"}
          </button>
          {editing && (
            <button
              className="adm-btn ghost sm"
              onClick={() => {
                setEditing(null);
                setForm(EMPTY);
              }}
            >
              Cancel
            </button>
          )}
          {msg && <span style={{ color: "#7ee0a0", fontSize: ".78rem" }}>{msg}</span>}
        </div>
      </div>

      <div className="panel" style={{ overflowX: "auto" }}>
        <div className="ttl">Library ({rows.length})</div>
        <table>
          <thead>
            <tr>
              <th>Citation</th>
              <th>Holding</th>
              <th>Tags</th>
              <th>Type</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ color: "#ecd9a8" }}>{r.cite}</td>
                <td>{r.hold}</td>
                <td style={{ color: "#8fa1b3" }}>{(r.tags ?? []).join(", ")}</td>
                <td>{r.sample ? <span className="pill-status pending">sample</span> : <span className="pill-status sent">verified</span>}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button
                    className="adm-btn ghost sm"
                    onClick={() => {
                      setEditing(r.id);
                      setForm({
                        cite: r.cite, hold: r.hold, body: r.body,
                        tags: (r.tags ?? []).join(", "),
                        a: r.a, aL: r.aL, b: r.b, bL: r.bL,
                      });
                      scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Edit
                  </button>{" "}
                  <button
                    className="adm-btn ghost sm"
                    onClick={async () => {
                      if (confirm("Delete this record?"))
                        await deleteDoc(doc(clientDb(), "precedents", r.id));
                    }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="empty">
            Library is empty — it auto-seeds with sample records the first time
            someone searches on the public page.
          </p>
        )}
      </div>
    </>
  );
}
