import "server-only";
import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Lazy firebase-admin init so the app builds and runs (with persistence
 * disabled) before credentials are configured.
 *
 * Env (either one):
 *   FIREBASE_SERVICE_ACCOUNT      — raw JSON of the service-account key
 *   FIREBASE_SERVICE_ACCOUNT_B64  — the same JSON, base64-encoded (easier on Vercel)
 */
let app: App | null = null;
let db: Firestore | null = null;
let warned = false;

function loadCredentials(): Record<string, unknown> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  try {
    if (raw) return JSON.parse(raw);
    if (b64) return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch (e) {
    console.error("[firebase] service account JSON is invalid:", e);
  }
  return null;
}

export function getDb(): Firestore | null {
  if (db) return db;
  const creds = loadCredentials();
  if (!creds) {
    if (!warned) {
      warned = true;
      console.warn(
        "[firebase] FIREBASE_SERVICE_ACCOUNT(_B64) not set — persistence disabled."
      );
    }
    return null;
  }
  app =
    getApps()[0] ??
    initializeApp({
      credential: cert(creds as Parameters<typeof cert>[0]),
    });
  db = getFirestore(app);
  return db;
}
