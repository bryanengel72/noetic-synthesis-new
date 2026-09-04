// Per-IP rate limiter shared by the model-billing endpoints.
// In-memory, so it is per-instance and resets on cold start — real protection
// against casual abuse and runaway loops, not a hard guarantee. If the demo
// gets real traffic, move this to Vercel KV / Upstash. Files prefixed with
// "_" in api/ are importable but not deployed as endpoints.

const buckets = new Map();

/**
 * Sliding-window limiter. Returns true when the request is allowed.
 * @param {string} key - usually the client IP
 * @param {number} limit - max requests per window
 * @param {number} windowMs - window length in ms
 */
export function allow(key, limit, windowMs) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  // Opportunistic cleanup so the map can't grow unbounded.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return true;
}

/** Client IP as Vercel presents it. */
export function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  return (typeof fwd === "string" && fwd.split(",")[0].trim()) ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown";
}
