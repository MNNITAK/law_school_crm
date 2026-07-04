import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: { root: path.join(__dirname) },
  // firebase-admin (esp. /auth) breaks when bundled by Turbopack on Vercel —
  // load it from node_modules at runtime instead
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
