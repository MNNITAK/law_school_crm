import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase/admin";

export type Precedent = {
  id?: string;
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

/** Sample records (from the approved demo + a few more in the same spirit).
 *  All flagged sample:true — replaced with the college's verified outcomes before launch. */
export const SEED: Precedent[] = [
  {
    tags: ["placement", "job", "career", "corporate", "firm"],
    cite: "Re: Placement Record, Batch of 2024",
    hold: "Argued in support of career outcomes.",
    body: "Graduates placed across litigation chambers, corporate legal teams and judicial coaching tracks within the first cycle.",
    a: "Sample", aL: "selections logged", b: "University of Lucknow", bL: "degree awarded", sample: true,
  },
  {
    tags: ["judiciary", "pcs", "judge", "civil services", "upsc"],
    cite: "Re: Judiciary Track, Alumni Line",
    hold: "Cited for judicial-services preparation.",
    body: "Honours students channelled into PCS-J and civil-services prep with a structured mentor-advocate from year three.",
    a: "PCS-J", aL: "focused track", b: "Yr 3", bL: "mentorship begins", sample: true,
  },
  {
    tags: ["moot", "competition", "argue", "debate", "practice"],
    cite: "Re: Moot Court Society",
    hold: "Cited for practical advocacy depth.",
    body: "Internal moot rounds run each term so students argue real fact patterns long before they reach a courtroom.",
    a: "Termly", aL: "moot rounds", b: "Yr 1", bL: "participation starts", sample: true,
  },
  {
    tags: ["fee", "fees", "roi", "cost", "afford", "value", "money"],
    cite: "Re: Cost & ROI, Integrated Route",
    hold: "Argued on return on investment.",
    body: "The 5-year integrated BA LL.B saves a full year versus separate graduation plus LL.B — a year of fees and a year of earning recovered.",
    a: "1 year", aL: "saved vs split route", b: "5-yr", bL: "integrated honours", sample: true,
  },
  {
    tags: ["affiliation", "recognition", "university", "valid", "degree"],
    cite: "Re: Affiliation, University of Lucknow",
    hold: "Cited for recognition and standing.",
    body: "The degree is awarded by the University of Lucknow under College Code 1238 — recognised standing at the Bar and in the judiciary.",
    a: "1238", aL: "college code", b: "State", bL: "university affiliation", sample: true,
  },
  {
    tags: ["internship", "experience", "training", "practical"],
    cite: "Re: Internship Pipeline",
    hold: "Cited for practical exposure.",
    body: "Students are routed into chamber and firm internships so the CV is built case by case, not in the final semester.",
    a: "Yearly", aL: "internship cycles", b: "Owned", bL: "by the student", sample: true,
  },
  {
    tags: ["hostel", "stay", "accommodation", "safety", "outstation"],
    cite: "Re: Residence & Guest House",
    hold: "Cited for outstation students and visiting parents.",
    body: "Hostel and guest-house facilities on record, with a visitor waiting room — outstation aspirants settle in, parents see where their ward lives.",
    a: "On campus", aL: "residence", b: "Guest house", bL: "for family visits", sample: true,
  },
  {
    tags: ["legal aid", "clinic", "social", "pro bono", "help people"],
    cite: "Re: Legal-Aid Clinic",
    hold: "Cited for service-led practice.",
    body: "Students assist real clients at the legal-aid desk — the earliest taste of what the profession is actually for.",
    a: "Live", aL: "client matters", b: "Supervised", bL: "by faculty", sample: true,
  },
  {
    tags: ["faculty", "teacher", "professor", "quality", "teaching"],
    cite: "Re: Faculty & Bench Strength",
    hold: "Cited for academic depth.",
    body: "Law taught by a faculty that pairs doctrine with practice, under Principal Dr. Shiv Bahadur Tiwari.",
    a: "LU", aL: "ordinances followed", b: "Practice", bL: "oriented teaching", sample: true,
  },
  {
    tags: ["library", "books", "research", "study"],
    cite: "Re: Law Library Holdings",
    hold: "Cited for research infrastructure.",
    body: "An extensive law collection supports coursework, moot preparation and judicial-services study.",
    a: "Extensive", aL: "collection", b: "All years", bL: "access", sample: true,
  },
  {
    tags: ["eligibility", "marks", "percentage", "cutoff", "qualify"],
    cite: "Re: Eligibility Ordinance, BA LL.B & LL.B",
    hold: "Cited on admission thresholds.",
    body: "BA LL.B (Hons.): 10+2 with 45% (40% SC/ST). LL.B: graduation with 50%. Intake is merit-based under University of Lucknow ordinances.",
    a: "45%", aL: "BA LL.B threshold", b: "50%", bL: "LL.B threshold", sample: true,
  },
  {
    tags: ["location", "reach", "distance", "lucknow", "transport"],
    cite: "Re: Campus Access, Jankipuram Vistar",
    hold: "Cited for reachability.",
    body: "Sector 9, Jankipuram Vistar on the AKTU–CDRI Road — a settled academic belt of Lucknow, reachable from across the city.",
    a: "Sector 9", aL: "Jankipuram Vistar", b: "AKTU road", bL: "landmark", sample: true,
  },
];

export function keywordsFor(p: Precedent): string[] {
  const text = [p.cite, p.hold, p.body, ...(p.tags ?? [])].join(" ").toLowerCase();
  return [...new Set(text.match(/[a-z]{3,}/g) ?? [])];
}

/** Lazily seed the collection on first use so the public demo works out of the box. */
export async function ensureSeeded() {
  const db = getDb();
  if (!db) return false;
  const any = await db.collection("precedents").limit(1).get();
  if (!any.empty) return true;
  const batch = db.batch();
  for (const p of SEED) {
    batch.set(db.collection("precedents").doc(), {
      ...p,
      keywords: keywordsFor(p),
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  return true;
}

/** Token-overlap search — right-sized for a library of dozens of records. */
export async function searchPrecedents(q: string): Promise<Precedent[]> {
  const db = getDb();
  let pool: (Precedent & { keywords?: string[] })[];
  if (db) {
    await ensureSeeded();
    const snap = await db.collection("precedents").limit(300).get();
    pool = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Precedent & { keywords?: string[] });
  } else {
    pool = SEED.map((p) => ({ ...p, keywords: keywordsFor(p) }));
  }
  const terms = (q.toLowerCase().match(/[a-z]{3,}/g) ?? []).slice(0, 8);
  if (!terms.length) return [];
  const scored = pool
    .map((p) => {
      const kw = p.keywords ?? keywordsFor(p);
      const tagHit = p.tags?.some((t) =>
        terms.some((x) => t.includes(x) || x.includes(t))
      )
        ? 3
        : 0;
      const kwHits = terms.filter((x) => kw.some((k) => k.startsWith(x))).length;
      return { p, s: tagHit + kwHits };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 6)
    .map((x) => x.p);
  return scored;
}
