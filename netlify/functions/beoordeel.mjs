/**
 * netlify/functions/beoordeel.mjs  →  POST /api/beoordeel
 *
 * Beoordeelt de opgehaalde plekgegevens tegen wat er speelt. Twee modi:
 *   review — flow A: per gegeven relevant ja/mogelijk/nee met één reden, plus
 *            wat er nog ontbreekt om over deze plek te kunnen spreken (gaten);
 *            de gebruiker vinkt daarna zelf aan.
 *   filter — flow B: idem, maar de uitkomst wordt direct als selectie gebruikt.
 *
 * Bewust klein: alleen de items (korte teksten), de casus, de representatie en
 * per laag de koppen van het aangeleverde materiaal — nooit de volledige lagen.
 * Gestructureerde uitvoer, weinig tokens, geen thinking. Resultaat wordt per
 * invoer-hash even bewaard, zodat opnieuw klikken niet opnieuw kost.
 *
 * Body: { password, modus, items:[{id,label,tekst,laag,soort}], casus, representatie, lagen_koppen:[{laag, koppen}] }
 * Antwoord: { beoordeling:[{id, relevant, reden}], gaten:[{onderwerp, waarom}] }
 */

import { createHash } from "node:crypto";

const MODEL = (process.env.ENT_MODEL || "claude-sonnet-5").trim();
const JSON_HEADERS = { "Content-Type": "application/json" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

const cache = new Map(); // hash → resultaat (leeft zolang de function-instance leeft)

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    beoordeling: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: { id: { type: "string" }, relevant: { type: "string", enum: ["ja", "mogelijk", "nee"] }, reden: { type: "string" } },
        required: ["id", "relevant", "reden"],
      },
    },
    gaten: {
      type: "array",
      items: { type: "object", additionalProperties: false, properties: { onderwerp: { type: "string" }, waarom: { type: "string" } }, required: ["onderwerp", "waarom"] },
    },
  },
  required: ["beoordeling", "gaten"],
};

function anthropicUrl() {
  const base = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "");
  return `${base}/v1/messages`;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  const envPass = (process.env.ENT_ACCESS_PASSWORD || "").trim();
  if (!apiKey || !envPass) return json({ error: "Server is not configured." }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  if (!body.password || body.password !== envPass) return json({ error: "Ongeldig wachtwoord" }, 401);

  const modus = body.modus === "filter" ? "filter" : "review";
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 40).map((i) => ({
    id: String(i.id || ""), label: String(i.label || "").slice(0, 80), tekst: String(i.tekst || "").slice(0, 300), laag: String(i.laag || ""), soort: String(i.soort || ""),
  })).filter((i) => i.id);
  if (!items.length) return json({ beoordeling: [], gaten: [] });
  const casus = String(body.casus || "").slice(0, 3000);
  const representatie = String(body.representatie || "").slice(0, 200);
  const koppen = (Array.isArray(body.lagen_koppen) ? body.lagen_koppen : []).slice(0, 4).map((l) => ({ laag: String(l.laag || ""), koppen: String(l.koppen || "").slice(0, 1500) }));

  const sleutel = createHash("sha1").update(JSON.stringify({ modus, items, casus, representatie, koppen, MODEL })).digest("hex");
  if (cache.has(sleutel)) return json({ ...cache.get(sleutel), cached: true });

  const system =
    "Je beoordeelt of open plekgegevens relevant zijn voor een gesprek. Je krijgt: wat ENT representeert, " +
    "wat er speelt, welk materiaal al is aangeleverd (alleen koppen), en een lijst gegevens uit open bronnen. " +
    "Per gegeven: 'ja' als het direct raakt aan wat er speelt of aan wat ENT representeert; 'mogelijk' als het " +
    "achtergrond is die in een gesprek kan opduiken; 'nee' als het er niet toe doet (bijvoorbeeld een stedelijk " +
    "hitte-eilandeffect op een boerenerf, of een monument dat toevallig in de buurt staat). Bij twijfel 'mogelijk'. " +
    "Eén reden per gegeven van hooguit twaalf woorden, in gewone taal. Daarna: welke onderwerpen over deze plek ontbreken om hierover " +
    "te kunnen spreken — dingen die niet in de gegevens en niet in het aangeleverde materiaal zitten (bijvoorbeeld " +
    "de toestand van de beek, soorten, eigendom, peilbesluit). Hooguit vijf gaten, concreet. Antwoord in het Nederlands.";

  const user = [
    `Representeert: ${representatie || "(niet opgegeven)"}`,
    `Wat er speelt:\n${casus || "(niet opgegeven)"}`,
    koppen.length ? "Aangeleverd materiaal (koppen per laag):\n" + koppen.map((l) => `- ${l.laag}: ${l.koppen || "(leeg)"}`).join("\n") : "Aangeleverd materiaal: geen.",
    "Gegevens:\n" + items.map((i) => `- id=${i.id} [${i.laag}, ${i.soort}] ${i.label}: ${i.tekst}`).join("\n"),
  ].join("\n\n");

  const t0 = Date.now();
  let res;
  try {
    res = await fetch(anthropicUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 1400,
        thinking: { type: "disabled" },
        system,
        messages: [{ role: "user", content: user }],
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
      }),
    });
  } catch (err) {
    console.error("beoordeel network:", err);
    return json({ error: "Netwerkfout" }, 503);
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    console.error(`beoordeel ${res.status}:`, d?.error?.message || "");
    return json({ error: `Beoordeling mislukt (${res.status})` }, 503);
  }
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let uit;
  try { uit = JSON.parse(text); } catch {
    console.error("beoordeel: onleesbare uitvoer, stop_reason", data.stop_reason, "tokens", data.usage?.output_tokens);
    return json({ error: "Beoordeling onleesbaar" }, 503);
  }
  const bekend = new Set(items.map((i) => i.id));
  uit.beoordeling = (uit.beoordeling || []).filter((b) => bekend.has(b.id));
  uit.gaten = (uit.gaten || []).slice(0, 5);
  uit.duur_ms = Date.now() - t0;
  uit.usage = data.usage;
  cache.set(sleutel, uit);
  return json(uit);
}
