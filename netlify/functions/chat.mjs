/**
 * netlify/functions/chat.mjs
 * Stateless proxy to the Anthropic API for the ENT public demo.
 *
 * Accepts POST with JSON body:
 *   { password, messages, config, opening?, deel?, stem? }
 *
 * With `opening: true` the function writes ENT's first turn from the intake
 * alone; `messages` is ignored and the reply has no overwegingen.
 *
 * A normal turn is two calls, so the spoken text is on screen in half the
 * time: `deel: "stem"` returns only the stem (max_tokens from the word limit);
 * `deel: "overwegingen"` with the stem it just got returns only the analist's
 * items. Without `deel` it does both in one call (the old single-shot).
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

import { compose, STEM_INSTRUCTIE, OVERWEGINGEN_INSTRUCTIE, OVERWEGINGEN_VRAAG } from "./lib/compose.mjs";
import { markeerToetsen, zonderMeta } from "./lib/toetsen.mjs";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";

// Promptlogboek: het meetinstrument voor prompt-wijzigingen. Schrijft per beurt
// één markdown-bestand met de complete systeemprompt, de berichten en het
// antwoord, plus een regel in index.log (duur, tokens, cache). Alleen actief
// als ENT_PROMPT_LOG een map aanwijst: `ENT_PROMPT_LOG=<map> ./scripts/dev.sh`.
// In productie staat de variabele niet en gebeurt er niets.
const LOG_DIR = (process.env.ENT_PROMPT_LOG || "").trim();
const KNIP = (s, n = 400) => (s && s.length > n ? s.slice(0, n) + `…[+${s.length - n} tekens]` : s || "");

async function logBeurt(entry) {
  if (!LOG_DIR) return;
  try {
    await mkdir(LOG_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const c = entry.config || {};
    const docs = Array.isArray(c.documents) ? c.documents : [];
    const L = [];
    L.push(`# ${entry.kind} — ${new Date().toISOString()}`);
    L.push("");
    L.push("## Intake (config uit de browser)");
    L.push("```json");
    L.push(JSON.stringify({
      voice_subject: c.voice_subject, lang: c.lang, user_role: c.user_role, user_role_other: c.user_role_other,
      audience_mode: c.audience_mode, audience_type: c.audience_type, audience_details: c.audience_details,
      purpose: c.purpose, purpose_other: c.purpose_other, location: c.location, location_id: c.location_id,
      situation: c.situation,
      documents: docs.map(d => ({ filename: d.filename, tekens: (d.text || "").length })),
      systeemprofiel_aanwezig: !!c.systeemprofiel,
    }, null, 2));
    L.push("```");
    if (c.systeemprofiel) {
      L.push("## Systeemprofiel (ruwe JSON uit /api/analyse)");
      L.push("```json");
      L.push(JSON.stringify(c.systeemprofiel, null, 2));
      L.push("```");
    }
    for (const [i, blok] of (entry.system || []).entries()) {
      L.push(`## Systeemblok ${i + 1} — ${blok.text.length} tekens${blok.cache_control ? " (cachebreekpunt)" : ""}`);
      L.push("```text");
      L.push(blok.text);
      L.push("```");
    }
    L.push("## Messages (gespreksgeschiedenis naar de API)");
    L.push("```json");
    L.push(JSON.stringify(entry.messages, null, 2));
    L.push("```");
    L.push("## Antwoord");
    L.push("```json");
    L.push(JSON.stringify({ stop_reason: entry.stop_reason, usage: entry.usage, duur_ms: entry.duur_ms }, null, 2));
    L.push("```");
    L.push("### Stem");
    L.push(entry.stem || "(leeg)");
    L.push("### Overwegingen");
    L.push(JSON.stringify(entry.overwegingen, null, 2));
    const bestand = path.join(LOG_DIR, `${stamp}-${entry.kind}.md`);
    await writeFile(bestand, L.join("\n"), "utf8");
    // Bij de opening het complete sessie-object ernaast, zodat een handmatige
    // test meteen een fixture kan worden (eval/fixtures/). Alleen lokaal.
    if (entry.kind === "opening") {
      await writeFile(path.join(LOG_DIR, `${stamp}-config.json`), JSON.stringify(entry.config || {}, null, 1), "utf8");
    }
    const u = entry.usage || {};
    await appendFile(path.join(LOG_DIR, "index.log"),
      `${new Date().toISOString()} ${entry.kind} ${entry.duur_ms}ms in=${u.input_tokens} out=${u.output_tokens} ` +
      `cache_w=${u.cache_creation_input_tokens || 0} cache_r=${u.cache_read_input_tokens || 0} ` +
      `systeem=${(entry.system || []).reduce((n, b) => n + b.text.length, 0)}t beurten=${entry.messages.length} ` +
      `→ ${path.basename(bestand)}\n   vraag: ${KNIP(entry.messages[entry.messages.length - 1]?.content, 120)}\n`, "utf8");
  } catch (err) {
    console.error("promptlog faalde:", err);
  }
}

// ENT_MODEL/ENT_EFFORT alleen voor metingen (scripts/eval.sh); productie
// draait op de standaard. Op Opus 5.5 kan thinking niet uit; daar regelt
// effort de denkdiepte.
const MODEL      = (process.env.ENT_MODEL || "claude-sonnet-5").trim();
const EFFORT     = (process.env.ENT_EFFORT || "").trim();
const THINKING_UIT = !/^claude-(opus-5-5|fable|mythos)/.test(MODEL);
const MAX_TOKENS = 1024;
const OPENING_MAX_TOKENS = 400;
const OVERWEGINGEN_MAX_TOKENS = 800; // hooguit vier items
// Nederlands tokeniseert op Sonnet 5 rond 2,2 tekens/token ≈ 2,5 tokens/woord;
// ruim nemen, want afkappen kost de marker of het einde van de zin.
const tokensVoorWoorden = (w) => Math.ceil(w * 3.2) + 60;

// The conversation starts with ENT's opening, but the API expects a user turn
// first. This stands in for it — in the opening call and in front of every
// later history — so the model sees the same start each time.
// Plain words, no brackets: the model copies the form of what it is given.
const OPENING_SIGNAL = "Het gesprek begint.";

// De datum van vandaag, ná de cachebreekpunten (de blokken blijven gelijk). In de
// Ceuvel-test van 1 oktober sprak de boom van "kale takken" en rekende hij
// "twaalf jaar geleden" verkeerd: zonder datum weet het model niet wanneer nu is.
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const SEIZOEN = ["winter", "winter", "lente", "lente", "lente", "zomer", "zomer", "zomer", "herfst", "herfst", "herfst", "winter"];
function vandaag() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Amsterdam" }));
  return `Vandaag is het ${d.getDate()} ${MAANDEN[d.getMonth()]} ${d.getFullYear()} (${SEIZOEN[d.getMonth()]}).`;
}

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
    // Laatste regel 'Herkomst: …' apart, zodat de UI hem als label kan tonen.
    let herkomst = "";
    if (lines.length >= 2 && /^herkomst\s*:/i.test(lines[lines.length - 1])) {
      herkomst = lines.pop().replace(/^herkomst\s*:\s*/i, "").trim();
    }
    // Eén regel is geen overweging (titel + zin + herkomst is de vorm). De oude
    // terugvalregel is weg; wat nu nog als één regel komt, is uitleg waarom er
    // niets te zeggen is ("er lag geen inhoudelijke vraag…"). Weglaten.
    if (lines.length >= 2) {
      blocks.push({ title: lines[0], body: lines.slice(1).join(" "), herkomst });
    }
  }
  // Leeg mag: geen overwegingen is een geldig antwoord (geen stub met een
  // ecologische titel bij een vraag over mobiliteit).
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

  const { password, messages, config, opening, deel, stem: vorigeStem, tellen } = body;
  const isOpening = opening === true;
  const alleenStem = deel === "stem";
  const alleenOverwegingen = deel === "overwegingen";
  if (alleenOverwegingen && typeof vorigeStem !== "string") {
    return json({ error: "deel 'overwegingen' vereist de stem" }, 400);
  }

  // Verify password
  if (!password || password !== envPass) {
    return json({ error: "Ongeldig wachtwoord" }, 401);
  }

  // Validate messages
  if (!Array.isArray(messages)) {
    return json({ error: "messages must be an array" }, 400);
  }
  // De browser bewaart per beurt meer dan role/content (overwegingen,
  // promptversie); de API weigert onbekende velden. Alleen die twee gaan door.
  for (const m of messages) for (const k of Object.keys(m || {})) if (k !== "role" && k !== "content") delete m[k];

  // Tokens tellen van de samengestelde prompt (voor de meter in de onboarding).
  if (tellen === true) {
    try {
      const c = await compose(config || {});
      const res = await fetch(anthropicUrl().replace(/\/messages$/, "/messages/count_tokens"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: MODEL, system: c.blokken.map((b) => ({ type: "text", text: b.tekst })), messages: [{ role: "user", content: OPENING_SIGNAL }] }),
      });
      const d = await res.json();
      if (!res.ok) return json({ error: d?.error?.message || "tellen mislukt" }, 503);
      return json({ tokens: d.input_tokens, tekens: c.blokken.reduce((n, b) => n + b.tekst.length, 0), promptversie: c.promptversie, max_woorden: c.max_woorden, persoon: c.persoon, eigen_max: c.eigen_max });
    } catch (err) {
      console.error("tellen:", err);
      return json({ error: "Kon de prompt niet tellen." }, 500);
    }
  }

  // Password ping (empty messages = auth check only) — no compose needed
  if (messages.length === 0 && !isOpening) {
    return json({ status: "ok" });
  }

  // Compose the system prompt server-side: één cachebreekpunt per blok
  // (basis+personage, profiel, sessie), bewaartijd een uur — in een
  // gefaciliteerde sessie zit er makkelijk meer dan vijf minuten tussen twee
  // vragen. Wat per aanroep wisselt (opening, 'nu de stem') komt ná het
  // laatste breekpunt, zodat de blokken byte-identiek blijven.
  let system, composed;
  try {
    composed = await compose(config || {}, { opening: isOpening });
    system = composed.blokken.map((b) => ({ type: "text", text: b.tekst, cache_control: { type: "ephemeral", ttl: "1h" } }));
    if (composed.opening) system.push({ type: "text", text: vandaag() + "\n\n" + composed.opening });
    else if (alleenStem) system.push({ type: "text", text: vandaag() + "\n\n" + STEM_INSTRUCTIE });
    else if (alleenOverwegingen) system.push({ type: "text", text: vandaag() + "\n\n" + OVERWEGINGEN_INSTRUCTIE });
  } catch (err) {
    console.error("compose error:", err);
    return json({ error: "Kon de systeemprompt niet samenstellen." }, 500);
  }

  let apiMessages;
  if (isOpening) {
    apiMessages = [{ role: "user", content: OPENING_SIGNAL }];
  } else if (messages[0]?.role === "assistant") {
    apiMessages = [{ role: "user", content: OPENING_SIGNAL }, ...messages];
  } else {
    apiMessages = messages;
  }
  if (alleenOverwegingen) {
    apiMessages = [...apiMessages, { role: "assistant", content: vorigeStem || "…" }, { role: "user", content: OVERWEGINGEN_VRAAG }];
  }

  const maxTokens = isOpening ? OPENING_MAX_TOKENS
    : alleenStem ? tokensVoorWoorden(composed.max_woorden)
    : alleenOverwegingen ? OVERWEGINGEN_MAX_TOKENS
    : MAX_TOKENS;

  // Call Anthropic API
  const anthropicBody = {
    model:      MODEL,
    max_tokens: maxTokens,
    messages:   apiMessages,
  };
  // Sonnet 5: thinking uit voor de snelle single-shot. Modellen die thinking
  // niet kunnen uitzetten krijgen alleen een effort-niveau.
  if (THINKING_UIT) anthropicBody.thinking = { type: "disabled" };
  // Stem-aanroep: het model begint na de stem soms tóch aan de marker en de
  // overwegingen, tot max_tokens (gemeten: 7 van 20 beurten, 600-800 tokens).
  // De stopsequentie kapt precies daar af; de stem is dan compleet.
  if (alleenStem || isOpening) anthropicBody.stop_sequences = ["[OVERWEGINGEN]"];
  if (EFFORT) anthropicBody.output_config = { effort: EFFORT };
  if (system.length) anthropicBody.system = system;

  const t0 = Date.now();
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
    return json({ error: `ENT is even niet bereikbaar (${anthropicRes.status}). Probeer het zo opnieuw.` }, 503);
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
  if (alleenOverwegingen) {
    // Alles is analist; een marker die het model toch zet, negeren we.
    stem         = "";
    overwegingen = parseOverwegingen(fullText.replace(markerRe, "").trim());
  } else if (alleenStem) {
    // Alles vóór een eventuele marker is de stem; wat erna komt hoort hier niet.
    stem         = (m ? fullText.slice(0, m.index) : fullText).trim();
    overwegingen = [];
  } else if (m) {
    stem         = fullText.slice(0, m.index).trim();
    // The opening is asked for without overwegingen; drop any the model adds anyway.
    overwegingen = isOpening ? [] : parseOverwegingen(fullText.slice(m.index + m[0].length).trim());
  } else {
    // No marker on its own line — either the model skipped it, or the reply was
    // cut off at max_tokens before reaching it. Return what we have.
    stem         = fullText.trim();
    overwegingen = [];
  }
  // Defensive: strip any stray inline marker mentions left in the stem so the
  // literal token never surfaces in the chat bubble. Regels die met een
  // blokhaak beginnen zijn regieaanwijzingen of overgenomen labels: weg.
  stem = stem.replace(/\[OVERWEGINGEN\]/g, "").split("\n").filter((r) => !/^\s*\[/.test(r)).join("\n").trim();
  // Badge "te toetsen": een item van buiten het materiaal met een getal, soort,
  // jaartal, regel of termijn erin (deterministisch, zie lib/toetsen.mjs).
  markeerToetsen(overwegingen, config || {});
  // Vangnet tegen overwegingen over het gesprek zelf (toon, reactie, afscheid).
  const metaWeg = overwegingen.length;
  overwegingen = zonderMeta(overwegingen);
  const meta_weggefilterd = metaWeg - overwegingen.length;

  await logBeurt({
    kind: isOpening ? "opening" : alleenStem ? "stem" : alleenOverwegingen ? "overwegingen" : "beurt",
    config, system, messages: apiMessages,
    stem, overwegingen, usage, stop_reason: stopReason, duur_ms: Date.now() - t0,
  });

  return json({ stem, overwegingen, meta_weggefilterd, usage, stop_reason: stopReason, promptversie: composed.promptversie, max_woorden: composed.max_woorden, eigen_max: composed.eigen_max });
}
