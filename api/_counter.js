// Durable run counter for the Cycle, so a post's traffic can be scored over days
// (Vercel keeps runtime logs for an hour on Hobby). One Redis hash per Pacific
// date, one field per ref tag: HINCRBY cycle:starts:2026-10-01 li-cycle-replay 1.
// Uses Upstash's REST API with plain fetch, no dependency. The Vercel Marketplace
// integration sets KV_REST_API_URL / KV_REST_API_TOKEN (older installs use the
// UPSTASH_REDIS_REST_* names). With neither set it does nothing, and a failure
// never blocks the run. Files prefixed with "_" in api/ are not endpoints.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const day = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());

export async function countStart(ref) {
  if (!URL_ || !TOKEN) return false;
  try {
    const r = await fetch(`${URL_}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["HINCRBY", `cycle:starts:${day()}`, ref, "1"],
        ["HINCRBY", "cycle:starts:all", ref, "1"],
      ]),
      signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) throw new Error(`Upstash ${r.status}`);
    return true;
  } catch (err) {
    console.error("cycle counter failed", String(err?.message || err));
    return false;
  }
}
