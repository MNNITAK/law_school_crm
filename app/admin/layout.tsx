"use client";
import "./admin.css";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { clientAuth, firebaseConfigured } from "@/lib/firebase/client";

const NAV = [
  { href: "/admin", label: "Leads Board" },
  { href: "/admin/sequences", label: "Sequences" },
  { href: "/admin/precedents", label: "Precedents" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/insights", label: "Insights" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const path = usePathname();

  useEffect(() => {
    if (!firebaseConfigured()) {
      queueMicrotask(() => setChecking(false));
      return;
    }
    return onAuthStateChanged(clientAuth(), (u) => {
      setUser(u);
      setChecking(false);
    });
  }, []);

  if (checking)
    return (
      <div className="adm adm-login">
        <p style={{ color: "#8fa1b3" }}>Loading…</p>
      </div>
    );

  if (!firebaseConfigured())
    return (
      <div className="adm adm-login">
        <form onSubmit={(e) => e.preventDefault()}>
          <h1 style={{ margin: 0 }}>Counsellor CRM</h1>
          <p className="adm-err">
            Firebase is not configured yet. Add the NEXT_PUBLIC_FIREBASE_* env
            vars (see .env.example) and redeploy.
          </p>
        </form>
      </div>
    );

  if (!user) return <Login />;

  return (
    <div className="adm">
      <div className="adm-top">
        <div className="adm-brand">
          Counsellor&apos;s Chambers
          <small>City Law College · Live CRM</small>
        </div>
        <nav className="adm-nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={path === n.href ? "on" : ""}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="adm-spacer" />
        <span className="adm-user">{user.email}</span>
        <button className="adm-btn ghost sm" onClick={() => signOut(clientAuth())}>
          Sign out
        </button>
      </div>
      <main className="adm-main">{children}</main>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="adm adm-login">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          try {
            await signInWithEmailAndPassword(clientAuth(), email, pw);
          } catch {
            setErr("Sign-in failed — check email and password.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1 style={{ margin: 0 }}>Counsellor&apos;s Chambers</h1>
        <p style={{ color: "#8fa1b3", fontSize: ".8rem", margin: 0 }}>
          City Law College · admissions team sign-in
        </p>
        <div>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div>
          <label>Password</label>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {err && <p className="adm-err">{err}</p>}
        <button className="adm-btn" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
