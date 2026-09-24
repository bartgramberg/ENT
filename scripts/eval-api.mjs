#!/usr/bin/env node
/**
 * scripts/eval-api.mjs — regressieset met echte API-aanroepen.
 *
 * Roept de chat-function rechtstreeks aan (dezelfde code als productie, incl.
 * compose en de marker-splitsing), met tien vaste vragen op één fixture, per
 * gekozen stem. Elke vraag is een losse beurt na de opening van die stem, zodat
 * de metingen elkaar niet beïnvloeden.
 *
 * Gebruik via de wrapper, die de sleutels uit Netlify haalt zonder ze te tonen:
 *
 *   ./scripts/eval.sh                              # fixture lunteren-water, stemmen boom+water
 *   ./scripts/eval.sh --fixture lunteren-water-zonder-docs --stem water
 *   ENT_MODEL=claude-opus-5-5 ENT_EFFORT=low ./scripts/eval.sh --label opus55-low
 *
 * Per antwoord: woorden en zinnen in de stem, marker gehaald, aantal
 * overwegingen, blokhaken in de stem, getallen in de stem, soortnamen uit een
 * signaallijst (klasse-2-check), ik-vorm vs derde persoon, duur, tokens, cache.
 * Kosten: ~22 aanroepen per stem-paar, orde $0,40 op Sonnet 5.
 *
 * Schrijft eval/resultaten/api-<label>-<datum>.json + .md.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import handler from "../netlify/functions/chat.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith("--") ? [a.slice(2), arr[i + 1]] : []).filter(Boolean));
const fixtureNaam = args.fixture || "lunteren-water";
const stemmen = (args.stem || "boom,water").split(",");
const label = args.label || (process.env.ENT_MODEL || "sonnet5").replace(/[^a-z0-9.-]/gi, "");
const password = (process.env.ENT_ACCESS_PASSWORD || "").trim();
if (!password || !process.env.ANTHROPIC_API_KEY) { console.error("Gebruik ./scripts/eval.sh (sleutels uit Netlify)."); process.exit(2); }

export const VRAGEN = [
  "Vertel ons over de natuur langs de beek. Hoe werkt het ecosysteem hier en wat is vanuit het perspectief van de natuur en het water hier belangrijk?",
  "Vertel wat over die andere begroeiing. Welke soorten? En wat hebben die nodig wat ze nu niet krijgen?",
  "De boer wil de beekrand blijven bemesten tot aan de insteek. Wat betekent dat voor jou?",
  "Wat zou je het waterschap willen vragen?",
  "Vertel eens over jezelf.",
  "Vertel in twee zinnen wat er gebeurt als het een maand niet regent.",
  "Wat is hier de bodemsoort en hoe diep staat het grondwater?",
  "Welke beschermde soorten leven hier?",
  "Vertel het als een verhaal: hoe zag deze plek er honderd jaar geleden uit?",
  "Een ambtenaar aan tafel zegt: \"hier kwelt niks, het is gewoon een afvoersloot.\" Wat zeg je daarop?",
];

// Signaallijst voor de klasse-2-check: soorten die het model in de test noemde
// zonder dat er soortendata was, plus veelgenoemde beek-soorten.
const SOORTEN = /dotterbloem|waterviolier|modderkruiper|waterspitsmuis|beekprik|bermpje|ijsvogel|zegge|elzen?broek|vleermuis|kamsalamander|otter|bever|weidebeekjuffer|hooiland/gi;

async function chat(body) {
  const t0 = Date.now();
  const res = await handler(new Request("http://local/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, ...body }) }));
  const data = await res.json();
  return { status: res.status, duur_ms: Date.now() - t0, ...data };
}

function meet(stem) {
  const woorden = stem.split(/\s+/).filter(Boolean).length;
  const zinnen = (stem.match(/[.!?…](\s|$)/g) || []).length;
  const blokhaken = (stem.match(/\[[^\]]*\]/g) || []).length;
  const getallen = (stem.match(/\d+([.,]\d+)?/g) || []);
  const soorten = [...new Set((stem.match(SOORTEN) || []).map((s) => s.toLowerCase()))];
  const ik = (stem.match(/\b(ik|mij|mijn|me)\b/gi) || []).length;
  const derde = (stem.match(/\b(het water|de boom|de beek)\b/gi) || []).length;
  const eindigtMetVraag = /\?\s*$/.test(stem.trim());
  return { woorden, zinnen, blokhaken, getallen, soorten, ik, derde, eindigtMetVraag };
}

// --fixture accepteert ook een pad naar een geëxporteerd profiel (bv. eval/sessies/…json).
const fixturePad = fixtureNaam.endsWith(".json") ? path.resolve(ROOT, fixtureNaam) : path.join(ROOT, "eval", "fixtures", `${fixtureNaam}.json`);
const config = JSON.parse(await readFile(fixturePad, "utf8"));
const uit = { label, model: process.env.ENT_MODEL || "claude-sonnet-5", effort: process.env.ENT_EFFORT || null, fixture: fixtureNaam, datum: new Date().toISOString(), beurten: [] };

for (const stem of stemmen) {
  const cfg = { ...config, voice_subject: stem };
  const opening = await chat({ messages: [], config: cfg, opening: true });
  const openingStem = (opening.stem || "").trim();
  uit.beurten.push({ stem, vraag: "(opening)", ...meet(openingStem), overwegingen: 0, tekst: openingStem, duur_ms: opening.duur_ms, usage: opening.usage, stop: opening.stop_reason });
  console.log(`\n== ${stem} · opening ${opening.duur_ms} ms · ${meet(openingStem).woorden} w`);
  for (const vraag of VRAGEN) {
    const messages = [{ role: "assistant", content: openingStem }, { role: "user", content: vraag }];
    // Zoals de app: eerst de stem, dan de overwegingen op basis van die stem.
    const r = await chat({ messages, config: cfg, deel: "stem" });
    const s = (r.stem || "").trim();
    const r2 = await chat({ messages, config: cfg, deel: "overwegingen", stem: s });
    const m = meet(s);
    const ovw = Array.isArray(r2.overwegingen) ? r2.overwegingen : [];
    const usage = Object.fromEntries(["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"].map((k) => [k, (r.usage?.[k] || 0) + (r2.usage?.[k] || 0)]));
    const herkomst = ovw.filter((o) => o.herkomst).length;
    uit.beurten.push({ stem, vraag, ...m, overwegingen: ovw.length, herkomst, overwegingen_tekst: ovw, tekst: s, duur_ms: r.duur_ms, duur_overwegingen_ms: r2.duur_ms, usage, stop: r.stop_reason, stop2: r2.stop_reason, status: r.status, error: r.error || r2.error, promptversie: r.promptversie });
    console.log(`  ${m.woorden.toString().padStart(3)} w ${m.zinnen} z  ovw ${ovw.length}/${herkomst}h  ${(r.duur_ms / 1000).toFixed(1)}+${(r2.duur_ms / 1000).toFixed(1)} s  ${m.getallen.length ? "getal " : ""}${m.soorten.length ? "soort:" + m.soorten.join("/") + " " : ""}${m.blokhaken ? "BLOKHAAK " : ""}| ${vraag.slice(0, 50)}`);
  }
}

await mkdir(path.join(ROOT, "eval", "resultaten"), { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const basis = path.join(ROOT, "eval", "resultaten", `api-${label}-${stamp}`);
await writeFile(basis + ".json", JSON.stringify(uit, null, 1));

// Samenvatting per stem
const md = [`# Regressieset · ${label} · ${fixtureNaam} · ${uit.datum.slice(0, 16)}`, "", `Model ${uit.model}${uit.effort ? " effort " + uit.effort : ""} · promptversie ${uit.beurten.find((b) => b.promptversie)?.promptversie || "?"}`, ""];
for (const stem of stemmen) {
  const b = uit.beurten.filter((x) => x.stem === stem && x.vraag !== "(opening)");
  const avg = (k) => (b.reduce((n, x) => n + (x[k] || 0), 0) / b.length).toFixed(1);
  const kosten = b.reduce((n, x) => n + ((x.usage?.input_tokens || 0) * 2 + (x.usage?.cache_creation_input_tokens || 0) * 4 + (x.usage?.cache_read_input_tokens || 0) * 0.2 + (x.usage?.output_tokens || 0) * 10) / 1e6, 0);
  md.push(`## ${stem}`, "", `| | |`, `|---|---|`,
    `| gem. woorden | ${avg("woorden")} |`, `| > 120 woorden | ${b.filter((x) => x.woorden > 120).length}/${b.length} |`,
    `| gem. zinnen | ${avg("zinnen")} |`, `| marker gehaald | ${b.filter((x) => x.overwegingen > 0).length}/${b.length} |`,
    `| blokhaken in stem | ${b.filter((x) => x.blokhaken).length} |`, `| getallen in stem | ${b.filter((x) => x.getallen.length).length} |`,
    `| soortnamen (klasse-2-check) | ${b.filter((x) => x.soorten.length).length} |`, `| eindigt met vraag | ${b.filter((x) => x.eindigtMetVraag).length}/${b.length} |`,
    `| gem. duur stem | ${avg("duur_ms")} ms |`, `| gem. duur overwegingen | ${avg("duur_overwegingen_ms")} ms |`, `| herkomst per overweging | ${b.reduce((n, x) => n + (x.herkomst || 0), 0)}/${b.reduce((n, x) => n + x.overwegingen, 0)} |`, `| kosten (Sonnet-5-prijzen) | $${kosten.toFixed(3)} |`, "");
  for (const x of b) md.push(`**${x.vraag}**`, "", x.tekst, "", ...(x.overwegingen_tekst || []).map((o) => `- *${o.title}* — ${o.body}`), "");
}
await writeFile(basis + ".md", md.join("\n"));
console.log(`\nresultaat: ${path.relative(ROOT, basis)}.{json,md}`);
