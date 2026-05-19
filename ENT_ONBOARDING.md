# ENT Onboarding — Documentation

## How the flow works

The onboarding is a four-question intake that runs before the user enters the ENT conversation. It collects the session context, assembles a tailored system prompt, and hands off to the chat interface.

```
/ (onboarding)
  Q1 — Who are you?         → sets audience tuning register
  Q2 — Who is this for?     → self / group / mixed
  Q3 — What for today?      → sets purpose / output shape
  Q4 — Context              → voice (boom/egel), location, situation, audience details
  Confirmation screen       → one-sentence summary + start / edit
  POST /intake              → server assembles system prompt, stores in state
  → /demo                   → ENT conversation begins
```

### Skip option
A "skip intake" link on screen 1 opens a JSON paste box. Paste a previously exported config and click "Laden" to jump directly to the confirmation screen with all fields pre-filled. Useful for replaying saved setups at funder demos.

### Language
Default Dutch. Toggle NL/EN in the top right. ENT then defaults to responding in the chosen language.

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
| Base ENT voice rules | `prompts/ent/base.md` |
| Audience modules | `prompts/ent/audiences/*.md` |
| Purpose modules | `prompts/ent/purposes/*.md` |
| Usage log | `logs/usage.jsonl` (created at runtime) |

---

## How to add a new audience

1. Create `prompts/ent/audiences/<name>.md` following the format of existing files:
   ```markdown
   # Audience: <description>
   Register: ...
   Vocabulary: ...
   Length: ...
   One-line instruction for ENT.
   ```
2. Open `src/compose.py` and add the new key to `ROLE_TO_AUDIENCE`:
   ```python
   "children": "children",
   ```
3. Add the option to the Q1 screen in `src/ENT_onboarding_v1.html` (follow the existing tile pattern).
4. Add translations for the new option to both `nl` and `en` blocks in the `STRINGS` object.

---

## How to add a new purpose

1. Create `prompts/ent/purposes/<name>.md`:
   ```markdown
   # Purpose: <description>
   Format: ...
   - Instruction 1
   - Instruction 2
   ```
2. Open `src/compose.py` and add the key to `PURPOSE_TO_FILE`:
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
Returns the current `IntakeConfig` as JSON. Save it to a file for replay.

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
  -d '{"user_role":"resident","audience_mode":"group","purpose":"open","voice_subject":"boom","location":"Buiksloterham","situation":"Herontwikkeling","audience_details":"Buurtbewoners"}'
```

---

## How to adjust setup mid-conversation

Click "Setup aanpassen" in the demo topbar. This:
1. Fetches the current config from `/session-config`
2. Stores it in `sessionStorage`
3. Navigates to `/onboarding?adjust=true`

The onboarding pre-fills all answers. When you submit, `/intake` is called with `preserve_history: true` — the system prompt is recomposed but the conversation history on the server is preserved. The next ENT response reflects the new setup.

---

## How the system prompt is assembled

`compose.py` builds the prompt in this order:

1. **`base.md`** — immutable core: who ENT is, hard rules, voice fundamentals
2. **Voice frame** — a short grounding block: "Je spreekt als De Boom…"
3. **Audience module** — selected by `user_role` (if `audience_mode = self`) or `mixed.md` + `audience_details` text (if group/mixed)
4. **Purpose module** — selected by `purpose`
5. **Session context** — literal location and situation text, injected last
6. **Overwegingen instruction** — always the final block, tells ENT to end with `[OVERWEGINGEN]`

Each block is separated by `\n\n---\n\n`.

---

## Usage logging

Every completed intake is logged anonymously to `logs/usage.jsonl`. Each line is a JSON object:

```json
{
  "ts": "2026-05-19T10:00:00Z",
  "user_role": "resident",
  "audience_mode": "group",
  "purpose": "open",
  "voice_subject": "boom",
  "has_location": true,
  "has_situation": true,
  "has_audience_details": true,
  "lang": "nl"
}
```

No content (location names, situation text, audience details) is logged — only structural metadata.

---

## Server setup

```bash
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
| Voice limited to boom / egel | Only two assets exist. Custom voice types (canal, kingfisher, soil) deferred to a later version when matching assets are ready. |
| `preserve_history` flag on `/intake` | Allows mid-session setup adjustment without resetting the conversation. The server history survives; the browser's rendered history is rebuilt on the next reload via `/session-config`. |
| Single-file HTML (no build system) | Matches the existing stack. No npm, no bundler, no dependencies. |
| Audience tuning: facilitator → mixed | A facilitator typically serves mixed audiences, so the mixed.md register is the most appropriate default. |
