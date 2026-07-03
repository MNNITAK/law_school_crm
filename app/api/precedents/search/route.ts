import { NextRequest, NextResponse } from "next/server";
import { searchPrecedents } from "@/lib/precedents";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { q?: string } | null;
  const q = (body?.q ?? "").slice(0, 120);
  if (!q) return NextResponse.json({ results: [] });
  try {
    const results = await searchPrecedents(q);
    return NextResponse.json({ results });
  } catch (e) {
    console.error("[/api/precedents/search]", e);
    return NextResponse.json({ results: [] });
  }
}
