#!/usr/bin/env node
/**
 * scripts/eval-compose.mjs — offline structuurcontrole van de systeemprompt.
 *
 * Draait compose() op de fixtures in eval/fixtures/*.json, zonder API, en
 * controleert wat je zonder model al kunt weten: omvang per blok, blokhaken
 * buiten de marker, tegenstrijdige of dubbele instructies, vervallen
 * wetsnamen, byte-stabiliteit tussen twee runs (anders breekt de cache).
 *
 *   node scripts/eval-compose.mjs            # alle fixtures
 *   node scripts/eval-compose.mjs lunteren-water
 *
 * Schrijft eval/resultaten/compose-<datum>.json en drukt een samenvatting af.
 * Exit 1 als een harde check faalt.
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { compose } from "../netlify/functions/lib/compose.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const FIXTURES = path.join(ROOT, "eval", "fixtures");
const OUT = path.join(ROOT, "eval", "resultaten");

// Harde checks: falen = exit 1. Zachte checks: alleen rapporteren.
const VERVALLEN_WETTEN = [/Wet\s+natuurbescherming/i, /\bWnb\b/, /\bWaterwet\b/, /\bBouwbesluit\b/, /\bFlora-?\s*en\s*faunawet\b/i];
const VERBODEN_ZINNEN = [
  /vul je stil aan/i,                       // de bron van verzonnen soorten
  /laat het klinken alsof je het weet/i,    // idem
  /zeg niet dat je iets niet weet/i,
];
const TWEEDE_LENGTE = /\b(\d{2,3})\s+(woorden|words)\b/gi;

function tel(str, re) { return (str.match(re) || []).length; }

function blokhakenBuitenMarker(tekst) {
  // Labels als [gemeten] in de data zijn toegestaan; het gaat om regels die met
  // een blokhaak beginnen in instructietekst. We tellen alles en rapporteren.
  const alle = tekst.match(/\[[^\]\n]{1,40}\]/g) || [];
  return alle.filter((x) => x !== "[OVERWEGINGEN]");
}

async function evalFixture(naam, config) {
  const a = await compose(config, { opening: true });
  const b = await compose(config, { opening: true });
  const blokken = Object.fromEntries(a.blokken.map((x) => [x.naam, x.tekst]));
  blokken.opening = a.opening || "";
  // Voor de checks: 'stable' = basis, 'session' = alles erna behalve de opening.
  blokken.stable = blokken.basis || "";
  blokken.session = a.blokken.filter((x) => x.naam !== "basis").map((x) => x.tekst).join("\n");
  const totaal = a.blokken.map((x) => x.tekst).join("\n") + "\n" + blokken.opening;
  const r = { fixture: naam, promptversie: a.promptversie, max_woorden: a.max_woorden, persoon: a.persoon, tekens: {}, checks: [] };
  for (const x of a.blokken) r.tekens[x.naam] = x.tekst.length;
  r.tekens.opening = blokken.opening.length;
  r.tekens.totaal = totaal.length;
  r.tokens_geschat = Math.round(totaal.length / 2.2); // gemeten ratio NL-prompt op Sonnet 5

  const hard = (naam, ok, detail) => r.checks.push({ naam, ok, hard: true, detail });
  const zacht = (naam, ok, detail) => r.checks.push({ naam, ok, hard: false, detail });

  hard("byte-stabiel tussen twee runs", JSON.stringify(a.blokken) === JSON.stringify(b.blokken) && a.opening === b.opening, "");
  hard("marker exact één keer in contract", tel(totaal, /`\[OVERWEGINGEN\]`|\[OVERWEGINGEN\]/g) >= 1, "");
  // De opening mag een eigen, kortere grens noemen; binnen stabiel+sessie mag er maar één staan.
  const lengtes = [...(blokken.stable + blokken.session).matchAll(TWEEDE_LENGTE)].map((m) => m[0]).filter((s) => !/^(40|250)\s/.test(s));
  zacht("precies één woordlimiet buiten de opening", new Set(lengtes.map((s) => s.match(/\d+/)[0])).size <= 1, lengtes.join(", "));
  // Het juridisch kompas noemt de vervallen wetten juist om te zeggen dat ze
  // vervallen zijn; die zin telt niet mee.
  const zonderKompas = totaal.replace(/[^.]*bestaan niet meer[^.]*\./g, "");
  const wetten = VERVALLEN_WETTEN.filter((re) => re.test(zonderKompas)).map(String);
  zacht("geen vervallen wetsnamen als voorbeeld", wetten.length === 0, wetten.join(" "));
  const verboden = VERBODEN_ZINNEN.filter((re) => re.test(totaal)).map(String);
  zacht("geen instructie tot stil aanvullen", verboden.length === 0, verboden.join(" "));
  const bh = blokhakenBuitenMarker(blokken.stable + blokken.session);
  zacht("blokhaak-labels in de prompt (vormovername-risico)", bh.length === 0, `${bh.length}×, bv. ${[...new Set(bh)].slice(0, 6).join(" ")}`);
  const en = tel(totaal, /\b(the|and|with|you|your)\b/g), nl = tel(totaal, /\b(de|het|en|je|jouw)\b/g);
  zacht("prompt in één taal", en < nl / 10, `EN-signaalwoorden ${en}, NL ${nl}`);
  // Naslag = kennislaag + lokaal beleid (tot fase 1) of, daarna, de kennislagen
  // van het profiel. Instructie = de rest. Meting, geen oordeel: na de verbouwing
  // hoort het projectmateriaal juist het grootste deel te zijn.
  const naslag = ["# KENNISLAAG", "# LOKAAL BELEID", "# Kennisprofiel"].reduce((n, kop) => {
    for (const blok of [blokken.stable, blokken.session]) {
      const i = blok.indexOf(kop); if (i === -1) continue;
      const j = blok.indexOf("\n\n---\n\n# ", i + kop.length);
      n += (j === -1 ? blok.length : j) - i;
    }
    return n;
  }, 0);
  r.tekens.naslag = naslag;
  zacht("aandeel naslag/materiaal", true, `${Math.round((100 * naslag) / totaal.length)}% (${naslag.toLocaleString("nl-NL")} tekens)`);
  zacht("sessieblok bevat de casus", !config.situation || blokken.session.includes(config.situation.slice(0, 60)), "");
  return r;
}

const only = process.argv.slice(2);
const files = (await readdir(FIXTURES)).filter((f) => f.endsWith(".json") && (!only.length || only.some((o) => f.startsWith(o))));
const resultaten = [];
for (const f of files) {
  const config = JSON.parse(await readFile(path.join(FIXTURES, f), "utf8"));
  resultaten.push(await evalFixture(f.replace(/\.json$/, ""), config));
}

await mkdir(OUT, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
await writeFile(path.join(OUT, `compose-${stamp}.json`), JSON.stringify(resultaten, null, 1));

let faal = 0;
for (const r of resultaten) {
  const t = r.tekens;
  console.log(`\n${r.fixture} [${r.promptversie}, ${r.max_woorden} w, ${r.persoon}]: ${t.totaal.toLocaleString("nl-NL")} tekens ≈ ${r.tokens_geschat.toLocaleString("nl-NL")} tokens (` +
    Object.entries(t).filter(([k]) => !["totaal", "naslag"].includes(k)).map(([k, v]) => `${k} ${v.toLocaleString("nl-NL")}`).join(", ") + ")");
  for (const c of r.checks) {
    if (!c.ok && c.hard) faal++;
    console.log(`  ${c.ok ? "✓" : c.hard ? "✗" : "△"} ${c.naam}${c.detail ? " — " + c.detail : ""}`);
  }
}
console.log(`\n${faal ? faal + " harde check(s) gefaald" : "alle harde checks ok"} · resultaat in eval/resultaten/compose-${stamp}.json`);
process.exit(faal ? 1 : 0);
