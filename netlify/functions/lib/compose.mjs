/**
 * netlify/functions/lib/compose.mjs
 * Server-side ENT system-prompt assembly.
 *
 * Ported from the browser compose.js. Reads the modular markdown prompt files
 * from disk (bundled via `included_files` in netlify.toml) and returns two
 * strings so the caller can place a prompt-caching breakpoint between them:
 *
 *   stable  — identical across every session for a given voice (voice + the
 *             two-lens methodology). Cacheable prefix, shared across all users.
 *   session — everything specific to this intake (audience, purpose, location,
 *             situation, documents) plus the output parse contract (always last).
 *
 * Prompt-file layout:
 *   prompts/ent/identiteiten/{name}/       — one folder per identiteit:
 *       identiteit.json                    · manifest (label, blik)
 *       identity.md                        · wie deze identiteit is
 *       voice.md                           · spreekstijl van deze identiteit
 *   prompts/ent/core/{principes,grenzen,methodiek}.md — gedeeld "ENT-brein", geldt voor elke identiteit
 *   prompts/ent/audiences/{type}.md        — register tuning per audience type
 *   prompts/ent/purposes/{purpose}.md      — shape/format tuning per purpose
 *   prompts/ent/format/overwegingen.md     — technical parse contract (last in session)
 *   prompts/ent/opening/*.md               — only for the opening turn: basis + one route
 *                                            + one shape, returned as a separate block
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { formatSysteemprofiel } from "./systeemprofiel.mjs";

// Identiteiten with a complete folder — extend as new identiteiten are added.
const AVAILABLE_IDENTITIES = ["boom", "water"];
const DEFAULT_IDENTITY = "boom";

// Maps user_role (Q1) → audience prompt file (without .md)
const ROLE_TO_AUDIENCE = {
  designer:      "designers",
  ecologist:     "ecologists",
  civil_servant: "civil-servants",
  developer:     "developers",
  resident:      "residents",
  facilitator:   "mixed",
  researcher:    "mixed",
  other:         "mixed",
};

// Maps audience_type (Q2b) → audience prompt file (without .md)
const AUDIENCE_TYPE_TO_FILE = {
  residents:     "residents",
  professionals: "professionals",
  designers:     "designers",
  ecologists:    "ecologists",
  civil_servant: "civil-servants",
  developer:     "developers",
  mixed:         "mixed",
  children:      "children",
  other:         "mixed",
};

// Maps purpose (Q3) → purpose prompt file (without .md)
const PURPOSE_TO_FILE = {
  open:     "open",
  respond:  "respond",
  story:    "story",
  provoke:  "provoke",
  codesign: "codesign",
  closing:  "closing",
  explore:  "explore",
  other:    "explore",
};

// Purposes whose opening has its own shape; everything else gets the short form.
const OPENING_SHAPES = { open: "vorm-open", story: "vorm-story", closing: "vorm-closing" };

const MAX_DOC_CHARS = 8000; // combined project-document budget (raised in Fase 2a)

/**
 * Resolve the repo root so we can read the prompt files in both
 * `netlify dev` (cwd = repo root) and the bundled production runtime
 * (files copied via included_files). Picks the first candidate that has
 * the prompts directory.
 */
function resolveRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url)); // .../netlify/functions/lib
  const candidates = [
    process.cwd(),
    path.resolve(here, "../../.."), // repo root relative to this file
    path.resolve(here, "../.."),
    path.resolve(here, ".."),
  ];
  for (const base of candidates) {
    if (existsSync(path.join(base, "prompts", "ent", "identiteiten", "boom", "identity.md"))) return base;
  }
  return process.cwd();
}

const ROOT = resolveRoot();

/** Read a file under prompts/ent/, trimmed. Returns "" on any failure. */
async function readPrompt(relativePath) {
  try {
    const text = await readFile(path.join(ROOT, "prompts", "ent", relativePath), "utf8");
    return text.trim();
  } catch {
    return "";
  }
}

/**
 * Load an identiteit: identity, voice, and manifest.
 * Falls back to the default identiteit when the requested one has no folder.
 */
async function loadIdentity(name) {
  const id = AVAILABLE_IDENTITIES.includes(name) ? name : DEFAULT_IDENTITY;
  const [identity, voice, manifestRaw] = await Promise.all([
    readPrompt(`identiteiten/${id}/identity.md`),
    readPrompt(`identiteiten/${id}/voice.md`),
    readPrompt(`identiteiten/${id}/identiteit.json`),
  ]);
  let manifest = {};
  try { manifest = manifestRaw ? JSON.parse(manifestRaw) : {}; } catch { /* ignore malformed manifest */ }
  return { name: id, identity, voice, manifest };
}

/**
 * Pick what the opening starts from, in order of what the user most wants to
 * talk about: what they wrote under "wat speelt er", then the place, then who
 * they are and why they came. Decided here, not by the model, so it cannot
 * drift back to a generic welcome.
 */
function openingRoute(config) {
  if ((config.situation || "").trim()) return "situatie";
  if ((config.location || "").trim()) return config.systeemprofiel ? "plek" : "plek-zonder-data";
  return "doel";
}

/** Instruction block for the opening turn: basis + route + shape. */
async function composeOpening(config) {
  const shape = OPENING_SHAPES[PURPOSE_TO_FILE[config.purpose] || "explore"] || "vorm-kort";
  const blocks = await Promise.all([
    readPrompt("opening/basis.md"),
    readPrompt(`opening/${openingRoute(config)}.md`),
    readPrompt(`opening/${shape}.md`),
  ]);
  // Nothing else in the prompt says whether one person or a room is listening.
  blocks.push(config.audience_mode === "group"
    ? "## Aanspreekvorm\n\nEr luistert een publiek. Spreek het aan met \"jullie\"."
    : "## Aanspreekvorm\n\nEr praat één persoon met je, die voor zichzelf verkent. Spreek die aan met \"je\".");
  return blocks.filter(Boolean).join("\n\n");
}

