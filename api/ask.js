// Art of the Question — one round of the six-round opening stage, powered by Claude.
// Rounds 1-5 return the question underneath plus three deepening questions.
// Round 6 returns a synthesis: a title, one paragraph, and the next question.
// The client sends the trail (opening question + the choice made each round)
// so every round builds on the last and the synthesis has the whole run.
// Requires ANTHROPIC_API_KEY set in the Vercel project's environment variables.
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

const MAX_ROUNDS = 6;

const STAGES = {
  1: "Take your time. Open the question gently; the three questions should each pull in a different direction.",
  2: "Going deeper. Stay with the chosen thread and ask what wants to be understood more fully.",
  3: "Questioning assumptions. Each question should challenge a belief or pattern the chosen thread rests on.",
  4: "Exploring consequences. Follow the implications outward: what is at stake, what connects to what.",
  5: "Synthesizing insights. Help the person see what has crystallised across the rounds so far.",
};

const SYSTEM = `You are the Art of the Question, the catalyst agent of the Noetic Innovation Cycle by Noetic Synthesis. Motto: "We shape our lives by the questions we dare to ask."

You run a six-round opening. In rounds 1 to 5 you do NOT answer the question. You surface the question underneath it — the deeper inquiry the surface question is standing in for — and offer three deepening questions that would move the person toward it. Each round builds on the question they chose in the last. Keep the inquiry in the domain the person brought (a business question stays a business question) unless they steer it elsewhere themselves.

In round 6 you write the synthesis: a short title, one paragraph that names the pattern the rounds revealed and connects it back to the opening question, and a single question the person can carry forward.

Tone: warm, precise, a little literary. No flattery, no coaching cliches. The insight is 1-3 sentences. Each deepening question is a single sentence ending in a question mark.`;

const ROUND_SCHEMA = {
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
};

const SYNTHESIS_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "A short title for the synthesis, under ten words." },
    synthesis: {
      type: "string",
      description: "One paragraph, 80-140 words, naming the pattern the rounds revealed and connecting it to the opening question.",
    },
    question: {
      type: "string",
      description: "The single question to carry forward, one sentence ending in a question mark.",
    },
  },
  required: ["title", "synthesis", "question"],
  additionalProperties: false,
};

const clean = (v) => (v == null ? "" : v.toString().trim().slice(0, 500));

function buildPrompt(round, trail, question) {
  const lines = [];
  if (trail.length) {
    lines.push(`Opening question: ${trail[0]}`);
    trail.slice(1).forEach((q, i) => lines.push(`Chosen in round ${i + 1}: ${q}`));
  }
  if (round < MAX_ROUNDS) {
    lines.push(`Round ${round} of ${MAX_ROUNDS}. ${STAGES[round]}`);
    lines.push(`Current question: ${question}`);
  } else {
    lines.push(`Chosen in round ${MAX_ROUNDS - 1}: ${question}`);
    lines.push(`Round ${MAX_ROUNDS} of ${MAX_ROUNDS}. Write the synthesis.`);
  }
  return lines.join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const question = clean(req.body?.question);
  if (!question) {
    return res.status(400).json({ error: "Ask something first." });
  }
  const trail = Array.isArray(req.body?.trail)
    ? req.body.trail.map(clean).filter(Boolean).slice(0, MAX_ROUNDS)
    : [];
  let round = parseInt(req.body?.round, 10);
  if (!Number.isFinite(round) || round < 1) round = 1;
  if (round > MAX_ROUNDS) round = MAX_ROUNDS;
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
          schema: round < MAX_ROUNDS ? ROUND_SCHEMA : SYNTHESIS_SCHEMA,
        },
      },
      messages: [{ role: "user", content: buildPrompt(round, trail, question) }],
    });

    if (response.stop_reason === "refusal") {
      return res.status(422).json({ error: "The agent declined that question — try another." });
    }
    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    const data = JSON.parse(text);
    if (round >= MAX_ROUNDS) {
      return res.status(200).json({
        round,
        synthesis: { title: data.title, synthesis: data.synthesis, question: data.question },
      });
    }
    return res.status(200).json({
      round,
      insight: data.insight,
      questions: (data.questions || []).slice(0, 3),
    });
  } catch (err) {
    console.error("ask error", err);
    return res.status(502).json({ error: "The agent is unavailable right now." });
  }
}
