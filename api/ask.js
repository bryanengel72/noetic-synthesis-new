// Art of the Question — single reflective pass, powered by Claude.
// Requires ANTHROPIC_API_KEY set in the Vercel project's environment variables.
// Currently unreferenced by the site: the public demo was removed deliberately.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Per-IP rate limit. In-memory, so it resets per serverless instance — a blunt
// guard against casual abuse, not a billing-grade quota.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

const SYSTEM = `You are the Art of the Question, the catalyst agent of the Noetic Innovation Cycle by Noetic Synthesis. Motto: "We shape our lives by the questions we dare to ask."

Given a user's question, you do NOT answer it. Instead you surface the question underneath it — the deeper inquiry their surface question is standing in for — and offer three deepening questions that would move them toward it.

Tone: warm, precise, a little literary. No flattery, no coaching cliches. The insight is 1-3 sentences. Each deepening question is a single sentence ending in a question mark.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const question = (req.body?.question || "").toString().trim().slice(0, 500);
  if (!question) {
    return res.status(400).json({ error: "Ask something first." });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "The agent is not configured yet — check back soon." });
  }
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    return res.status(429).json({ error: "Too many questions for now — come back in a bit." });
  }

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      // Thinking is on by default on claude-opus-5 and max_tokens caps
      // thinking + response together; low effort keeps the pass quick.
      max_tokens: 4096,
      system: SYSTEM,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              insight: {
                type: "string",
                description: "The question underneath the user's question, reflected back as a 1-3 sentence insight.",
              },
              questions: {
                type: "array",
                items: { type: "string" },
                description: "Exactly three deepening questions.",
              },
            },
            required: ["insight", "questions"],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: "user", content: question }],
    });

    if (response.stop_reason === "refusal") {
      return res.status(422).json({ error: "The agent declined that question — try another." });
    }
    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    const data = JSON.parse(text);
    return res.status(200).json({
      insight: data.insight,
      questions: (data.questions || []).slice(0, 3),
    });
  } catch (err) {
    console.error("ask error", err);
    return res.status(502).json({ error: "The agent is unavailable right now." });
  }
}
