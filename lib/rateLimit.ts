import "server-only";

/**
 * In-memory two-tier rate limiter (per serverless instance — best-effort
 * abuse damping, not a hard guarantee; the real cost guards are the global
 * call caps and provider budgets).
 *
 * Tier 1: per session key (conversationId / sessionId) — the actual limit.
 * Tier 2: per IP, much higher ceiling — many students share one campus NAT IP,
 *         so a plain per-IP limit falsely blocks legitimate users; the ceiling
 *         only catches someone spraying random session keys from one address.
 */
export function makeLimiter(opts: { perKey: number; perIp: number }) {
  const hits = new Map<string, { n: number; t: number }>();

  function bump(bucket: string, max: number) {
    const now = Date.now();
    const h = hits.get(bucket);
    if (!h || now - h.t > 60_000) {
      hits.set(bucket, { n: 1, t: now });
      return false;
    }
    h.n++;
    return h.n > max;
  }

  return function limited(sessionKey: string | undefined, ip: string) {
    // keep the map bounded across long-lived instances
    if (hits.size > 5000) {
      const now = Date.now();
      for (const [k, v] of hits) if (now - v.t > 60_000) hits.delete(k);
    }
    const ipLimited = bump(`ip:${ip}`, sessionKey ? opts.perIp : opts.perKey);
    const keyLimited = sessionKey ? bump(`k:${sessionKey}`, opts.perKey) : false;
    return ipLimited || keyLimited;
  };
}