/**
 * Assemble the ENT system prompt.
 * @param {Object} config — intake config from the client (same shape as before).
 * @param {Object} [opts]
 * @param {boolean} [opts.opening] — also return the opening instruction. It is a
 *   separate block so the session block stays byte-identical to later turns and
 *   its cache entry carries over.
 * @returns {Promise<{ stable: string, session: string, opening?: string }>}
 */
export async function compose(config = {}, { opening = false } = {}) {
  // ── Stable prefix (cacheable, identical across sessions for a given identiteit):
  //    identity + voice + shared core.
  const id = await loadIdentity(config.voice_subject || DEFAULT_IDENTITY);
  const [principes, grenzen, methodiek] = await Promise.all([
    readPrompt("core/principes.md"),
    readPrompt("core/grenzen.md"),
    readPrompt("core/methodiek.md"),
  ]);
  const stableParts = [];
  if (id.identity)     stableParts.push(id.identity);
  if (id.voice)        stableParts.push(id.voice);
  if (principes)       stableParts.push(principes);
  if (grenzen)         stableParts.push(grenzen);
  if (methodiek)       stableParts.push(methodiek);

  // De vaste kennislaag is per 24 sept 2026 uit de prompt (fase 1 van de herbouw):
  // 61% van de prompt was generieke naslag. Wat er stond staat in voorbeelden/kennis/
  // als startmateriaal voor het kennisprofiel.

  // ── Session-specific suffix
  const parts = [];

  // Audience tuning
  const audienceMode = config.audience_mode || "self";
  let audienceFile = "mixed";
  if (audienceMode === "self") {
    audienceFile = ROLE_TO_AUDIENCE[config.user_role || "other"] || "mixed";
  } else if (audienceMode === "group") {
    audienceFile = AUDIENCE_TYPE_TO_FILE[config.audience_type || "mixed"] || "mixed";
  }
  const audienceContent = await readPrompt(`audiences/${audienceFile}.md`);
  if (audienceContent) parts.push(`# Publiek\n\n${audienceContent}`);

  const details = (config.audience_details || "").trim();
  if (details) parts.push(`# Wie zit er in de zaal\n\n${details}`);

  // Purpose tuning
  const purpose = config.purpose || "explore";
  const purposeFile = PURPOSE_TO_FILE[purpose] || "explore";
  const purposeContent = await readPrompt(`purposes/${purposeFile}.md`);
  if (purposeContent) parts.push(`# Doel en vorm\n\n${purposeContent}`);

  // Session context
  const ctx = [`Taal / Language: ${config.lang || "nl"}`];
  // Postcode eruit: een boom praat niet in postcodes, en zodra het in de prompt
  // staat kan het model het napraten. De precisie zit in location_id, waarmee
  // /api/analyse exact geocodeert — niet in deze weergavetekst.
  const location = (config.location || "").replace(/\b\d{4}\s?[A-Z]{2}\b/g, "").replace(/\s{2,}/g, " ").replace(/\s+,/g, ",").trim();
  const situation = (config.situation || "").trim();
  if (location) ctx.push(`Locatie: ${location}`);
  if (situation) ctx.push(`Context: ${situation}`);
  parts.push("# Sessie context\n\n" + ctx.join("\n"));

  // Dynamisch hyperlokaal systeemprofiel (uit /api/analyse) — ná beleid, vóór
  // projectdocumenten. Identiteit bepaalt alleen vanwaar er gekeken wordt (blik).
  if (config.systeemprofiel) {
    const blik = id.manifest?.systeemprofiel?.blik;
    const profielTekst = formatSysteemprofiel(config.systeemprofiel, { blik });
    if (profielTekst) parts.push(profielTekst);
  }

  // Project documents (session-only)
  const documents = Array.isArray(config.documents) ? config.documents : [];
  if (documents.length > 0) {
    const total = documents.reduce((sum, d) => sum + (d.text || "").length, 0);
    const docParts = [
      "# Projectdocumenten\n\n" +
      "De volgende documenten zijn aangeleverd als projectcontext.\n" +
      "Gebruik ze om je antwoorden te verankeren in het specifieke project.\n" +
      "Verzin geen details die er niet in staan.",
    ];
    if (total > MAX_DOC_CHARS) {
      for (const doc of documents) {
        let text = doc.text || "";
        const share = total > 0 ? text.length / total : 0;
        const cap = Math.floor(MAX_DOC_CHARS * share);
        if (text.length > cap) text = text.slice(0, cap) + "\n[Tekst ingekort vanwege lengte]";
        docParts.push(`---\n[Bestand: ${doc.filename || "onbekend"}]\n${text}`);
      }
    } else {
      for (const doc of documents) {
        docParts.push(`---\n[Bestand: ${doc.filename || "onbekend"}]\n${doc.text || ""}`);
      }
    }
    parts.push(docParts.join("\n\n"));
  }

  // Output format / parse contract — always last
  const fmt = await readPrompt("format/overwegingen.md");
  if (fmt) parts.push(fmt);

  const result = {
    stable: stableParts.join("\n\n---\n\n"),
    session: parts.join("\n\n---\n\n"),
  };
  if (opening) result.opening = await composeOpening(config);
  return result;
}
