import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: { root: path.join(__dirname) },
  // firebase-admin (esp. /auth) breaks when bundled by Turbopack on Vercel —
  // load it from node_modules at runtime instead
  serverExternalPackages: ["firebase-admin"],
  async headers() {
    const allowed = (process.env.WIDGET_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    // Unset → any site may embed /widget (trial default); set to the client's
    // origin(s) to lock it down. Evaluated at build time — redeploy after changing.
    const frameAncestors = allowed.length
      ? `frame-ancestors 'self' ${allowed.join(" ")};`
      : "frame-ancestors *;";
    return [
      {
        source: "/widget",
        headers: [{ key: "Content-Security-Policy", value: frameAncestors }],
      },
    ];
  },
};

export default nextConfig;
