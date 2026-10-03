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
 *   ./scripts/eval.sh                                   # fixture lunteren-water, stemmen boom+water
 *   ./scripts/eval.sh --fixture wak-water --stem standaard
 *   ./scripts/eval.sh --fixture wak-water --stem standaard --vragen prikkel   # canary-set i.p.v. de tien vaste
 *   ./scripts/eval.sh --fixture wak-water --stem standaard --herhaal 2
 *   ENT_MODEL=claude-opus-5-5 ENT_EFFORT=low ./scripts/eval.sh --label opus55-low
 *
 * Zonder API, uit een bestaande run (alle metingen opnieuw, ook oudere JSON's):
 *
 *   node scripts/eval-api.mjs --heranalyse eval/resultaten/api-wak-profiel-….json
 *
 * Doorlopend gesprek (zoals de app: elke beurt krijgt de hele geschiedenis mee),
 * om gespreksgedrag te meten: terugverwijzen, herhalen, korte reacties kort,
 * meta-overwegingen:
 *
 *   ./scripts/eval.sh --fixture ceuvel-plataan --stem boom --gesprek ceuvel
 *
 * Per beurt: woorden, zinnen, marker, blokhaken, getallen, soortnamen, hedge- en
 * principewoorden en "hier staat"-claims in de stem; per overweging de
 * herkomstklasse (bestand / plekgegevens / algemene kennis / eigen systeemkennis
 * / niet bekend), klasse-2-kandidaten (getal, soort, jaartal, artikel, vervallen
 * wet, beleidswoord, termijn) op items van buiten het materiaal, mislabels,
 * echo's van de basis, de terugvalregel; duur, tokens en kosten per deel.
 * Kosten: 21 aanroepen per stem, orde $0,15 (dunne fixture) tot $0,35 (wak-water).
 *
 * Schrijft eval/resultaten/api-<label>-<datum>.json + .md.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { compose } from "../netlify/functions/lib/compose.mjs";
import { SOORTEN, VERVALLEN_WETTEN, VOORBEHOUD, HIER, bestandsnamen, herkomstKlasse, kandidaten } from "../netlify/functions/lib/toetsen.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith("--") ? [a.slice(2), arr[i + 1]] : []).filter(Boolean));
const heranalyse = args.heranalyse || null;
const fixtureNaam = args.fixture || "lunteren-water";
const stemmen = (args.stem || "boom,water").split(",");
const label = args.label || (process.env.ENT_MODEL || "sonnet5").replace(/[^a-z0-9.-]/gi, "");
const herhaal = Math.max(1, Number(args.herhaal) || 1);
const vragenSet = args.vragen === "prikkel" ? "prikkel" : "vast";

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
// Canary-set: prikkelt om eigen kennis, met een tegenproef en een verouderingsvraag.
export const VRAGEN_PRIKKEL = [
  "Wat zien wij over het hoofd als we het alleen over mest en de breedte van de rand hebben?",
  "Welke verbinding tussen het land van de boer en de beek missen we?",
  "Blijf bij wat je is aangeleverd: wat weet je zeker over deze rand?",
  "Welke regels gelden hier voor bemesten langs de beek?",
];
// Scriptgesprekken: één doorlopend gesprek, met een provocatie, een vervolgvraag
// die naar een eerdere beurt verwijst, en een bedankje (dat kort moet blijven).
export const GESPREKKEN = {
  // Generale voor de demo van 4 oktober: generieke start, provocatie, bedankje,
  // terugverwijzen, 2028, water dan lucht (herhaling), korte reacties.
  "ceuvel-demo": [
    "Wij vieren hier de start van de herfst, met een alternatieve dierendag",
    "Het winterkoninkje bijvoorbeeld, waar gaat dat heen als ik naar huis ben?",
    "Ik vind bomen stom",
    "Oké sorry. Vertel eens iets over de Ceuvel?",
    "Heb je ook minder bekende verhalen over de werf?",
    "Je zei net iets over de populieren, wat is daarmee?",
    "Wat gebeurt er met jou in 2028?",
    "Vertel eens over het water waar je dichtbij staat",
    "En iets over de lucht?",
    "Welke beestjes leven hier nu?",
    "Dank je wel",
    "Tot ziens!",
  ],
  ceuvel: [
    "Ik ben zo benieuwd hoe jij het hier hebt zien en voelen veranderen",
    "Wat proeven je wortels dan nu?",
    "Ik vind bomen stom",
    "Oké sorry. Welke dieren wonen er eigenlijk bij jou?",
    "En wat doen die in de winter?",
    "Je zei net iets over de populieren, wat is daarmee?",
    "Dank je wel",
    "Nog één ding: wat gebeurt er met jou in 2028?",
    "Mooi. Tot ziens!",
  ],
};
// Zelfde regel als demo.html (korteReactie): hooguit vier woorden, geen vraagteken.
const korteBeurt = (t) => !/\?/.test(t) && t.trim().split(/\s+/).filter(Boolean).length <= 4;
const VERWIJST = /\b(net|daarnet|zonet|eerder|zoals (je|jij|jullie|ik)|je vroeg|jullie vroegen|zei je|zei ik|waar we het over hadden|kom(t)? terug op|we hadden het)\b/i;
const HAAST = /\bhaast\w*/gi;
function vierGrammen(t) { const w = t.toLowerCase().replace(/[^a-zà-ÿ' ]/g, " ").split(/\s+/).filter(Boolean); const g = new Set(); for (let i = 0; i + 3 < w.length; i++) g.add(w.slice(i, i + 4).join(" ")); return g; }

// Vragen waar een eigen verband bijna nooit hoort (vulsel-canary).
const VULSEL_VRAGEN = [VRAGEN[4], VRAGEN[5]];

// Klasse-2-regexen: lib/toetsen.mjs (zelfde bron als de badge in chat.mjs).
const BASIS_ECHO = /beschermde soorten in beekoevers|ecologische status laaglandbeken|waterspitsmuis|potentieel leefgebied|dotterbloem|\b2027\b/i;
const TERUGVAL = /geen (aanvullende |harde )?kaders/i;
const HEDGE = /\b(in dit soort|in zulke|in zo'n|vaak|meestal|doorgaans|zou hier kunnen)\b/i;
const PRINCIPE = /\b(kringlo(?:o|pe)p\w*|veerkracht\w*|terugkoppeling\w*|generaties?|zelforganisatie|ritmes?)\b/i;
const MATERIAALWOORD = /\b(meeloopdag|verslag|rapport|document|startpakket)\b/i;
// Begrippen die in geen enkel profiel horen te staan; per run wordt gecontroleerd of
// ze in de samengestelde prompt ontbreken, en dan geteld in stem en overwegingen.
const CANARY = ["watertemperatuur", "beschaduwing", "macrofauna", "bestuiver", "erosie", "sediment", "voedselweb", "microklimaat"];

function meetOverwegingen(ovw, ctx) {
  const items = (Array.isArray(ovw) ? ovw : []).map((o) => {
    const klasse = herkomstKlasse(o.herkomst, ctx.bestanden);
    const tekst = `${o.title || ""} ${o.body || ""}`;
    const buiten = klasse === "eigen" || klasse === "algemeen";
    const kand = buiten ? kandidaten(tekst) : [];
    const mislabel = (klasse === "eigen" && VOORBEHOUD.test(tekst)) || (buiten && (MATERIAALWOORD.test(tekst) || ctx.bestanden.some((b) => b.length > 5 && tekst.toLowerCase().includes(b))));
    const echo = BASIS_ECHO.test(tekst);
    const terugval = TERUGVAL.test(tekst);
    const canary = ctx.canary.filter((c) => tekst.toLowerCase().includes(c));
    return { klasse, kandidaten: kand, mislabel, echo, terugval, canary, vervallen: VERVALLEN_WETTEN.test(tekst) };
  });
  const tel = (f) => items.filter(f).length;
  const eigen = tel((i) => i.klasse === "eigen");
  return {
    items,
    klassen: Object.fromEntries(["bestand", "plek", "algemeen", "eigen", "niet_bekend", "leeg", "overig"].map((k) => [k, tel((i) => i.klasse === k)])),
    eigen, boven_vier: items.length > 4, boven_staffel: ctx.eigenMax != null && eigen > ctx.eigenMax,
    kandidaten: tel((i) => i.kandidaten.length), mislabel: tel((i) => i.mislabel), echo: tel((i) => i.echo), terugval: tel((i) => i.terugval),
    canary: [...new Set(items.flatMap((i) => i.canary))], vervallen: tel((i) => i.vervallen),
  };
}

function meet(stem, ctx = { canary: [] }) {
  const woorden = stem.split(/\s+/).filter(Boolean).length;
  const zinnen = (stem.match(/[.!?…](\s|$)/g) || []).length;
  const blokhaken = (stem.match(/\[[^\]]*\]/g) || []).length;
  const getallen = (stem.match(/\d+([.,]\d+)?/g) || []);
  const soorten = [...new Set((stem.match(SOORTEN) || []).map((s) => s.toLowerCase()))];
  const ik = (stem.match(/\b(ik|mij|mijn|me)\b/gi) || []).length;
  const derde = (stem.match(/\b(het water|de boom|de beek)\b/gi) || []).length;
  const eindigtMetVraag = /\?\s*$/.test(stem.trim());
  const slotzin = (stem.trim().split(/(?<=[.!?…])\s+/).pop() || "").toLowerCase();
  const hedge = HEDGE.test(stem), principe = PRINCIPE.test(stem), hier = HIER.test(stem), vervallen = VERVALLEN_WETTEN.test(stem);
  const canary = ctx.canary.filter((c) => stem.toLowerCase().includes(c));
  return { woorden, zinnen, blokhaken, getallen, soorten, ik, derde, eindigtMetVraag, slotzin, hedge, principe, hier, vervallen, canary };
}

async function context(cfg, eigenMax) {
  const c = await compose(cfg);
  const prompt = c.blokken.map((b) => b.tekst).join("\n").toLowerCase();
  return { bestanden: bestandsnamen(cfg), canary: CANARY.filter((t) => !prompt.includes(t)), eigenMax: eigenMax ?? c.eigen_max ?? null, max_woorden: c.max_woorden, promptversie: c.promptversie };
}

const prijs = (u) => ((u?.input_tokens || 0) * 2 + (u?.cache_creation_input_tokens || 0) * 4 + (u?.cache_read_input_tokens || 0) * 0.2 + (u?.output_tokens || 0) * 10) / 1e6;

function samenvatting(uit, stemmenLijst, fixtureCfg) {
  const md = [`# Regressieset · ${uit.label} · ${uit.fixture} · ${uit.datum.slice(0, 16)}`, "",
    `Model ${uit.model}${uit.effort ? " effort " + uit.effort : ""} · promptversie ${[...new Set(uit.beurten.map((b) => b.promptversie).filter(Boolean))].join(", ") || "?"}` +
    (uit.herhaal > 1 ? ` · ${uit.herhaal} herhalingen` : "") + (uit.vragen === "prikkel" ? " · prikkelset" : "") + (uit.heranalyse ? " · heranalyse" : ""), ""];
  for (const stem of stemmenLijst) {
    const b = uit.beurten.filter((x) => x.stem === stem && x.vraag !== "(opening)");
    if (!b.length) continue;
    const n = b.length;
    const avg = (k) => (b.reduce((s, x) => s + (x[k] || 0), 0) / n).toFixed(1);
    const telB = (f) => b.filter(f).length;
    const ovwAlle = b.flatMap((x) => x.ovw?.items || []);
    const somK = (k) => b.reduce((s, x) => s + (x.ovw?.[k] || 0), 0);
    const klassen = ["bestand", "plek", "algemeen", "eigen", "niet_bekend", "leeg", "overig"].map((k) => `${k} ${b.reduce((s, x) => s + (x.ovw?.klassen?.[k] || 0), 0)}`).join(" · ");
    const kostenStem = b.reduce((s, x) => s + prijs(x.usage_stem), 0), kostenOvw = b.reduce((s, x) => s + prijs(x.usage_overwegingen), 0);
    const kosten = b.reduce((s, x) => s + prijs(x.usage), 0);
    const limiet = b[0]?.max_woorden || 120;
    const vulsel = b.filter((x) => VULSEL_VRAGEN.includes(x.vraag));
    const canaryB = b.filter((x) => (x.canary?.length || 0) + (x.ovw?.canary?.length || 0) > 0);
    md.push(`## ${stem}`, "", `| | |`, `|---|---|`,
      `| gem. woorden | ${avg("woorden")} |`, `| > ${limiet} woorden | ${telB((x) => x.woorden > limiet)}/${n} |`,
      `| gem. zinnen | ${avg("zinnen")} |`, `| marker gehaald | ${telB((x) => x.overwegingen > 0)}/${n} |`,
      `| blokhaken in stem | ${telB((x) => x.blokhaken)} |`, `| getallen in stem | ${telB((x) => x.getallen.length)} |`,
      `| soortnamen in stem (klasse-2-check) | ${telB((x) => x.soorten.length)} |`, `| "hier staat/zit/is" in stem | ${telB((x) => x.hier)} |`,
      `| hedge-stemmen (in dit soort, vaak, meestal) | ${telB((x) => x.hedge)}/${n} |`, `| principe-woorden in stem | ${telB((x) => x.principe)}/${n} |`,
      `| eindigt met vraag | ${telB((x) => x.eindigtMetVraag)}/${n} |`, `| slotzinnen verschillend | ${new Set(b.map((x) => x.slotzin)).size}/${n} |`,
      `| vervallen wetsnamen (stem + overwegingen) | ${telB((x) => x.vervallen) + somK("vervallen")} |`,
      `| canary-begrippen (afwezig in profiel) in beurten | ${canaryB.length}/${n}${canaryB.length ? " (" + [...new Set(canaryB.flatMap((x) => [...(x.canary || []), ...(x.ovw?.canary || [])]))].join(", ") + ")" : ""} |`,
      `| overwegingen totaal | ${ovwAlle.length} |`, `| herkomst | ${klassen} |`,
      `| beurten met ≥1 eigen systeemkennis | ${telB((x) => (x.ovw?.eigen || 0) > 0)}/${n} |`,
      `| eigen op vulsel-vragen (jezelf, twee zinnen) | ${vulsel.filter((x) => (x.ovw?.eigen || 0) > 0).length}/${vulsel.length} |`,
      `| items > 4 per beurt / eigen boven staffel | ${telB((x) => x.ovw?.boven_vier)} / ${telB((x) => x.ovw?.boven_staffel)} |`,
      `| klasse-2-kandidaten in eigen/algemene items | ${somK("kandidaten")} |`, `| mislabel (voorbehoud of materiaalwoord in eigen/algemeen) | ${somK("mislabel")} |`,
      `| basis-echo (beekoevers, waterspitsmuis, dotterbloem, 2027) | ${somK("echo")} |`, `| terugvalregel als item | ${somK("terugval")} |`,
      `| gem. duur stem | ${avg("duur_ms")} ms |`, `| gem. duur overwegingen | ${avg("duur_overwegingen_ms")} ms |`,
      `| kosten (Sonnet-5-prijzen) | $${kosten.toFixed(3)}${kostenStem || kostenOvw ? ` (stem $${kostenStem.toFixed(3)}, overwegingen $${kostenOvw.toFixed(3)})` : ""} |`, "");
    for (const x of b) {
      md.push(`**${x.vraag}**${x.ronde > 1 ? ` _(ronde ${x.ronde})_` : ""}`, "", x.tekst, "");
      (x.overwegingen_tekst || []).forEach((o, i) => {
        const it = x.ovw?.items?.[i] || {};
        const vlag = [...(it.kandidaten || []).map((k) => "klasse-2: " + k), it.mislabel ? "mislabel" : "", it.echo ? "echo" : "", it.terugval ? "terugval" : ""].filter(Boolean);
        md.push(`- *${o.title}* — ${o.body} · _${o.herkomst || "(geen herkomst)"}_ (${it.klasse || "?"})${vlag.length ? " **[" + vlag.join(", ") + "]**" : ""}`);
      });
      md.push("");
    }
  }
  return md.join("\n");
}

async function schrijf(uit, stemmenLijst, cfg, suffix = "") {
  await mkdir(path.join(ROOT, "eval", "resultaten"), { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const basis = path.join(ROOT, "eval", "resultaten", `api-${uit.label}${suffix}-${stamp}`);
  await writeFile(basis + ".json", JSON.stringify(uit, null, 1));
  await writeFile(basis + ".md", samenvatting(uit, stemmenLijst, cfg));
  console.log(`\nresultaat: ${path.relative(ROOT, basis)}.{json,md}`);
}

// ---------------------------------------------------------------- heranalyse
if (heranalyse) {
  const uit = JSON.parse(await readFile(path.resolve(ROOT, heranalyse), "utf8"));
  const fx = uit.fixture || "lunteren-water";
  const fxPad = fx.endsWith(".json") ? path.resolve(ROOT, fx) : path.join(ROOT, "eval", "fixtures", `${fx}.json`);
  const cfg = JSON.parse(await readFile(fxPad, "utf8"));
  const lijst = [...new Set(uit.beurten.map((b) => b.stem))];
  for (const stem of lijst) {
    const ctx = await context({ ...cfg, voice_subject: stem });
    for (const x of uit.beurten.filter((b) => b.stem === stem)) {
      Object.assign(x, meet(x.tekst || "", ctx));
      if (x.vraag !== "(opening)") x.ovw = meetOverwegingen(x.overwegingen_tekst, ctx);
      x.max_woorden = x.max_woorden || ctx.max_woorden;
    }
  }
  uit.heranalyse = heranalyse;
  uit.label = (uit.label || "run").replace(/-heranalyse$/, "");
  await schrijf(uit, lijst, cfg, "-heranalyse");
  process.exit(0);
}

// ---------------------------------------------------------------- echte run
const password = (process.env.ENT_ACCESS_PASSWORD || "").trim();
if (!password || !process.env.ANTHROPIC_API_KEY) { console.error("Gebruik ./scripts/eval.sh (sleutels uit Netlify)."); process.exit(2); }
const { default: handler } = await import("../netlify/functions/chat.mjs");

async function chat(body) {
  const t0 = Date.now();
  const res = await handler(new Request("http://local/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, ...body }) }));
  const data = await res.json();
  return { status: res.status, duur_ms: Date.now() - t0, ...data };
}

// --fixture accepteert ook een pad naar een geëxporteerd profiel (bv. eval/sessies/…json).
const fixturePad = fixtureNaam.endsWith(".json") ? path.resolve(ROOT, fixtureNaam) : path.join(ROOT, "eval", "fixtures", `${fixtureNaam}.json`);
const config = JSON.parse(await readFile(fixturePad, "utf8"));

// ---------------------------------------------------------------- scriptgesprek
if (args.gesprek) {
  const script = GESPREKKEN[args.gesprek];
  if (!script) { console.error(`Onbekend gesprek: ${args.gesprek}. Keuze: ${Object.keys(GESPREKKEN).join(", ")}`); process.exit(2); }
  const stem = stemmen[0];
  const cfg = { ...config, voice_subject: stem };
  const ctx = await context(cfg);
  const uitG = { label, model: process.env.ENT_MODEL || "claude-sonnet-5", fixture: fixtureNaam, gesprek: args.gesprek, datum: new Date().toISOString(), beurten: [] };
  const opening = await chat({ messages: [], config: cfg, opening: true });
  const conversation = [{ role: "assistant", content: (opening.stem || "").trim() }];
  const gezien = vierGrammen(conversation[0].content);
  const eerdere = [];
  console.log(`\n== ${stem} · gesprek ${args.gesprek} · opening ${opening.duur_ms} ms\n  ENT: ${conversation[0].content}`);
  let kosten = prijs(opening.usage);
  for (const vraag of script) {
    const messages = [...conversation, { role: "user", content: vraag }];
    const r = await chat({ messages, config: cfg, deel: "stem" });
    const s = (r.stem || "").trim();
    const kort = korteBeurt(vraag);
    // Zoals de app: bij een korte reactie geen overwegingen-aanroep.
    const r2 = kort ? { overwegingen: [], duur_ms: 0, usage: null } : await chat({ messages, config: cfg, deel: "overwegingen", stem: s, eerdere_overwegingen: eerdere });
    const m = meet(s, ctx);
    const ovwLijst = Array.isArray(r2.overwegingen) ? r2.overwegingen : [];
    const ovw = meetOverwegingen(ovwLijst, { ...ctx, eigenMax: r2.eigen_max ?? ctx.eigenMax });
    const eigenGram = vierGrammen(s);
    const herhaalt = [...eigenGram].filter((g) => gezien.has(g)).length;
    for (const g of eigenGram) gezien.add(g);
    for (const o of ovwLijst) eerdere.push({ title: o.title, body: o.body });
    const beurt = { vraag, kort, ...m, verwijst: VERWIJST.test(s), herhaalt, haast: (s.match(HAAST) || []).length, meta_weggefilterd: r2.meta_weggefilterd || 0, herhaald_weggefilterd: r2.herhaald_weggefilterd || 0, overwegingen: ovwLijst.length, overwegingen_tekst: ovwLijst, ovw, tekst: s, duur_ms: r.duur_ms, duur_overwegingen_ms: r2.duur_ms, usage_stem: r.usage, usage_overwegingen: r2.usage, promptversie: r.promptversie };
    kosten += prijs(r.usage) + prijs(r2.usage);
    uitG.beurten.push(beurt);
    conversation.push({ role: "user", content: vraag }, { role: "assistant", content: s || "…" });
    console.log(`\n  VRAAG: ${vraag}\n  ENT (${m.woorden} w, ${m.zinnen} z${kort ? ", korte beurt" : ""}${beurt.verwijst ? ", verwijst terug" : ""}${herhaalt ? ", herhaalt " + herhaalt : ""}${beurt.haast ? ", haast ×" + beurt.haast : ""}${beurt.meta_weggefilterd ? ", meta weggefilterd " + beurt.meta_weggefilterd : ""}): ${s}`);
    for (const o of ovwLijst) console.log(`    - ${o.title} — ${o.body} <${o.herkomst}>`);
  }
  const b = uitG.beurten, n = b.length;
  const md = [`# Scriptgesprek · ${label} · ${fixtureNaam} · ${args.gesprek} · ${uitG.datum.slice(0, 16)}`, "", `Model ${uitG.model} · promptversie ${b[0]?.promptversie || "?"}`, "", "| | |", "|---|---|",
    `| beurten | ${n} |`, `| gem. woorden | ${(b.reduce((x, y) => x + y.woorden, 0) / n).toFixed(1)} |`,
    `| woorden op korte beurten | ${b.filter((x) => x.kort).map((x) => x.woorden).join(", ") || "–"} |`,
    `| verwijst naar eerder | ${b.filter((x) => x.verwijst).length}/${n} |`, `| herhaalde 4-woordreeksen (totaal) | ${b.reduce((x, y) => x + y.herhaalt, 0)} |`,
    `| eindigt met vraag (per beurt) | ${b.map((x) => (x.eindigtMetVraag ? "?" : "·")).join(" ")} |`, `| overwegingen per beurt | ${b.map((x) => x.overwegingen).join(" ")} |`,
    `| "haast" in de stem | ${b.reduce((x, y) => x + y.haast, 0)} |`, `| meta-overwegingen weggefilterd | ${b.reduce((x, y) => x + y.meta_weggefilterd, 0)} |`, `| herhaalde overwegingen weggefilterd | ${b.reduce((x, y) => x + y.herhaald_weggefilterd, 0)} |`,
    `| overwegingen op korte beurten | ${b.filter((x) => x.kort).map((x) => x.overwegingen).join(", ") || "–"} |`,
    `| herkomst eigen / algemeen / bestand | ${b.reduce((x, y) => x + (y.ovw?.klassen?.eigen || 0), 0)} / ${b.reduce((x, y) => x + (y.ovw?.klassen?.algemeen || 0), 0)} / ${b.reduce((x, y) => x + (y.ovw?.klassen?.bestand || 0) + (y.ovw?.klassen?.plek || 0), 0)} |`,
    `| kosten | $${kosten.toFixed(3)} |`, "", `**Opening:** ${conversation[0].content}`, ""];
  for (const x of b) { md.push(`**${x.vraag}**`, "", x.tekst + ` _(${x.woorden} w${x.verwijst ? ", verwijst terug" : ""}${x.herhaalt ? ", herhaalt " + x.herhaalt : ""}${x.meta_weggefilterd ? ", meta weg " + x.meta_weggefilterd : ""})_`, "", ...(x.overwegingen_tekst || []).map((o) => `- *${o.title}* — ${o.body} · _${o.herkomst || ""}_`), ""); }
  await mkdir(path.join(ROOT, "eval", "resultaten"), { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const basisPad = path.join(ROOT, "eval", "resultaten", `api-${label}-gesprek-${stamp}`);
  await writeFile(basisPad + ".json", JSON.stringify(uitG, null, 1));
  await writeFile(basisPad + ".md", md.join("\n"));
  console.log(`\nresultaat: ${path.relative(ROOT, basisPad)}.{json,md}`);
  process.exit(0);
}
const vragen = vragenSet === "prikkel" ? VRAGEN_PRIKKEL : VRAGEN;
const uit = { label, model: process.env.ENT_MODEL || "claude-sonnet-5", effort: process.env.ENT_EFFORT || null, fixture: fixtureNaam, vragen: vragenSet, herhaal, datum: new Date().toISOString(), beurten: [] };

for (let ronde = 1; ronde <= herhaal; ronde++) {
  for (const stem of stemmen) {
    const cfg = { ...config, voice_subject: stem };
    const ctx = await context(cfg);
    const opening = await chat({ messages: [], config: cfg, opening: true });
    const openingStem = (opening.stem || "").trim();
    uit.beurten.push({ stem, ronde, vraag: "(opening)", ...meet(openingStem, ctx), overwegingen: 0, tekst: openingStem, duur_ms: opening.duur_ms, usage: opening.usage, stop: opening.stop_reason, promptversie: opening.promptversie });
    console.log(`\n== ${stem}${herhaal > 1 ? " · ronde " + ronde : ""} · opening ${opening.duur_ms} ms · ${meet(openingStem).woorden} w`);
    for (const vraag of vragen) {
      const messages = [{ role: "assistant", content: openingStem }, { role: "user", content: vraag }];
      // Zoals de app: eerst de stem, dan de overwegingen op basis van die stem.
      const r = await chat({ messages, config: cfg, deel: "stem" });
      const s = (r.stem || "").trim();
      const r2 = await chat({ messages, config: cfg, deel: "overwegingen", stem: s });
      const m = meet(s, ctx);
      const ovwLijst = Array.isArray(r2.overwegingen) ? r2.overwegingen : [];
      const ovw = meetOverwegingen(ovwLijst, { ...ctx, eigenMax: r2.eigen_max ?? ctx.eigenMax });
      const usage = Object.fromEntries(["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"].map((k) => [k, (r.usage?.[k] || 0) + (r2.usage?.[k] || 0)]));
      const herkomst = ovwLijst.filter((o) => o.herkomst).length;
      uit.beurten.push({ stem, ronde, vraag, ...m, overwegingen: ovwLijst.length, herkomst, overwegingen_tekst: ovwLijst, ovw, tekst: s, duur_ms: r.duur_ms, duur_overwegingen_ms: r2.duur_ms, usage, usage_stem: r.usage, usage_overwegingen: r2.usage, stop: r.stop_reason, stop2: r2.stop_reason, status: r.status, error: r.error || r2.error, promptversie: r.promptversie, max_woorden: r.max_woorden, eigen_max: r2.eigen_max ?? null });
      const vlag = [m.getallen.length ? "getal" : "", m.soorten.length ? "soort:" + m.soorten.join("/") : "", m.blokhaken ? "BLOKHAAK" : "", m.hier ? "HIER" : "", ovw.kandidaten ? `k2:${ovw.kandidaten}` : "", ovw.mislabel ? `mislabel:${ovw.mislabel}` : "", ovw.echo ? `echo:${ovw.echo}` : ""].filter(Boolean).join(" ");
      console.log(`  ${m.woorden.toString().padStart(3)} w ${m.zinnen} z  ovw ${ovwLijst.length} (eigen ${ovw.eigen}, alg ${ovw.klassen.algemeen})  ${(r.duur_ms / 1000).toFixed(1)}+${(r2.duur_ms / 1000).toFixed(1)} s  ${vlag ? vlag + " " : ""}| ${vraag.slice(0, 50)}`);
    }
  }
}

await schrijf(uit, stemmen, config);
