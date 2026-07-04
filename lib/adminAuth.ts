import "server-only";

/**
 * Verify a Firebase ID token from an Authorization: Bearer header.
 * Uses the Identity Toolkit REST API instead of firebase-admin/auth —
 * the admin auth module crashes when bundled on Vercel, and one HTTPS
 * call is all we need for a single-tenant counsellor login.
 */
export async function verifyAdmin(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const idToken = authHeader.slice(7);
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey || !idToken || idToken === "undefined") return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      users?: { localId: string; disabled?: boolean }[];
    };
    const user = data.users?.[0];
    if (!user || user.disabled) return null;
    return user.localId;
  } catch {
    return null;
  }
}
