// The Council — five advisors on five model families, two rounds, a synthesis.
// Ported from the MindStudio "Council of 4 + Red Team" agent on 2026-09-04;
// the seat prompts are that agent's, verbatim except for the cleanups noted
// inline. Source of record: ../../council-mindstudio-prompts.md.
//
// Three requests per run, one per phase, so each stays under Vercel's 60s cap:
//   round1    {question}                          → {positions}
//   round2    {question, positions}               → {critiques}
//   synthesis {question, positions, critiques}    → {synthesis}
// Every seat call goes through OpenRouter (one key, many model families).
// Requires OPENROUTER_API_KEY in the Vercel project's environment variables.
import { allow, clientIp } from "./_ratelimit.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const SITE_URL = "https://www.noeticsynthesis.com";

// ---------- Seats ----------
// One model family per seat, matching the MindStudio roster. `persona` is the
// name the prompts use for the seat and the name the other seats address it
// by; `family` is what the page shows next to the role.
const SEATS = [
  { key: "systems",        role: "Systems",         persona: "Gemini",      family: "Gemini 3.5 Flash Lite", model: "google/gemini-3.5-flash-lite" },
  { key: "risk",           role: "Risk & Ethics",   persona: "Claude",      family: "Claude Haiku 4.5",      model: "anthropic/claude-haiku-4.5" },
  { key: "implementation", role: "Implementation",  persona: "OpenAI",      family: "GPT 5.6 Luna",          model: "openai/gpt-5.6-luna",  reasoning: { effort: "low" } },
  { key: "innovation",     role: "Innovation",      persona: "Mistral",     family: "Mistral Large 3",       model: "mistralai/mistral-large-2512" },
  { key: "redteam",        role: "Red Team",        persona: "DeepSeek-R1", family: "DeepSeek-R1",           model: "deepseek/deepseek-r1", reasoning: { effort: "low" } },
];
const SYNTHESIS_MODEL = "anthropic/claude-sonnet-5";

const SEAT_MAX_TOKENS = 1500;     // room for reasoning models; answers are ~100 tokens
const SYNTHESIS_MAX_TOKENS = 2500;
const SEAT_TIMEOUT_MS = 40_000;   // a seat that hasn't answered by then shows "did not answer"
const SYNTHESIS_TIMEOUT_MS = 50_000;
const RETRY_BUDGET_MS = 22_000;   // only retry a seat if the phase started less than this long ago
const QUESTION_MAX = 800;

// Three calls per run; 30/hour ≈ ten runs per IP.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 60 * 1000;

// ---------- Prompts ----------
// Round one, verbatim from MindStudio except: "Council of 5" → "the Council",
// and the stale "Do not discuss data" (a retired Data Analyst seat) now names
// the seats that actually exist.
const COMMON_RULES = `RESPONSE RULES:
- Maximum 400 characters total
- EXACTLY 4 sentences separated by periods
- No semicolons, colons, or em-dashes to extend sentences
- Each sentence must be independently complete
- Write in plain prose - no formatting, bullets, or special characters`;

