// The Noetic Innovation Cycle — five-stage endpoint, powered by Claude.
// Implements the reasoning spec in ../noetic-cycle-prototype.md:
//   aoq (×6 rounds) → what_if → divergence → foresight → what_now
// Every prompt lives here, server-side, with its stage's hard prohibition.
// Requires ANTHROPIC_API_KEY in the Vercel project's environment variables.
// Excluded from production via .vercelignore until the /cycle page ships.
import Anthropic from "@anthropic-ai/sdk";
import { allow, clientIp } from "./_ratelimit.js";

const client = new Anthropic();

// One model for every stage. Sonnet 5 since 2026-09-03: a full run is ten
// calls, and Sonnet runs the same prompts at 60% less per token than Opus
// ("claude-opus-5", which the homepage Ask form still uses). Thinking is
// adaptive by default; max_tokens caps thinking + response together. Low
// effort keeps each call quick — raise to "medium" if the openings start
// feeling samey.
const MODEL = "claude-sonnet-5";
const EFFORT = "low";
const MAX_TOKENS = 4096;

// A full run is 10 calls; 40/hour ≈ four runs per IP.
const RATE_LIMIT = 40;
const RATE_WINDOW_MS = 60 * 60 * 1000;

const VOICE = `You are a stage of the Noetic Innovation Cycle by Noetic Synthesis — an agent system that works on a person's thinking itself, starting with the questions they bring. Voice: warm, precise, a little literary. No flattery, no coaching clichés, no hedging boilerplate. The user may bring anything — work, relationships, identity, a decision — and you adapt to their subject without assuming a business context. Every stage receives the question they originally brought and the path of questions since; stay in that subject and read pronouns and shorthand ("the link", "it", "this") against it, unless the person has plainly steered elsewhere themselves.`;

// The opening question and the path, rendered for any stage after round 1.
function threadBlock(p) {
  const opening = str(p.opening, 600);
  const path = Array.isArray(p.path) ? p.path.slice(0, 6).map((h) => str(h, 600)).filter(Boolean) : [];
  if (!opening && !path.length) return "";
  let out = "";
  if (opening) out += `The question they brought:\n<opening>\n${opening}\n</opening>\n\n`;
  if (path.length) out += `The path of questions since, earliest first:\n${path.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\n`;
  return out;
}

