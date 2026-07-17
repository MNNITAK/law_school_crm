import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase/admin";
import { verifyAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";

const COLS = [
  "id",
  "name",
  "phone",
  "email",
  "city",
  "course",
  "qualifyingPercent",
  "category",
  "eligibilityStatus",
  "persona",
  "source",
  "stage",
  "score",
  "temperature",
  "lastCallOutcome",
  "waOptIn",
  "nextBestAction",
  "createdAt",
  "firstContactAt",
  "lastContactAt",
];

function csvCell(v: unknown): string {
  if (v == null) return "";
  let s: string;
  if (typeof v === "object" && v !== null && "toDate" in (v as object)) {
    s = (v as { toDate(): Date }).toDate().toISOString();
  } else s = String(v);
  if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export async function GET(req: NextRequest) {
  const uid = await verifyAdmin(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "unconfigured" }, { status: 503 });

  const snap = await db.collection("leads").orderBy("createdAt", "desc").limit(5000).get();
  const rows = [COLS.join(",")];
  for (const doc of snap.docs) {
    const d = { id: doc.id, ...doc.data() } as Record<string, unknown>;
    rows.push(COLS.map((c) => csvCell(d[c])).join(","));
  }
  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=leads.csv`,
    },
  });
}