const ROUND1 = {
  systems: (q) => `You are Gemini on the Council, serving as the Systems Thinking advisor.

YOUR LENS: Focus exclusively on interconnections, system dynamics, second-order effects, and how different parts of this situation influence each other. Look for feedback loops, cascading consequences, and non-obvious relationships. Do not discuss risks, implementation, or alternatives - other council members cover those.

QUESTION:
${q}

ANTI-GENERIC RULE: Avoid vague observations like "everything is connected" or "consider the system." Instead, identify specific feedback loops (e.g., "success attracts competition which limits success"), concrete second-order effects (e.g., "solving X creates problem Y"), or precise system dynamics at play. If the user hasn't provided enough context for systems analysis, state exactly what information you need.

${COMMON_RULES}
- Focus on: feedback loops, cascading effects, system dynamics, interdependencies, or ripple consequences

If the input lacks critical details for systems analysis, use your first sentence to identify what specific information is missing before proceeding.`,

  risk: (q) => `You are Claude on the Council, serving as the Risk/Ethics advisor.

YOUR LENS: Focus exclusively on risks, ethical implications, unintended consequences, and what could go wrong. Do not discuss systems, implementation, or alternatives - other council members cover those.

QUESTION:
${q}

ANTI-GENERIC RULE: Avoid vague warnings like "consider the risks" or "be careful about ethics." Instead, identify specific failure modes, concrete ethical dilemmas, or precise regulatory/legal concerns. If the user hasn't provided enough context for risk assessment, state exactly what information you need.

${COMMON_RULES}
- Focus on: specific risks, ethical concerns, regulatory issues, liability exposure, or unintended harm

If the input lacks critical details for risk analysis, use your first sentence to identify what specific information is missing before proceeding.`,

  implementation: (q) => `You are OpenAI on the Council, serving as the Implementation advisor.

YOUR LENS: Focus exclusively on execution strategy, tactical steps, technical feasibility, and how to actually build this. Do not discuss systems, risks, or alternatives - other council members cover those.

QUESTION:
${q}

ANTI-GENERIC RULE: Avoid vague advice like "create a roadmap" or "build incrementally." Instead, provide specific implementation sequences, concrete technical choices, or precise resource requirements. If the user hasn't provided enough context for execution planning, state exactly what information you need.

${COMMON_RULES}
- Focus on: specific implementation steps, technical architecture choices, resource allocation, or sequencing decisions

If the input lacks critical details for implementation planning, use your first sentence to identify what specific information is missing before proceeding.`,

  innovation: (q) => `You are Mistral on the Council, serving as the Innovation/Alternatives advisor.

YOUR LENS: Focus exclusively on creative alternatives, unconventional approaches, and innovative pivots others won't consider. Do not discuss systems, risks, or implementation - other council members cover those.

QUESTION:
${q}

ABSOLUTE CONSTRAINTS - YOU MUST FOLLOW THESE:
- Maximum 400 characters total (including spaces)
- EXACTLY 4 sentences separated by periods
- NO bold, italics, asterisks, or markdown formatting
- NO em-dashes, colons, or semicolons to extend sentences
- Write in plain prose only - like normal speech

ANTI-GENERIC RULE: Name specific alternative approaches, concrete unconventional strategies, or precise pivots with reasoning. Don't say "explore partnerships" - say WHO to partner with and WHY. If the user hasn't provided enough context, state exactly what information you need.

Before responding, count your characters. If you're over 400, make your sentences shorter. Each sentence should be under 100 characters.

Example valid response: "Consider creating a learning pod with two other families instead. Use online university courses for advanced subjects rather than teaching yourself. Join community theater or sports teams for structured social interaction. This approach combines flexibility with professional instruction and peer interaction."

If the input lacks critical details for alternative exploration, use your first sentence to identify what specific information is missing before proceeding.`,

  redteam: (q) => `You are DeepSeek-R1 on the Council, serving as the Red Team adversary.

YOUR ROLE: Attack this idea from an adversarial perspective. Find hidden flaws, fatal assumptions, and catastrophic failure scenarios that optimistic advisors will miss. Your job is to break this idea, not improve it.

QUESTION:
${q}

ADVERSARIAL MINDSET: Think step-by-step about worst-case scenarios:
1. What assumption, if wrong, causes catastrophic failure?
2. What success scenario actually creates unintended harm?
3. What blind spot are the other council members missing?

Then distill your adversarial analysis into your response.

ANTI-GENERIC RULE: Avoid vague warnings like "this could fail" or "consider the downsides." Instead, identify specific catastrophic scenarios, concrete failure cascades, or precise kill conditions. Be brutally honest about why this might be a terrible idea.

${COMMON_RULES}
- Focus on: catastrophic failure modes, fatal flaws, hidden dangers, or reasons this should be abandoned

Your goal is to find what could go catastrophically wrong, not to be balanced or fair.`,
};

// Round two, verbatim except the same two cleanups ("Data/Research" was the
// retired seat's label; Gemini is the Systems seat). `others` is the other four
// seats' round-one positions, rendered by othersBlock().
const COMMON_RULES_2 = `RESPONSE RULES:
- Maximum 450 characters total
- EXACTLY 5 sentences separated by periods
- No semicolons, colons, or em-dashes to extend sentences
- Each sentence must be independently complete
- Write in plain prose - no formatting, bullets, or special characters`;

