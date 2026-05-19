# ENT — Engage Nature Tool

ENT is an AI conversation tool by Protopia Studio. A user converses with the Tree — a natural avatar speaking from an ecological perspective — to bring nature's voice into area development and participation processes.

---

## Run locally (Netlify)

1. Install Node 18+ and Netlify CLI:
   ```bash
   npm install -g netlify-cli
   ```

2. Copy the env template:
   ```bash
   cp .env.example .env
   ```

3. Open `.env` and paste your Anthropic API key plus a chosen access password:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ENT_ACCESS_PASSWORD=your-chosen-password
   ```

4. Start the dev server:
   ```bash
   netlify dev
   ```

5. Open [http://localhost:8888](http://localhost:8888)

---

## Production deployment

`git push origin dev` (or `main`) triggers a Netlify deploy automatically once the repo is linked.

Set environment variables via the **Netlify dashboard → Site settings → Environment variables**:
- `ANTHROPIC_API_KEY`
- `ENT_ACCESS_PASSWORD`

---

## Run locally (Python — fallback)

The original Python server is preserved for local development without Netlify CLI:

```bash
cd src
export ANTHROPIC_API_KEY=sk-ant-...
python3 server.py
```

Open: [http://localhost:8766](http://localhost:8766)

---

## Architecture

| File | Purpose |
|------|---------|
| `index.html` | Password gate + five-step onboarding |
| `demo.html` | Chat interface with Tree |
| `console.html` | Legacy operator console (no Netlify routing) |
| `compose.js` | Client-side prompt assembly from modular markdown files |
| `netlify/functions/chat.js` | Stateless Anthropic API proxy |
| `netlify.toml` | Netlify build config + redirects |
| `src/server.py` | Python server (local fallback) |
| `src/compose.py` | Python prompt assembly (source of truth for compose.js) |
| `prompts/ent/` | Modular voice, audience, purpose and format prompt files |
| `assets/images/` | Avatar and background images |

---

## Repository structure

```
/index.html
/demo.html
/console.html
/compose.js
/netlify/functions/chat.js
/netlify.toml
/.env.example
/prompts/ent/voices/
/prompts/ent/audiences/
/prompts/ent/purposes/
/prompts/ent/format/
/assets/images/
/src/server.py
/src/compose.py
/src/ENT_onboarding_v1.html
/src/ENT_demo_v8.html
/src/ENT_console_v8.html
```

---

## Requirements

- **Netlify deploy**: Node 18+, Netlify CLI, Anthropic API key
- **Python fallback**: Python 3.8+, Anthropic API key
- Internet connection (for API calls and location autocomplete via OpenStreetMap)
