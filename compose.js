/**
 * compose.js
 * Client-side port of src/compose.py.
 * Assembles the ENT system prompt from an intake config object + markdown prompt files.
 *
 * Architecture:
 *   prompts/ent/voices/{voice}.md      — complete self-contained voice identity
 *   prompts/ent/audiences/{type}.md    — register tuning per audience type
 *   prompts/ent/purposes/{purpose}.md  — shape/format tuning per purpose
 *   prompts/ent/format/overwegingen.md — technical parse contract (always last)
 *
 * Usage:
 *   import { compose } from '/compose.js';
 *   const systemPrompt = await compose(intakeConfig);
 */

// Voices with a complete voice file — extend this list as new voices are added
const AVAILABLE_VOICES = ["boom"];

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

/**
 * Fetch a prompt file relative to /prompts/ent/.
 * Returns empty string if the file is missing or fetch fails.
 */
async function readPrompt(relativePath) {
  try {
    const res = await fetch(`/prompts/ent/${relativePath}`);
    if (!res.ok) return "";
    return (await res.text()).trim();
  } catch {
    return "";
  }
}

/**
 * Load the complete voice prompt for the given voice key.
 * Falls back to boom.md if the requested voice file does not exist.
 */
async function loadVoice(voiceSubject) {
  const voice = AVAILABLE_VOICES.includes(voiceSubject) ? voiceSubject : "boom";
  const text = await readPrompt(`voices/${voice}.md`);
  if (text) return text;
  // Fallback: try boom explicitly
  return readPrompt("voices/boom.md");
}

/**
 * Assemble and return the ENT system prompt string.
 *
 * @param {Object} config
 * @param {string} config.user_role        — "designer"|"ecologist"|"civil_servant"|
 *                                           "developer"|"resident"|"facilitator"|
 *                                           "researcher"|"other"
 * @param {string} config.audience_mode    — "self"|"group"
 * @param {string} config.audience_type    — audience key (only when audience_mode="group")
 * @param {string} config.audience_details — free text (only when audience_type="mixed")
 * @param {string} config.purpose          — "open"|"respond"|"story"|"provoke"|
 *                                           "codesign"|"closing"|"explore"|"other"
 * @param {string} config.voice_subject    — "boom" (only available voice for now)
 * @param {string} config.location         — free text
 * @param {string} config.situation        — free text
 * @param {Array}  config.documents        — [{filename, text}, ...]
 * @param {string} config.lang             — "nl"|"en"
 * @returns {Promise<string>}
 */
export async function compose(config) {
  const parts = [];

  // 1. Complete voice identity
  const voiceSubject = config.voice_subject || "boom";
  const voicePrompt = await loadVoice(voiceSubject);
  if (voicePrompt) parts.push(voicePrompt);

  // 2. Audience tuning
  const audienceMode = config.audience_mode || "self";
  if (audienceMode === "self") {
    const role = config.user_role || "other";
    const audienceFile = ROLE_TO_AUDIENCE[role] || "mixed";
    const content = await readPrompt(`audiences/${audienceFile}.md`);
    if (content) parts.push(`# Publiek\n\n${content}`);
  } else if (audienceMode === "group") {
    const audienceType = config.audience_type || "mixed";
    const audienceFile = AUDIENCE_TYPE_TO_FILE[audienceType] || "mixed";
    const content = await readPrompt(`audiences/${audienceFile}.md`);
    if (content) parts.push(`# Publiek\n\n${content}`);
  }

  // Always inject audience_details if present (regardless of mode)
  const details = (config.audience_details || "").trim();
  if (details) parts.push(`# Wie zit er in de zaal\n\n${details}`);

  // 3. Purpose tuning
  const purpose = config.purpose || "explore";
  const purposeFile = PURPOSE_TO_FILE[purpose] || "explore";
  const purposeContent = await readPrompt(`purposes/${purposeFile}.md`);
  if (purposeContent) parts.push(`# Doel en vorm\n\n${purposeContent}`);

  // 4. Session context
  const ctx = [];
  const lang = config.lang || "nl";
  ctx.push(`Taal / Language: ${lang}`);

  const location = (config.location || "").trim();
  const situation = (config.situation || "").trim();
  if (location) ctx.push(`Locatie: ${location}`);
  if (situation) ctx.push(`Context: ${situation}`);
  parts.push("# Sessie context\n\n" + ctx.join("\n"));

  // 5. Project documents (optional, session-only)
  const documents = config.documents || [];
  if (documents.length > 0) {
    const MAX_TOTAL_CHARS = 8000;
    const total = documents.reduce((sum, d) => sum + (d.text || "").length, 0);

    const docParts = [
      "# Projectdocumenten\n\n" +
      "De volgende documenten zijn aangeleverd als projectcontext.\n" +
      "Gebruik ze om je antwoorden te verankeren in het specifieke project.\n" +
      "Verzin geen details die er niet in staan."
    ];

    if (total > MAX_TOTAL_CHARS) {
      // Proportional truncation per file
      for (const doc of documents) {
        let text = doc.text || "";
        const share = total > 0 ? text.length / total : 0;
        const cap = Math.floor(MAX_TOTAL_CHARS * share);
        if (text.length > cap) {
          text = text.slice(0, cap) + "\n[Tekst ingekort vanwege lengte]";
        }
        docParts.push(`---\n[Bestand: ${doc.filename || "onbekend"}]\n${text}`);
      }
    } else {
      for (const doc of documents) {
        docParts.push(`---\n[Bestand: ${doc.filename || "onbekend"}]\n${doc.text || ""}`);
      }
    }

    parts.push(docParts.join("\n\n"));
  }

  // 6. Output format / parse contract — always last
  const fmt = await readPrompt("format/overwegingen.md");
  if (fmt) parts.push(fmt);

  return parts.join("\n\n---\n\n");
}