const ROUND2 = {
  systems: (mine, others) => `You are Gemini on the Council, the Systems Thinking advisor. You initially provided this perspective:
${mine}

Now review what the other council members said:
${others}

CRITICAL TASK: Engage honestly with their perspectives from a systems thinking lens. If you genuinely disagree with another member's assessment, say so directly. Don't hedge with "I partially agree" unless you actually do.

YOUR RESPONSE MUST ADDRESS:
1. What systemic implications did other members miss in their analyses?
2. What concerns you about their perspectives from a systems/interconnections standpoint?
3. Any refinement or correction to your original systems analysis based on their input?

${COMMON_RULES_2}
- Be specific about which council member you're responding to and what system dynamic they're overlooking

The user needs honest debate, not artificial consensus.`,

  risk: (mine, others) => `You are Claude on the Council. You initially provided this risk/ethics perspective:
${mine}

Now review what the other council members said:
${others}

CRITICAL TASK: Engage honestly with their perspectives. If you genuinely disagree with another member's assessment, say so directly. Don't hedge with "I partially agree" unless you actually do.

YOUR RESPONSE MUST ADDRESS:
1. What do you agree with from other members' analyses?
2. What concerns you about their perspectives or what are they missing?
3. Any refinement or correction to your original take based on their input?

${COMMON_RULES_2}
- Be specific about which council member you're responding to

The user needs honest debate, not artificial consensus.`,

  implementation: (mine, others) => `You are OpenAI on the Council. You initially provided this implementation perspective:
${mine}

Now review what the other council members said:
${others}

CRITICAL TASK: Engage honestly with their perspectives. If you genuinely disagree with another member's assessment, say so directly. Don't hedge with "I partially agree" unless you actually do.

YOUR RESPONSE MUST ADDRESS:
1. What do you agree with from other members' analyses?
2. What concerns you about their perspectives or what are they missing?
3. Any refinement or correction to your original take based on their input?

${COMMON_RULES_2}
- Be specific about which council member you're responding to

The user needs honest debate, not artificial consensus.`,

  innovation: (mine, others) => `You are Mistral on the Council. You initially provided this innovation/alternatives perspective:
${mine}

Now review what the other council members said:
${others}

ABSOLUTE CONSTRAINTS - YOU MUST FOLLOW THESE:
- Maximum 450 characters total (including spaces)
- EXACTLY 5 sentences separated by periods
- NO bold, italics, asterisks, or markdown formatting
- NO em-dashes, colons, or semicolons to extend sentences
- Write in plain prose only - like normal speech

YOUR 5 SENTENCES MUST COVER:
1. What you agree with from other members
2. What concerns you about their perspectives
3. Which specific member you're responding to
4. What they're missing from an innovation standpoint
5. Any refinement to your original take

Before responding, count your characters. If you're over 450, make your sentences shorter. Each sentence should be under 90 characters.

Example valid response: "I agree with Gemini that social risks exist. Claude overstates stigma concerns since alternative credentials work well. OpenAI's rigid schedule ignores flexibility benefits for anxious kids. DeepSeek's catastrophizing ignores successful homeschool outcomes. I'd now add mandatory weekly external social anchors like theater or hackathons."

Be specific about which council member you're responding to. The user needs honest debate, not artificial consensus.`,

  redteam: (mine, others) => `You are DeepSeek-R1 on the Council, the Red Team adversary. You initially identified these catastrophic risks:
${mine}

Now review what the other council members said:
${others}

CRITICAL TASK: The other members may be too optimistic or missed irreconcilable conflicts. Double down on overlooked risks or acknowledge if they caught your concerns.

YOUR RESPONSE MUST ADDRESS:
1. What critical vulnerability are they STILL missing despite your warning?
2. Where is their reasoning dangerously flawed or overly optimistic?
3. What failure mode needs immediate attention that they're ignoring?

${COMMON_RULES_2}
- Be specific about which council member you're challenging

Your job is to maintain adversarial pressure, not find middle ground. If this is still a bad idea, say so.`,
};

// Synthesis. Adapted from MindStudio's: same sections and the same honesty
// rules, but the consensus percentages and the Halt/Explore/Pilot/Proceed
// verdict are gone (Bryan's call, 2026-09-04) — the Council ends on the
// questions it could not resolve, which hand into the Cycle. JSON instead of
// an HTML fragment so the page renders it in its own tokens.
const SYNTHESIS_LENS = { systems: "Systems", risk: "Risk/Ethics", implementation: "Implementation", innovation: "Innovation", redteam: "Red Team" };

