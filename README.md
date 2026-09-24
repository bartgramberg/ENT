# ENT — Engage Nature Tool

ENT is an AI conversation tool by Protopia Studio. A user converses with a representative of what has no voice at the table — an ecosystem, the water, a tree, future residents — to bring that perspective into area development and participation processes.

---

## Run locally (Netlify)

1. Install Node 18+ and Netlify CLI:
   ```bash
   npm install -g netlify-cli
   ```

2. Link the repo to the Netlify site (pulls the env vars — API key + access password — automatically):
   ```bash
   netlify link --name ent-demo
   ```
   Alternatively, copy the env template and fill it in locally:
   ```bash
   cp .env.example .env
   # then set ANTHROPIC_API_KEY and ENT_ACCESS_PASSWORD in .env
   ```

3. Start the dev server:
   ```bash
   netlify dev
   ```

4. Open [http://localhost:8888](http://localhost:8888)

> Note: a local `.env` **overrides** the linked Netlify project's variables. If you've run `netlify link`, don't keep an empty `.env` around — it will inject blank values.

---

## Production deployment

`git push origin dev` (or `main`) triggers a Netlify deploy automatically once the repo is linked.

Set environment variables via the **Netlify dashboard → Site settings → Environment variables**:
- `ANTHROPIC_API_KEY`
- `ENT_ACCESS_PASSWORD`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`

---

## Architecture

| File | Purpose |
|------|---------|
| `start.html` | New onboarding (`/start`): facilitate a session or use ENT yourself |
| `index.html` | Old onboarding (kept until the first Water als Kompas session) |
| `demo.html` | Chat interface (`/demo?s=<session id>`) |
| `netlify/functions/chat.mjs` | Stateless Anthropic API proxy: stem, overwegingen, opening, token count |
| `netlify/functions/lib/compose.mjs` | Server-side prompt assembly in cache blocks |
| `netlify/functions/analyse.mjs` | Hyperlocal place scan from open data |
| `netlify/functions/speak.mjs` | Stateless ElevenLabs text-to-speech proxy |
| `netlify.toml` | Netlify build config + redirects |
| `prompts/ent/` | `basis.md`, `contract.md`, `personages/`, `opening/` |
| `voorbeelden/kennis/` | Starter texts for a knowledge profile (not loaded by compose) |
| `eval/`, `scripts/eval*.mjs` | Measurement: fixtures, offline structure check, API regression set |
| `assets/images/` | Avatar and background images |

The password is verified server-side by `chat.mjs` against `ENT_ACCESS_PASSWORD` on every `/api/chat` request. The onboarding gate is a client-side overlay; the real access control is in the function.

---

## Repository structure

```
/start.html  /index.html  /demo.html
/netlify/functions/{chat,analyse,speak}.mjs  /netlify/functions/lib/
/netlify.toml  /.env.example
/prompts/ent/{basis.md,contract.md,personages/,opening/}
/voorbeelden/kennis/  /eval/  /scripts/
/assets/images/
```

---

## Requirements

- Node 18+, Netlify CLI, an Anthropic API key
- Internet connection (for API calls and location autocomplete via OpenStreetMap)
