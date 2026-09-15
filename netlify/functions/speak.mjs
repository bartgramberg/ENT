/**
 * netlify/functions/speak.mjs
 * Stateless proxy to the ElevenLabs text-to-speech API for the ENT demo.
 *
 * Accepts POST with JSON body:
 *   { password, text, lang }
 *
 * Returns:
 *   200 audio/mpeg           — the spoken answer
 *   400 { error }            — bad body
 *   401 { error }            — wrong password
 *   500 { error }            — missing env var
 *   503 { error }            — ElevenLabs failure (quota, auth, network)
 *
 * The voice and the API key live only in environment variables, so neither
 * ever reaches the browser. Mirrors the auth + error shape of chat.mjs.
 */

const MODEL_ID = "eleven_flash_v2_5";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Trim to defend against a trailing newline/space in the stored value
  // (a common paste artifact that yields an invalid key).
  const apiKey  = (process.env.ELEVENLABS_API_KEY  || "").trim();
  const voiceId = (process.env.ELEVENLABS_VOICE_ID || "").trim();
  const envPass = (process.env.ENT_ACCESS_PASSWORD || "").trim();
  if (!apiKey) {
    return json({ error: "Server is not configured. Missing env var: ELEVENLABS_API_KEY. See README." }, 500);
  }
  if (!voiceId) {
    return json({ error: "Server is not configured. Missing env var: ELEVENLABS_VOICE_ID. See README." }, 500);
  }
  if (!envPass) {
    return json({ error: "Server is not configured. Missing env var: ENT_ACCESS_PASSWORD. See README." }, 500);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { password, text, lang } = body;

  if (!password || password !== envPass) {
    return json({ error: "Ongeldig wachtwoord" }, 401);
  }

  const spoken = typeof text === "string" ? text.trim() : "";
  if (!spoken) {
    return json({ error: "text must be a non-empty string" }, 400);
  }

  let elevenRes;
  try {
    elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key":   apiKey,
          "Accept":       "audio/mpeg",
        },
        body: JSON.stringify({
          text:          spoken,
          model_id:      MODEL_ID,
          language_code: lang === "en" ? "en" : "nl",
        }),
      }
    );
  } catch (err) {
    console.error("ElevenLabs network error:", err);
    return json({ error: "Netwerkfout bij het genereren van spraak." }, 503);
  }

  if (!elevenRes.ok) {
    // Log the upstream detail server-side; do not leak it to the client.
    const detail = await elevenRes.text().catch(() => "");
    console.error(`ElevenLabs API ${elevenRes.status}: ${detail}`);
    return json({ error: `Spraak is even niet beschikbaar (${elevenRes.status}).` }, 503);
  }

  let audio;
  try {
    audio = await elevenRes.arrayBuffer();
  } catch {
    return json({ error: "Kon het audio-antwoord niet lezen." }, 503);
  }

  return new Response(audio, {
    status: 200,
    headers: {
      "Content-Type":  "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
