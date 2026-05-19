# ENT Onboarding — Documentation

## How the flow works

The onboarding is a five-question intake that runs before the user enters the ENT conversation. It collects the session context, assembles a tailored system prompt, and hands off to the chat interface.

```
/ (onboarding)
  Q1 — Who are you?          → sets audience tuning register (when self)
  Q2 — Who is this for?      → self / group
    Q2b — Which audience?    → (only when group) residents / designers / ecologists /
                                civil_servant / developer / mixed / other
  Q3 — What for today?       → sets purpose / output shape
  Q4 — Context               → voice (boom), location, situation
  Q5 — Project documents?    → optional PDF / TXT upload (max 5 files)
  Confirmation screen        → one-sentence summary + start / edit
  POST /intake               → server assembles system prompt, stores in state
  → /demo                    → ENT conversation begins
```

### Q2 / Q2b flow
Choosing "Voor mezelf" (self) routes directly to Q3. Choosing "Voor een publiek" (group) reveals Q2b inline — a second tier of tiles on the same screen (progress stays 2/5). Specific types (residents, designers, ecologists, etc.) auto-advance to Q3. Mixed/other show a free-text details field and a "Ga verder" button.

### Q5 — Document upload
Choosing "Ja" on Q5 reveals a drag-and-drop zone. Files are uploaded immediately to `POST /upload`, which returns extracted text. The documents are stored in `intake.documents[]` and injected into the system prompt by `compose.py` (total capped at 8 000 chars, proportionally truncated per file).

PDF extraction uses `pdfminer.six`. TXT files are decoded as UTF-8. Max 5 files, 20 000 chars per file before truncation.

### Skip option
A "skip intake" link on screen 1 opens a JSON paste box. Paste a previously exported config and click "Laden" to jump directly to the confirmation screen with all fields pre-filled. Exported configs do not contain document text — if the original session had uploaded documents, a notice appears and they must be re-uploaded.

### Language
Default Dutch. Toggle NL/EN in the top right. ENT responds in the chosen language. This overrides any language instruction in the voice file.

### Direct demo access (development)
`/demo?skip=true` bypasses the API-key check, so you can open the demo directly without going through onboarding. Only works if a session was already set up in the same server process.

---

## Where each piece lives

| What | File |
|---|---|
| Onboarding UI | `src/ENT_onboarding_v1.html` |
| Prompt assembler | `src/compose.py` |
| Server routes | `src/server.py` |
| Chat interface | `src/ENT_demo_v8.html` |
| Voice files | `prompts/ent/voices/*.md` |
| Voice template | `prompts/ent/voices/_template.md` |
| Audience modules | `prompts/ent/audiences/*.md` |
| Purpose modules | `prompts/ent/purposes/*.md` |
| Output format / parse contract | `prompts/ent/format/overwegingen.md` |
| Usage log | `logs/usage.jsonl` (created at runtime) |

---

## How to add a new voice

1. Copy `prompts/ent/voices/_template.md` to `prompts/ent/voices/<name>.md`.
2. Fill in all four sections: **Who I am**, **How I speak**, **What I know and don't know**, **Hard rules**.
3. Do not remove or modify the **Shared rules** block.
4. Do not add a custom output format — it is injected from `format/overwegingen.md`.
5. In `src/compose.py`, add the key to `AVAILABLE_VOICES`:
   ```python
   AVAILABLE_VOICES = ["boom", "<name>"]
   ```
6. Add the voice tile to Q4 in `src/ENT_onboarding_v1.html` (follow the boom tile pattern), and add translations to the `STRINGS` object in both `nl` and `en` blocks.
7. Add the image assets `<name>_mond_dicht.png` and `<name>_mond_open.png` to `assets/images/` and add two GET routes for them in `server.py`.

---

## How to add a new audience

1. Create `prompts/ent/audiences/<name>.md` following the format of existing files.
2. In `src/compose.py`:
   - Add the mapping to `ROLE_TO_AUDIENCE` (for users who select this role for themselves in Q1):
     ```python
     "children": "children",
     ```
   - Add the mapping to `AUDIENCE_TYPE_TO_FILE` (for facilitators choosing an audience type in Q2b):
     ```python
     "children": "children",
     ```
3. Add the option tile in `src/ENT_onboarding_v1.html` (Q1 for the role, Q2b for the audience type if applicable), and add translations to both `nl` and `en` STRINGS blocks.

---

## How to add a new purpose

1. Create `prompts/ent/purposes/<name>.md`.
2. In `src/compose.py`, add the key to `PURPOSE_TO_FILE`:
   ```python
   "workshop": "workshop",
   ```
3. Add the tile and translations in `src/ENT_onboarding_v1.html`.

---

## How to export and import a session config

### Export
```bash
curl http://localhost:8766/session-config
```
Returns the current `IntakeConfig` as JSON. Save it to a file for replay. Note: document text is not included in the export.