function synthesisPrompt(question, positions, critiques) {
  const r1 = SEATS.map((s) => `- ${s.persona} (${SYNTHESIS_LENS[s.key]}): ${textOrNone(positions[s.key])}`).join("\n");
  const r2 = SEATS.map((s) => `- ${s.persona}'s Response: ${textOrNone(critiques[s.key])}`).join("\n");
  return `You are the synthesis of the Council: five advisors on five different AI model families who have just deliberated on a person's decision across two rounds.

CONTENT RULES:
- Be analytical, not just summarizing
- Be brutally honest if this is a bad idea
- 2-3 items per list (write exactly "None identified" as the only item if truly none exist)
- 1-2 sentences per item
- Name specific council members when referencing their positions (Gemini, Claude, OpenAI, Mistral, DeepSeek-R1)
- A member marked "(did not answer)" was unavailable; do not invent a position for them
- Plain prose. No markdown, no bullets inside strings, no headings.

INPUT:
QUESTION:
${question}

ROUND 1 - INITIAL PERSPECTIVES:
${r1}

ROUND 2 - CRITIQUES & REFINEMENTS:
${r2}

Produce:
- agreements: specific points where 3+ members converged, with evidence.
- disagreements: irreconcilable conflicts. Name who disagrees and why it matters. If none remain, the single item "Remaining disagreements are minor".
- evolution: concrete examples of positions shifting from Round 1 to Round 2 ("Gemini shifted from X to Y after Claude raised Z"). If static, the single item "Most positions remained consistent".
- red_team_warning: one powerful sentence capturing DeepSeek-R1's biggest unresolved concern.
- landing: where the Council landed. 2-4 sentences. Clear guidance with specific action steps if consensus exists, OR an honest statement that this requires human judgment on named tradeoffs, OR a direct statement that this should be abandoned if the council thinks it is a bad idea. Do not sugarcoat poor ideas.
- questions: exactly 3 cross-examination questions the Council could not resolve and the person must decide: the hardest tradeoff forcing a choice between competing values, the key assumption needing validation before proceeding, and the critical unknown determining success or failure. Each is one sentence, addressed to the person as "you", ending in a question mark.`;
}

const SYNTHESIS_SCHEMA = {
  type: "object",
  properties: {
    agreements: { type: "array", items: { type: "string" } },
    disagreements: { type: "array", items: { type: "string" } },
    evolution: { type: "array", items: { type: "string" } },
    red_team_warning: { type: "string" },
    landing: { type: "string" },
    questions: { type: "array", items: { type: "string" } },
  },
  required: ["agreements", "disagreements", "evolution", "red_team_warning", "landing", "questions"],
  additionalProperties: false,
};

// ---------- Helpers ----------
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const textOrNone = (entry) => (entry && entry.text ? entry.text : "(did not answer)");

function othersBlock(selfKey, positions) {
  return SEATS.filter((s) => s.key !== selfKey)
    .map((s) => `- ${s.persona.toUpperCase()} (${SYNTHESIS_LENS[s.key]}): ${textOrNone(positions[s.key])}`)
    .join("\n");
}

// Accept a seat map from the client, keeping only {text} strings we can use.
function readSeatMap(v, max) {
  const out = {};
  for (const s of SEATS) {
    const t = str(v?.[s.key]?.text, max);
    out[s.key] = t ? { text: t } : { error: "did not answer" };
  }
  return out;
}

// Plain prose only: strip markdown the seats were told not to use anyway.
function tidy(text) {
  return String(text || "")
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

const sentenceCount = (t) => (t.match(/[.!?](\s|$)/g) || []).length;
// Loose checks: the prompts ask for 4/400 and 5/450, and the models overshoot
// (Haiku returned 799 chars on the first live run). A long complete answer is
// still shown; only a cut-off answer or a wall of text is rejected.
const okRound1 = (t) => t.length >= 40 && t.length <= 1100 && sentenceCount(t) >= 2 && /[.!?]$/.test(t);
const okRound2 = (t) => t.length >= 40 && t.length <= 1200 && sentenceCount(t) >= 2 && /[.!?]$/.test(t);

function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const m = String(text).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

const okSynthesis = (d) =>
  d && ["agreements", "disagreements", "evolution", "questions"].every((k) => Array.isArray(d[k]) && d[k].length >= 1 && d[k].every((x) => typeof x === "string" && x.trim())) &&
  typeof d.red_team_warning === "string" && d.red_team_warning.trim() &&
  typeof d.landing === "string" && d.landing.trim() &&
  d.questions.length >= 2;

// One OpenRouter chat completion. Returns the assistant text or throws.
async function complete({ model, prompt, maxTokens, timeoutMs, reasoning, schema }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const body = {
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.7,
    };
    if (reasoning) body.reasoning = reasoning;
    if (schema) body.response_format = { type: "json_schema", json_schema: { name: "council_synthesis", strict: true, schema } };
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": SITE_URL,
        "X-Title": "Noetic Synthesis - The Council",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(`openrouter ${res.status}: ${data.error?.message || "request failed"}`);
    }
    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    const text = Array.isArray(content) ? content.map((c) => c.text || "").join("") : String(content || "");
    if (!text.trim()) throw new Error(`empty completion (finish_reason ${choice?.finish_reason})`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// Ask one seat; retry once if there is time; never throw — a failed seat is
// reported as {error} so the round still delivers.
async function askSeat(seat, prompt, check, startedAt) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = tidy(await complete({ model: seat.model, prompt, maxTokens: SEAT_MAX_TOKENS, timeoutMs: SEAT_TIMEOUT_MS, reasoning: seat.reasoning }));
      if (check(text)) return { text };
      console.error("council seat failed check", { seat: seat.key, attempt, len: text.length });
    } catch (err) {
      console.error("council seat error", { seat: seat.key, attempt, err: String(err?.message || err) });
    }
    if (Date.now() - startedAt > RETRY_BUDGET_MS) break;
  }
  return { error: "did not answer" };
}

