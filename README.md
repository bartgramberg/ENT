# ENT — Engage Nature Tool

ENT is an AI conversation tool by Protopia Studio. A user converses with the Tree — a natural avatar speaking from an ecological perspective — to bring nature's voice into area development and participation processes.

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

---

## Architecture

| File | Purpose |
|------|---------|
| `index.html` | Password gate + four-step onboarding |
| `demo.html` | Chat interface with the Tree |
| `compose.js` | Client-side prompt assembly from modular markdown files |
| `netlify/functions/chat.mjs` | Stateless Anthropic API proxy |
| `netlify.toml` | Netlify build config + redirects |
| `prompts/ent/` | Modular voice, audience, purpose and format prompt files |
| `assets/images/` | Avatar and background images |

The password is verified server-side by `chat.mjs` against `ENT_ACCESS_PASSWORD` on every `/api/chat` request. The onboarding gate is a client-side overlay; the real access control is in the function.

---

## Repository structure

```
/index.html
/demo.html
/compose.js
/netlify/functions/chat.mjs
/netlify.toml
/.env.example
/prompts/ent/voices/
/prompts/ent/audiences/
/prompts/ent/purposes/
/prompts/ent/format/
/assets/images/
```

---

## Requirements

- Node 18+, Netlify CLI, an Anthropic API key
- Internet connection (for API calls and location autocomplete via OpenStreetMap)
