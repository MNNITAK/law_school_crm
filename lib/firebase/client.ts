"use client";
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * Web SDK config — these NEXT_PUBLIC_* values are safe to expose (Firebase
 * security comes from Firestore rules + Auth, not from hiding the config).
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;

export function firebaseConfigured() {
  return !!(config.apiKey && config.projectId);
}

function getApp(): FirebaseApp {
  if (!app)
    app = getApps()[0] ?? initializeApp(config as Record<string, string>);
  return app;
}

export function clientAuth(): Auth {
  return getAuth(getApp());
}

export function clientDb(): Firestore {
  return getFirestore(getApp());
}
