# ENT Onboarding — Documentation

Describes the live Netlify architecture. The onboarding collects session context, assembles a tailored system prompt, and hands off to the chat interface.

## How the flow works

```
/ (index.html)
  Password gate            → client-side overlay; unlocked when the access code
                             verifies server-side (POST /api/chat with empty messages)
  Q1 — Who are you?         → sets audience tuning register (when "self")
  Q2 — Who is this for?     → self / group
    Q2b — Which audience?   → (only when group) residents / professionals / children / mixed
  Q3 — What for today?      → sets purpose / output shape
  Q4 — Context              → voice (boom), location, situation, optional documents
  Confirmation screen       → one-sentence summary + start / adjust
  → compose.js builds the system prompt in the browser
  → localStorage (config + prompt)
  → /demo (demo.html)       → ENT conversation begins
```

### Data flow

The app is static HTML + one Netlify function. There is no server-side session state.

1. `index.html` runs the gate + onboarding. On confirm, `compose.js` (in the browser) fetches the
   modular prompt files and assembles the system prompt.
2. The composed prompt + the intake config are written to `localStorage`
   (`ent_intake_config`, `ent_system_prompt`, `ent_session_id`, `ent_password_verified`,
   and on a fresh start `ent_conversation`, `ent_usage`).
3. `demo.html` reads those, renders the chat, and on each turn POSTs
   `{ password, messages, system }` to `/api/chat`.
4. `netlify/functions/chat.mjs` verifies the password against `ENT_ACCESS_PASSWORD`, calls the
   Anthropic API, splits the reply on the `[OVERWEGINGEN]` marker, and returns
   `{ stem, overwegingen, usage }`.

> The onboarding gate is cosmetic — the real access control is the server-side password check in
> `chat.mjs`, re-checked on every request.

### Q2 / Q2b

"Voor mezelf" (self) routes directly to Q3 and the audience register is derived from the Q1 role.
"Voor een publiek" (group) reveals Q2b inline (progress stays 2/4); the chosen audience type
auto-advances to Q3.

### Q4 — documents

The upload zone accepts PDF and TXT (drag-drop or click), max 5 files. Extraction is
**client-side**: PDFs via pdf.js (loaded from a CDN), TXT via `FileReader`. Each file is capped at
20 000 chars; `compose.js` then caps the combined document block at 8 000 chars (proportional
truncation per file) when building the prompt. Documents live only in the browser session.

### Adjust setup

"Setup aanpassen" in the demo topbar navigates to `/?adjust=true`. The onboarding prefills every
answer from `localStorage['ent_intake_config']` and lands on the confirmation screen. The existing
conversation is preserved (the intake is recomposed, the chat history is kept).

### Language

Default Dutch; NL/EN toggle in the top right. The chosen language is passed in the session context
and overrides any language instruction in the voice file.

---

## Where each piece lives

| What | File |
|---|---|
| Gate + onboarding UI | `index.html` |
| Chat interface | `demo.html` |
| Prompt assembler | `compose.js` |
| API proxy | `netlify/functions/chat.mjs` |
| Voice files | `prompts/ent/voices/*.md` |
| Voice template | `prompts/ent/voices/_template.md` |
| Audience modules | `prompts/ent/audiences/*.md` |
| Purpose modules | `prompts/ent/purposes/*.md` |
| Output format / parse contract | `prompts/ent/format/overwegingen.md` |

---

## How the system prompt is assembled

`compose.js` builds the prompt in this order, each block separated by `\n\n---\n\n`:

1. **Voice file** — `prompts/ent/voices/<voice>.md` — the complete identity of the speaking entity.
   Falls back to `boom.md` if the requested voice is not found.
2. **Audience module** — `# Publiek` + `prompts/ent/audiences/<file>.md` — register tuning, selected
   by `user_role` (self) or `audience_type` (group).
3. **Audience details** (if present) — `# Wie zit er in de zaal` — free text, always injected if
   non-empty.
4. **Purpose module** — `# Doel en vorm` + `prompts/ent/purposes/<file>.md` — shape/format tuning.
5. **Session context** — `# Sessie context` — language, location, situation.
6. **Project documents** (if uploaded) — `# Projectdocumenten` — extracted text, capped at 8 000
   total chars.
7. **Output format / parse contract** — `prompts/ent/format/overwegingen.md` — always last. Defines
   the `[OVERWEGINGEN]` marker and the two-part response structure; it overrides any output format
   in the voice file.

---

## How to add a new voice

1. Copy `prompts/ent/voices/_template.md` to `prompts/ent/voices/<name>.md` and fill in the identity
   sections. Do **not** add an output format — that is injected from `format/overwegingen.md`.
2. In `compose.js`, add the key to `AVAILABLE_VOICES`.
3. Add the voice tile to Q4 in `index.html` (follow the boom tile pattern) and add NL + EN
   translations to the `STRINGS` object.
4. Add `assets/images/<name>_mond_dicht.png` and `<name>_mond_open.png`.

## How to add a new audience

1. Create `prompts/ent/audiences/<name>.md`.
2. In `compose.js`, add the mapping to `ROLE_TO_AUDIENCE` (for Q1 role → self) and/or
   `AUDIENCE_TYPE_TO_FILE` (for Q2b audience type).
3. Add the option tile in `index.html` (Q1 and/or Q2b) with NL + EN translations.

## How to add a new purpose

1. Create `prompts/ent/purposes/<name>.md`.
2. In `compose.js`, add the key to `PURPOSE_TO_FILE`.
3. Add the tile and translations in `index.html`.