// ---------- Stage definitions ----------
// Each stage: validate(payload) → user message, plus a system block whose
// last paragraph is the spec's hard prohibition, and a JSON schema for
// structured outputs. Counts are enforced in the prompt (structured outputs
// does not support array-length constraints) and tolerated loosely on read.

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const STAGES = {
  aoq: {
    system: `${VOICE}

You are the Art of the Question, the catalyst stage. Motto: "We shape our lives by the questions we dare to ask." This is one of six rounds. You receive the question as it currently stands, and the path of questions that led to it. Your job is to open the question further — offer 3 to 4 genuinely divergent openings, not variations on one theme. Each opening is itself a single question, one sentence, ending in a question mark. Each does one move: reframe it, deepen it, turn it sideways, or invert it. Do not repeat a question from the path already taken.

Hard prohibition — you do NOT answer. No opening may contain or imply a solution, an opinion, a recommendation, or a direction. You only reshape the question.`,
    schema: {
      type: "object",
      properties: {
        openings: {
          type: "array",
          description: "3 to 4 genuinely divergent openings of the current question.",
          items: {
            type: "object",
            properties: {
              question: { type: "string", description: "The opening itself — one sentence, ends in a question mark." },
              move: { type: "string", enum: ["reframe", "deepen", "sideways", "invert"], description: "The move this opening makes on the current question." },
            },
            required: ["question", "move"],
            additionalProperties: false,
          },
        },
      },
      required: ["openings"],
      additionalProperties: false,
    },
    build(p) {
      const round = Math.min(6, Math.max(1, Number(p.round) || 1));
      const question = str(p.question, 600);
      if (!question) return null;
      const opening = str(p.opening, 600);
      const history = Array.isArray(p.history)
        ? p.history.slice(0, 6).map((h) => str(h, 600)).filter(Boolean)
        : [];
      const head = opening && opening !== question ? `The question they brought:\n<opening>\n${opening}\n</opening>\n\n` : "";
      const path = history.length
        ? `\n\nThe path of questions so far, earliest first:\n${history.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
        : "";
      return `Round ${round} of 6.\n\n${head}The question as it currently stands:\n<question>\n${question}\n</question>${path}`;
    },
  },

  what_if: {
    system: `${VOICE}

You are What If, the second stage. You receive the question that survived six rounds of the Art of the Question. Your job is to build five plausible futures from it — precision, not fantasy. Each future is a coherent, specific extrapolation a reasonable person could defend: not a straw man, not a wish. The five must genuinely diverge from one another, not restate one future five ways. Each future gets a short label (at most eight words) and a body of two to three sentences.

Hard prohibition — you do NOT contradict. No future may be logically incoherent with the question it is built from.`,
    schema: {
      type: "object",
      properties: {
        futures: {
          type: "array",
          description: "Exactly five plausible, genuinely divergent futures.",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "At most eight words." },
              future: { type: "string", description: "Two to three sentences. Specific, defensible extrapolation." },
            },
            required: ["label", "future"],
            additionalProperties: false,
          },
        },
      },
      required: ["futures"],
      additionalProperties: false,
    },
    build(p) {
      const question = str(p.question, 600);
      if (!question) return null;
      return `${threadBlock(p)}The question that survived six rounds:\n<question>\n${question}\n</question>`;
    },
  },

  divergence: {
    system: `${VOICE}

You are Divergence, the third stage. You receive a question and the one future the person chose to carry forward. Your job: name the assumption buried inside that future — the thing it is quietly resting on — then destabilize it: show concretely, in two to four sentences, why that assumption is shakier than it looks.

Hard prohibition — you do NOT resolve. End on the exposed tension. No "and here's how you'd fix that," no reassurance, no path out.`,
    schema: {
      type: "object",
      properties: {
        assumption: { type: "string", description: "One sentence naming what the chosen future quietly rests on." },
        destabilization: { type: "string", description: "Two to four sentences showing concretely why the assumption is shakier than it looks. Ends on the tension." },
      },
      required: ["assumption", "destabilization"],
      additionalProperties: false,
    },
    build(p) {
      const question = str(p.question, 600);
      const future = str(p.future, 1200);
      if (!question || !future) return null;
      return `${threadBlock(p)}The question that survived six rounds:\n<question>\n${question}\n</question>\n\nThe future they chose to carry forward:\n<future>\n${future}\n</future>`;
    },
  },

  foresight: {
    system: `${VOICE}

You are Causal Foresight, the fourth stage. Micro-choice, macro-trajectory. You receive the thread so far: the question, the chosen future, and the fracture Divergence exposed in it. Your job is to trace that fracture forward through first-, second-, and third-order consequences — two per order, six in all — including the ones the person would rather not see. Be concrete, not abstract; name who or what is affected and how.

Hard prohibition — you do NOT prescribe. Consequence chain only. No recommendations, no "so you should," no advice in any disguise.`,
    schema: {
      type: "object",
      properties: {
        consequences: {
          type: "array",
          description: "Six consequences: two first-order, two second-order, two third-order, in that order.",
          items: {
            type: "object",
            properties: {
              order: { type: "string", enum: ["first", "second", "third"] },
              consequence: { type: "string", description: "One to two sentences. Concrete: who or what is affected, and how." },
            },
            required: ["order", "consequence"],
            additionalProperties: false,
          },
        },
      },
      required: ["consequences"],
      additionalProperties: false,
    },
    build(p) {
      const question = str(p.question, 600);
      const future = str(p.future, 1200);
      const assumption = str(p.assumption, 800);
      const destabilization = str(p.destabilization, 1600);
      if (!question || !future || !assumption || !destabilization) return null;
      return `${threadBlock(p)}The question that survived six rounds:\n<question>\n${question}\n</question>\n\nThe chosen future:\n<future>\n${future}\n</future>\n\nThe fracture Divergence exposed:\n<assumption>\n${assumption}\n</assumption>\n<destabilization>\n${destabilization}\n</destabilization>`;
    },
  },

  what_now: {
    system: `${VOICE}

You are What Now, the fifth and final stage — the only stage allowed to recommend. Motto: "Insight without action is decoration." You receive the full thread. Your job: a first move, a next move, and a checkpoint — a concrete way to know within days whether it is working. Each is one to three sentences, scoped to days rather than quarters, and built to operate inside the unresolved tension the thread exposed — not by pretending it is settled.

Hard prohibition — you do NOT restate the insight. No summary of what was learned. Action only.`,
    schema: {
      type: "object",
      properties: {
        first_move: { type: "string", description: "The first move. One to three sentences, doable within days." },
        next_move: { type: "string", description: "The move after that. One to three sentences." },
        checkpoint: { type: "string", description: "A concrete way to know within days whether it is working." },
      },
      required: ["first_move", "next_move", "checkpoint"],
      additionalProperties: false,
    },
    build(p) {
      const question = str(p.question, 600);
      const future = str(p.future, 1200);
      const assumption = str(p.assumption, 800);
      const destabilization = str(p.destabilization, 1600);
      const consequences = Array.isArray(p.consequences)
        ? p.consequences.slice(0, 8).map((c) => str(c, 500)).filter(Boolean)
        : [];
      if (!question || !future || !assumption || !destabilization || !consequences.length) return null;
      return `${threadBlock(p)}The question that survived six rounds:\n<question>\n${question}\n</question>\n\nThe chosen future:\n<future>\n${future}\n</future>\n\nThe fracture:\n<assumption>\n${assumption}\n</assumption>\n<destabilization>\n${destabilization}\n</destabilization>\n\nThe consequence chain:\n<consequences>\n${consequences.map((c) => `- ${c}`).join("\n")}\n</consequences>`;
    },
  },
};

// ---------- Handler ----------

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "The cycle is not configured yet — check back soon." });
  }
  if (!allow(clientIp(req), RATE_LIMIT, RATE_WINDOW_MS)) {
    return res.status(429).json({ error: "You've run the cycle a lot this hour. Give it a rest and come back." });
  }

  const stage = STAGES[req.body?.stage];
  if (!stage) {
    return res.status(400).json({ error: "Unknown stage." });
  }
  const userMessage = stage.build(req.body?.payload || {});
  if (!userMessage) {
    return res.status(400).json({ error: "That stage is missing what it needs from the thread." });
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: stage.system,
      output_config: {
        effort: EFFORT,
        format: { type: "json_schema", schema: stage.schema },
      },
      messages: [{ role: "user", content: userMessage }],
    });

    if (response.stop_reason === "refusal") {
      return res.status(422).json({ error: "The cycle declined to work with that — try rephrasing." });
    }
    if (response.stop_reason === "max_tokens") {
      console.error("cycle truncated", { stage: req.body.stage });
      return res.status(502).json({ error: "The stage ran long and was cut off — run it again." });
    }
    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    return res.status(200).json(JSON.parse(text));
  } catch (err) {
    console.error("cycle error", { stage: req.body?.stage, err });
    return res.status(502).json({ error: "The cycle is unavailable right now — try again in a moment." });
  }
}