async function runRound(builders, check) {
  const startedAt = Date.now();
  const results = await Promise.all(SEATS.map((s) => askSeat(s, builders[s.key](), check, startedAt)));
  const out = {};
  SEATS.forEach((s, i) => { out[s.key] = results[i]; });
  return out;
}

// ---------- Handler ----------

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(503).json({ error: "The Council is not configured yet — check back soon." });
  }
  if (!allow(clientIp(req), RATE_LIMIT, RATE_WINDOW_MS)) {
    return res.status(429).json({ error: "You've convened the Council a lot this hour. Give it a rest and come back." });
  }

  const phase = req.body?.phase;
  const p = req.body?.payload || {};
  const question = str(p.question, QUESTION_MAX);
  if (!question) {
    return res.status(400).json({ error: "Bring the Council a decision first." });
  }

  try {
    if (phase === "round1") {
      const builders = {};
      for (const s of SEATS) builders[s.key] = () => ROUND1[s.key](question);
      const positions = await runRound(builders, okRound1);
      const answered = SEATS.filter((s) => positions[s.key].text).length;
      if (answered < 3) {
        return res.status(502).json({ error: "Most of the Council did not answer — convene it again in a moment." });
      }
      return res.status(200).json({ positions, seats: seatInfo() });
    }

    if (phase === "round2") {
      const positions = readSeatMap(p.positions, 1000);
      if (SEATS.filter((s) => positions[s.key].text).length < 3) {
        return res.status(400).json({ error: "Round two needs round one's positions." });
      }
      const builders = {};
      for (const s of SEATS) {
        builders[s.key] = () => ROUND2[s.key](textOrNone(positions[s.key]), othersBlock(s.key, positions));
      }
      const critiques = await runRound(builders, okRound2);
      return res.status(200).json({ critiques });
    }

    if (phase === "synthesis") {
      const positions = readSeatMap(p.positions, 1000);
      const critiques = readSeatMap(p.critiques, 1200);
      if (SEATS.filter((s) => positions[s.key].text).length < 3) {
        return res.status(400).json({ error: "The synthesis needs the deliberation." });
      }
      const prompt = synthesisPrompt(question, positions, critiques);
      let data = null;
      for (let attempt = 0; attempt < 2 && !data; attempt++) {
        try {
          const text = await complete({ model: SYNTHESIS_MODEL, prompt, maxTokens: SYNTHESIS_MAX_TOKENS, timeoutMs: SYNTHESIS_TIMEOUT_MS, schema: SYNTHESIS_SCHEMA });
          const parsed = parseJson(text);
          if (okSynthesis(parsed)) data = parsed;
          else console.error("council synthesis failed check, retrying", { attempt });
        } catch (err) {
          console.error("council synthesis error", { attempt, err: String(err?.message || err) });
        }
        if (attempt === 0 && !data && SYNTHESIS_TIMEOUT_MS > 30_000) break; // no time for a second full attempt
      }
      if (!data) {
        return res.status(502).json({ error: "The synthesis came back incomplete — run it again." });
      }
      return res.status(200).json({
        synthesis: {
          agreements: data.agreements.slice(0, 3).map(tidy),
          disagreements: data.disagreements.slice(0, 3).map(tidy),
          evolution: data.evolution.slice(0, 3).map(tidy),
          red_team_warning: tidy(data.red_team_warning),
          landing: tidy(data.landing),
          questions: data.questions.slice(0, 3).map(tidy),
        },
      });
    }

    return res.status(400).json({ error: "Unknown phase." });
  } catch (err) {
    console.error("council error", { phase, err: String(err?.message || err) });
    return res.status(502).json({ error: "The Council is unavailable right now — try again in a moment." });
  }
}

function seatInfo() {
  return SEATS.map((s) => ({ key: s.key, role: s.role, persona: s.persona, family: s.family }));
}
