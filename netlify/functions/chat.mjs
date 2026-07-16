/**
 * netlify/functions/chat.mjs
 * Stateless proxy to the Anthropic API for the ENT public demo.
 *
 * Accepts POST with JSON body:
 *   { password, messages, config }
 *
 * The system prompt is composed server-side from `config` (see lib/compose.mjs)
 * so the knowledge layer and the full prompt are never shipped to the browser,
 * and the stable prefix can be prompt-cached across sessions.
 *
 * Returns:
 *   200 { stem, overwegingen, usage, stop_reason }
 *   401 { error: "Ongeldig wachtwoord" }
 *   500 { error: "Server is not configured. Missing env var: <name>. See README." }
 *   503 { error: "<message>" }   — on Anthropic API failure
 */

import { compose } from "./lib/compose.mjs";

const MODEL      = "claude-sonnet-5";
const MAX_TOKENS = 1024;

// Honour a provider base URL if one is injected (e.g. Netlify AI Gateway sets
// ANTHROPIC_BASE_URL + a gateway-scoped ANTHROPIC_API_KEY). Otherwise call the
// Anthropic API directly.
function anthropicUrl() {
  const base = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "");
  return `${base}/v1/messages`;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/**
 * Parse the [OVERWEGINGEN] block into structured title/body objects.
 */
function parseOverwegingen(raw) {
  const blocks = [];
  const paragraphs = raw.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  for (const para of paragraphs) {
    const lines = para.split(/\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      blocks.push({ title: lines[0], body: lines.slice(1).join(" ") });
    } else if (lines.length === 1) {
      blocks.push({ title: lines[0], body: lines[0] });
    }
  }
  if (blocks.length === 0) {
    blocks.push({ title: "Ecologische afweging", body: raw });
  }
  return blocks;
}

export default async function handler(req, context) {
  // Preflight — the frontend is same-origin, but answer OPTIONS cleanly.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Check env vars first — fail fast with a clear error.
  // Trim to defend against a trailing newline/space in the stored value
  // (a common paste artifact that yields "invalid x-api-key").
  const apiKey  = (process.env.ANTHROPIC_API_KEY  || "").trim();
  const envPass = (process.env.ENT_ACCESS_PASSWORD || "").trim();
  if (!apiKey) {
    return json({ error: "Server is not configured. Missing env var: ANTHROPIC_API_KEY. See README." }, 500);
  }
  if (!envPass) {
    return json({ error: "Server is not configured. Missing env var: ENT_ACCESS_PASSWORD. See README." }, 500);
  }

  // Parse body
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { password, messages, config } = body;

  // Verify password
  if (!password || password !== envPass) {
    return json({ error: "Ongeldig wachtwoord" }, 401);
  }

  // Validate messages
  if (!Array.isArray(messages)) {
    return json({ error: "messages must be an array" }, 400);
  }

  // Password ping (empty messages = auth check only) — no compose needed
  if (messages.length === 0) {
    return json({ status: "ok" });
  }

  // Compose the system prompt server-side. Two cache breakpoints:
  //  - stable prefix (voice + knowledge) is byte-identical across sessions
  //  - session block is stable within one conversation (cached across turns)
  let system;
  try {
    const { stable, session } = await compose(config || {});
    system = [];
    if (stable)  system.push({ type: "text", text: stable,  cache_control: { type: "ephemeral" } });
    if (session) system.push({ type: "text", text: session, cache_control: { type: "ephemeral" } });
  } catch (err) {
    console.error("compose error:", err);
    return json({ error: "Kon de systeemprompt niet samenstellen." }, 500);
  }

  // Call Anthropic API
  const anthropicBody = {
    model:      MODEL,
    max_tokens: MAX_TOKENS,
    thinking:   { type: "disabled" }, // keep the fast single-shot behaviour on Sonnet 5
    messages,
  };
  if (system.length) anthropicBody.system = system;

  let anthropicRes;
  try {
    anthropicRes = await fetch(anthropicUrl(), {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });
  } catch (err) {
    console.error("Anthropic network error:", err);
    return json({ error: "Netwerkfout bij het bereiken van de API. Probeer het opnieuw." }, 503);
  }

  if (!anthropicRes.ok) {
    // Log the upstream detail server-side; do not leak it to the client.
    let detail = "";
    try {
      const errBody = await anthropicRes.json();
      detail = errBody?.error?.message || JSON.stringify(errBody);
    } catch {
      detail = await anthropicRes.text().catch(() => "");
    }
    console.error(`Anthropic API ${anthropicRes.status}: ${detail}`);
    return json({ error: `De boom rust even (${anthropicRes.status}). Probeer het zo opnieuw.` }, 503);
  }

  let result;
  try {
    result = await anthropicRes.json();
  } catch {
    return json({ error: "Kon API-antwoord niet lezen" }, 503);
  }

  // Concatenate all text blocks (defensive — usually one).
  const fullText = Array.isArray(result?.content)
    ? result.content.filter(b => b?.type === "text").map(b => b.text).join("")
    : "";
  const usage      = result?.usage || { input_tokens: 0, output_tokens: 0 };
  const stopReason = result?.stop_reason || null;

  let stem, overwegingen;
  // Split on the marker only when it sits on its own line — the real contract
  // marker always does. A stray inline "[OVERWEGINGEN]" inside a sentence (e.g.
  // a meta-preamble) must not corrupt the split into an empty stem.
  const markerRe = /^[ \t]*\[OVERWEGINGEN\][ \t]*$/m;
  const m = markerRe.exec(fullText);
  if (m) {
    stem         = fullText.slice(0, m.index).trim();
    overwegingen = parseOverwegingen(fullText.slice(m.index + m[0].length).trim());
  } else {
    // No marker on its own line — either the model skipped it, or the reply was
    // cut off at max_tokens before reaching it. Return what we have.
    stem         = fullText.trim();
    overwegingen = [];
  }
  // Defensive: strip any stray inline marker mentions left in the stem so the
  // literal token never surfaces in the chat bubble.
  stem = stem.replace(/\[OVERWEGINGEN\]/g, "").trim();

  return json({ stem, overwegingen, usage, stop_reason: stopReason });
}