### Import (via onboarding UI)
1. Open `/onboarding`
2. Click "Intake overslaan (config plakken)"
3. Paste the JSON and click "Laden"
4. The confirmation screen opens with all fields pre-filled
5. Click "Ja, start de sessie"

### Import (via API)
```bash
curl -X POST http://localhost:8766/session-config \
  -H "Content-Type: application/json" \
  -d '{"user_role":"designer","audience_mode":"group","audience_type":"residents","purpose":"open","voice_subject":"boom","location":"Buiksloterham","situation":"Herontwikkeling","lang":"nl"}'
```

---

## How to adjust setup mid-conversation

Click "Setup aanpassen" in the demo topbar. This:
1. Fetches the current config from `/session-config`
2. Stores it in `sessionStorage`
3. Navigates to `/onboarding?adjust=true`

The onboarding pre-fills all answers. When you submit, `/intake` is called with `preserve_history: true` — the system prompt is recomposed but the conversation history on the server is preserved.

---

## How the system prompt is assembled

`compose.py` builds the prompt in this order, each block separated by `\n\n---\n\n`:

1. **Voice file** — `prompts/ent/voices/<voice>.md` — the complete identity of the speaking entity: who it is, how it speaks, what it knows, hard rules. Falls back to `boom.md` if the requested voice file is not found.
2. **Audience module** — `prompts/ent/audiences/<file>.md` — register tuning for the audience type. Selected by `user_role` (when `audience_mode = self`) or `audience_type` (when `audience_mode = group`).
3. **Audience details** (if present) — free text from Q2b's "Wie zit er in de zaal?" field. Always injected if non-empty, regardless of audience mode.
4. **Purpose module** — `prompts/ent/purposes/<file>.md` — shape and format tuning.
5. **Session context** — language, location, situation text.
6. **Project documents** (if uploaded) — extracted text from uploaded files, capped at 8 000 total chars (proportional truncation per file).
7. **Output format / parse contract** — `prompts/ent/format/overwegingen.md` — always last. Defines the `[OVERWEGINGEN]` marker and the two-part response structure. Overrides any output format described in the voice file.

---

## Usage logging

Every completed intake is logged anonymously to `logs/usage.jsonl`. Each line is a JSON object:

```json
{
  "ts": "2026-05-19T10:00:00Z",
  "user_role": "designer",
  "audience_mode": "group",
  "audience_type": "residents",
  "purpose": "open",
  "voice_subject": "boom",
  "has_location": true,
  "has_situation": true,
  "has_audience_details": false,
  "has_documents": true,
  "document_count": 2,
  "lang": "nl"
}
```

`audience_type` is `null` when `audience_mode` is `"self"`. No content (location names, situation text, document text) is logged — only structural metadata.

---

## Server setup

```bash
pip install pdfminer.six        # once, for PDF extraction in /upload
export ANTHROPIC_API_KEY=sk-ant-...
python3 src/server.py
```

Open http://localhost:8766 — the onboarding loads.

The server reads the API key from the `ANTHROPIC_API_KEY` environment variable. End users never see or enter an API key.

---

## Decisions made under ambiguity

| Decision | Rationale |
|---|---|
| API key from env var only | End users (residents, civil servants) should not need to know what an API key is. The operator sets it once before the session. |
| Console preserved at `/console` | Existing `/setup` route still works for the team's direct access workflow. Not linked from the UI. |
| Voice limited to boom (one active tile) | Only boom assets exist. A passive "Meer natuur / Binnenkort" tile signals the roadmap without allowing selection. |
| Self-contained voice files | Each voice owns its complete identity in one file. `base.md` and the `VOICE_FRAME` hardcoded string are gone. Adding a new voice = add one file + one key in `AVAILABLE_VOICES`. |
| `format/overwegingen.md` injected last | The parse contract (`[OVERWEGINGEN]` marker, two-part structure) lives separately from voice identity. It overrides any output format in the voice file. This allows voice files to be written without knowing the UI's parse requirements. |
| audience_mode: self / group only | "Mixed" was removed as a top-level audience_mode. Mixed is now a Q2b audience_type choice, keeping the tree clean: "who are you talking to" is always a two-step question when group is selected. |
| Q5 documents optional | Documents make ENT more specific but are never required. A session without documents is still fully functional. |
| `preserve_history` flag on `/intake` | Allows mid-session setup adjustment without resetting the conversation. The server history survives; the browser's rendered history is rebuilt on the next reload via `/session-config`. |
| Single-file HTML (no build system) | Matches the existing stack. No npm, no bundler, no dependencies. |
| Audience tuning: facilitator → mixed | A facilitator typically serves mixed audiences, so the mixed.md register is the most appropriate default. |
| pdfminer.six for PDF extraction | Stdlib has no PDF parser. pdfminer.six is pure Python, no binary dependencies, reliable for the document types used in urban planning (policy PDFs, design reports). |
