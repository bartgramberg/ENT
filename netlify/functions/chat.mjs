/**
 * netlify/functions/chat.js
 * Stateless proxy to the Anthropic API for the ENT public demo.
 *
 * Accepts POST with JSON body:
 *   { password, messages, system }
 *
 * Returns:
 *   200 { stem, overwegingen, usage }
 *   401 { error: "Ongeldig wachtwoord" }
 *   500 { error: "Server is not configured. Missing env var: <name>. See README." }
 *   503 { error: "<message>" }   — on Anthropic API failure
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL         = "claude-sonnet-4-20250514";
const MAX_TOKENS    = 700;

/**
 * Parse the [OVERWEGINGEN] block into structured title/body objects.
 * Mirrors parse_overwegingen() in src/server.py.
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
  // Only POST is supported
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check env vars first — fail fast with a clear error
  const apiKey  = process.env.ANTHROPIC_API_KEY;
  const envPass = process.env.ENT_ACCESS_PASSWORD;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Server is not configured. Missing env var: ANTHROPIC_API_KEY. See README." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  if (!envPass) {
    return new Response(
      JSON.stringify({ error: "Server is not configured. Missing env var: ENT_ACCESS_PASSWORD. See README." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Parse body
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { password, messages, system } = body;

  // Verify password
  if (!password || password !== envPass) {
    return new Response(JSON.stringify({ error: "Ongeldig wachtwoord" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validate messages
  if (!Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "messages must be an array" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Password ping (empty messages = auth check only)
  if (messages.length === 0) {
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Call Anthropic API
  const anthropicBody = {
    model:      MODEL,
    max_tokens: MAX_TOKENS,
    messages,
  };
  if (system) anthropicBody.system = system;

  let anthropicRes;
  try {
    anthropicRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: `Netwerkfout: ${err.message}` }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!anthropicRes.ok) {
    let detail = "";
    try {
      const errBody = await anthropicRes.json();
      detail = errBody?.error?.message || JSON.stringify(errBody);
    } catch {
      detail = await anthropicRes.text().catch(() => "");
    }
    return new Response(
      JSON.stringify({ error: `Anthropic API fout ${anthropicRes.status}: ${detail}` }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  let result;
  try {
    result = await anthropicRes.json();
  } catch {
    return new Response(JSON.stringify({ error: "Kon API-antwoord niet lezen" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fullText = result?.content?.[0]?.text || "";
  const usage    = result?.usage || { input_tokens: 0, output_tokens: 0 };

  let stem, overwegingen;
  if (fullText.includes("[OVERWEGINGEN]")) {
    const [stemPart, overwegingenPart] = fullText.split("[OVERWEGINGEN]", 2);
    stem         = stemPart.trim();
    overwegingen = parseOverwegingen(overwegingenPart.trim());
  } else {
    stem         = fullText.trim();
    overwegingen = [];
  }

  return new Response(
    JSON.stringify({ stem, overwegingen, usage }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
