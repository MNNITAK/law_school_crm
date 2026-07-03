import "server-only";
import { getAuth } from "firebase-admin/auth";
import { getDb } from "@/lib/firebase/admin";

/** Verify a Firebase ID token from an Authorization: Bearer header. Returns uid or null. */
export async function verifyAdmin(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  if (!getDb()) return null; // admin SDK not configured
  try {
    const decoded = await getAuth().verifyIdToken(authHeader.slice(7));
    return decoded.uid;
  } catch {
    return null;
  }
}
