/**
 * netlify/functions/lib/compose.mjs
 * Server-side ENT system-prompt assembly.
 *
 * Ported from the browser compose.js. Reads the modular markdown prompt files
 * from disk (bundled via `included_files` in netlify.toml) and returns two
 * strings so the caller can place a prompt-caching breakpoint between them:
 *
 *   stable  — identical across every session for a given voice (voice + the
 *             two-lens methodology + the fixed knowledge layer). Cacheable
 *             prefix, shared across all users.
 *   session — everything specific to this intake (audience, purpose, location,
 *             situation, documents) plus the output parse contract (always last).
 *
 * Prompt-file layout:
 *   prompts/ent/identiteiten/{name}/       — one folder per identiteit:
 *       identiteit.json                    · manifest (label, domains, has_knowledge)
 *       identity.md                        · wie deze identiteit is
 *       voice.md                           · spreekstijl van deze identiteit
 *       knowledge.md                       · (optioneel) eigen kennis van deze identiteit
 *   prompts/ent/core/{principes,grenzen,methodiek}.md — gedeeld "ENT-brein", geldt voor elke identiteit
 *   prompts/ent/audiences/{type}.md        — register tuning per audience type
 *   prompts/ent/purposes/{purpose}.md      — shape/format tuning per purpose
 *   prompts/ent/format/overwegingen.md     — technical parse contract (always last)
 *   knowledge/*.md                         — fixed knowledge layer (added in Fase 1)
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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

const MAX_DOC_CHARS = 8000; // combined project-document budget (raised in Fase 2a)

/**
 * Resolve the repo root so we can read prompt/knowledge files in both
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
 * Load an identiteit: identity, voice, optional own knowledge, and manifest.
 * Falls back to the default identiteit when the requested one has no folder.
 */
async function loadIdentity(name) {
  const id = AVAILABLE_IDENTITIES.includes(name) ? name : DEFAULT_IDENTITY;
  const [identity, voice, ownKnowledge, manifestRaw] = await Promise.all([
    readPrompt(`identiteiten/${id}/identity.md`),
    readPrompt(`identiteiten/${id}/voice.md`),
    readPrompt(`identiteiten/${id}/knowledge.md`),
    readPrompt(`identiteiten/${id}/identiteit.json`),
  ]);
  let manifest = {};
  try { manifest = manifestRaw ? JSON.parse(manifestRaw) : {}; } catch { /* ignore malformed manifest */ }
  return { name: id, identity, voice, ownKnowledge, manifest };
}

/**
 * Assemble the ENT system prompt.
 * @param {Object} config — intake config from the client (same shape as before).
 * @returns {Promise<{ stable: string, session: string }>}
 */
export async function compose(config = {}) {
  // ── Stable prefix (cacheable, identical across sessions for a given identiteit):
  //    identity + voice [+ own knowledge] + shared core.
  const id = await loadIdentity(config.voice_subject || DEFAULT_IDENTITY);
  const [principes, grenzen, methodiek] = await Promise.all([
    readPrompt("core/principes.md"),
    readPrompt("core/grenzen.md"),
    readPrompt("core/methodiek.md"),
  ]);
  const stableParts = [];
  if (id.identity)     stableParts.push(id.identity);
  if (id.voice)        stableParts.push(id.voice);
  if (id.ownKnowledge) stableParts.push(id.ownKnowledge);
  if (principes)       stableParts.push(principes);
  if (grenzen)         stableParts.push(grenzen);
  if (methodiek)       stableParts.push(methodiek);
  // Fixed knowledge layer (knowledge/*.md by id.manifest.domains) is appended here in Fase 1.

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
  const location = (config.location || "").trim();
  const situation = (config.situation || "").trim();
  if (location) ctx.push(`Locatie: ${location}`);
  if (situation) ctx.push(`Context: ${situation}`);
  parts.push("# Sessie context\n\n" + ctx.join("\n"));

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

  return {
    stable: stableParts.join("\n\n---\n\n"),
    session: parts.join("\n\n---\n\n"),
  };
}
