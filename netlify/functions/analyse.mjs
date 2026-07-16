/**
 * netlify/functions/analyse.mjs  →  GET /api/analyse
 *
 * Hyperlokale systeemscan (Fase 2c, v1): geocodeer een locatie, bepaal een
 * onderzoeksgebied en bevraag parallel enkele open bronnen (PDOK Locatieserver,
 * AHN, Natura 2000). Levert een compact, genormaliseerd systeemprofiel.
 *
 * Bewust simpel: live queries + graceful degradation. Eén trage/ontbrekende bron
 * blokkeert de analyse niet; die wordt als data_gap gerapporteerd. Bodem,
 * grondwater en klimaat volgen zodra hun bron in data/bronnen.json is ingevuld
 * (bodem/grondwater) of via het download-pad (klimaat, v2).
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { geocode, lookupById, ahnHeight, wfsIntersect, wmsPointInfo } from "./lib/geo.mjs";
import { bepaalOnderzoeksgebied, reliefIndicatie, bouwProfiel } from "./lib/systeemprofiel.mjs";

const TODAY = () => new Date().toISOString().slice(0, 10);
const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });

function resolveRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url)); // .../netlify/functions
  for (const base of [process.cwd(), path.resolve(here, "../.."), path.resolve(here, "..")]) {
    if (existsSync(path.join(base, "data", "bronnen.json"))) return base;
  }
  return process.cwd();
}
const ROOT = resolveRoot();

let _bronnen = null;
async function bronnen() {
  if (_bronnen) return _bronnen;
  try {
    _bronnen = JSON.parse(await readFile(path.join(ROOT, "data", "bronnen.json"), "utf8"));
  } catch {
    _bronnen = { version: "onbekend", sources: {} };
  }
  return _bronnen;
}

/** Voer een bronfunctie uit met foutafvang; registreer provenance of data_gap. */
async function safe(label, fn, { provenance, data_gaps, meta }) {
  const t = Date.now();
  try {
    const v = await fn();
    meta[label] = Date.now() - t;
    return v;
  } catch (e) {
    meta[label] = Date.now() - t;
    data_gaps.push(`${label} (niet opgehaald: ${e.name === "AbortError" ? "time-out" : "fout"})`);
    return null;
  }
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const locationText = (url.searchParams.get("location") || "").trim();
  const idParam = (url.searchParams.get("id") || "").trim(); // PDOK Locatieserver-id (exact)
  const rdParam = url.searchParams.get("rd"); // "x,y"
  if (!locationText && !idParam && !rdParam) return json({ error: "location, id of rd vereist" }, 400);

  const cfg = await bronnen();
  const S = cfg.sources || {};
  const meta = {};
  const provenance = [];
  const data_gaps = [];
  const uncertainties = [];
  const t0 = Date.now();

  // 1) Geocoding + administratieve context
  const lsUrl = S.locatieserver?.url || "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
  const lookupUrl = lsUrl.replace(/\/free\/?$/, "/lookup");
  let geo = null;
  if (rdParam) {
    const [x, y] = rdParam.split(",").map((n) => parseFloat(n));
    if (Number.isFinite(x) && Number.isFinite(y)) geo = { weergavenaam: `RD ${x}, ${y}`, rd: { x, y }, ll: null };
  }
  // Voorkeur: exact id uit de autocomplete (ondubbelzinnig). Anders vrije tekst.
  if (!geo && idParam) {
    geo = await safe("geocoding", () => lookupById(idParam, { url: lookupUrl, timeoutMs: 3000 }), { provenance, data_gaps, meta });
    if (geo) provenance.push({ dataset: S.locatieserver?.dataset || "PDOK Locatieserver", retrieved: TODAY() });
  }
  if (!geo && locationText) {
    geo = await safe("geocoding", () => geocode(locationText, { url: lsUrl, timeoutMs: 3000 }), { provenance, data_gaps, meta });
    if (geo) provenance.push({ dataset: S.locatieserver?.dataset || "PDOK Locatieserver", retrieved: TODAY() });
  }
  if (!geo || !geo.rd) {
    return json({ error: "Locatie niet gevonden of geen coördinaat", meta }, 200);
  }
  const rd = geo.rd;

  // 2) Onderzoeksgebied
  const gebied = bepaalOnderzoeksgebied(locationText || geo.weergavenaam || geo.gemeente || "");

  // 3) Parallelle bronnen (graceful degradation)
  // health volgt of een bron *haperde* (koude/trage WMS) i.p.v. legitiem leeg
  // was — dat bepaalt of we het resultaat lang mogen cachen (zie stap 5).
  const health = { bodemOk: true };
  const [terrain, natura2000, soil] = await Promise.all([
    // AHN: punt + vier buren (±50 m) → reliëf-indicatie
    (async () => {
      if (!S.ahn?.wms) { data_gaps.push("terrain (AHN niet geconfigureerd)"); return {}; }
      const off = 50;
      const pts = [rd, { x: rd.x, y: rd.y + off }, { x: rd.x + off, y: rd.y }, { x: rd.x, y: rd.y - off }, { x: rd.x - off, y: rd.y }];
      // Tight sampling bbox: AHN is 0,5 m, so a small bbox samples a real cell.
      // The DTM (maaiveld) is no-data under buildings, so the address centroid
      // can miss — in that case use the neighbour heights (±50 m) as the base.
      const hs = await safe("terrain", () => Promise.all(pts.map((p) => ahnHeight(S.ahn, p, { timeoutMs: 3000, half: 1 }))), { provenance, data_gaps, meta });
      if (!hs) return {};
      const center = hs[0];
      const neighbours = hs.slice(1).filter((v) => Number.isFinite(v));
      const base = Number.isFinite(center)
        ? center
        : (neighbours.length ? neighbours.reduce((a, b) => a + b, 0) / neighbours.length : null);
      if (base == null) return {};
      provenance.push({ dataset: S.ahn.dataset, retrieved: TODAY() });
      const relief = reliefIndicatie(Number.isFinite(center) ? center : base, neighbours);
      return { hoogte_nap_m: +base.toFixed(2), relief: relief || undefined };
    })(),
    // Natura 2000 punt-intersectie
    (async () => {
      if (!S.natura2000?.wfs) { data_gaps.push("protected_areas (Natura2000 niet geconfigureerd)"); return null; }
      const p = await safe("natura2000", () => wfsIntersect(S.natura2000, rd, { timeoutMs: 3000 }), { provenance, data_gaps, meta });
      provenance.push({ dataset: S.natura2000.dataset, retrieved: TODAY() });
      if (!p) return { in_gebied: false };
      return { in_gebied: true, naam: p[S.natura2000.naamProperty] || p.naamN2K || null, nr: p.nr ?? null };
    })(),
    // BRO Bodemkaart → bodemtype + bodemnaam. De kaart karteert geen bebouwing,
    // dus het adrespunt valt vaak op een pand zonder bodemvlak. Sample daarom
    // centrum + een ring eromheen en neem het dominante bodemtype uit de directe
    // omgeving (zoals de buurpunt-terugval bij AHN).
    (async () => {
      if (!S.bodemkaart?.wms || !S.bodemkaart?.layer) return {};
      const codeProp = S.bodemkaart.codeProperty || "soilcode";
      const naamProp = S.bodemkaart.naamProperty || "first_soilname";
      const r1 = 30, r2 = 60;
      const ring = [
        [0, 0],
        [0, r1], [r1, 0], [0, -r1], [-r1, 0],
        [r1, r1], [r1, -r1], [-r1, r1], [-r1, -r1],
        [0, r2], [r2, 0], [0, -r2], [-r2, 0],
      ];
      const pts = ring.map(([dx, dy]) => ({ x: rd.x + dx, y: rd.y + dy }));
      // Onderscheid een geslaagde (evt. lege) WMS-response van een fout/time-out,
      // zodat we "hier ligt geen bodem" niet verwarren met "de service haperde".
      const sample = async (p) => {
        try { return { ok: true, props: await wmsPointInfo(S.bodemkaart, p, { timeoutMs: 3000, half: 1 }) }; }
        catch { return { ok: false, props: null }; }
      };
      const res = await safe("bodem", () => Promise.all(pts.map(sample)), { provenance, data_gaps, meta });
      if (!res) { health.bodemOk = false; return {}; }
      // Geen enkele geslaagde response → hapering (koude/trage service), geen echte leegte.
      if (!res.some((r) => r.ok)) { health.bodemOk = false; return {}; }
      // Tel bodemtypes; centrum weegt dubbel, dan het meest voorkomende.
      const counts = new Map();
      res.forEach((r, i) => {
        const code = r.props && r.props[codeProp];
        const naam = r.props && r.props[naamProp];
        if (!code && !naam) return;
        const key = code || naam;
        const cur = counts.get(key) || { n: 0, code: code || null, naam: naam || null };
        cur.n += i === 0 ? 2 : 1;
        counts.set(key, cur);
      });
      if (counts.size === 0) return {};
      const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
      provenance.push({ dataset: S.bodemkaart.dataset, retrieved: TODAY() });
      return { bodemcode: best.code, bodemnaam: best.naam };
    })(),
  ]);

  // 4) Bekende gaten in v1
  for (const [k, why] of [
    ["soil", S.bodemkaart?.wms ? null : "bodemkaart-endpoint nog te bevestigen"],
    ["groundwater", S.grondwaterspiegeldiepte?.wms ? null : "grondwater-endpoint nog te bevestigen"],
    ["climate_pressures", "Klimaateffectatlas — v2 (nationale lagen zijn downloads)"],
    ["species_observations", "NDFF-soorten — v2"],
  ]) {
    if (why) data_gaps.push(`${k} (${why})`);
  }

  const profiel = bouwProfiel({
    input: { type: rdParam ? "point" : "address", value: locationText || geo.weergavenaam || idParam || rdParam },
    geo, gebied, terrain, natura2000, soil, provenance, data_gaps, uncertainties,
  });
  profiel.meta = { ms: Date.now() - t0, per_bron_ms: meta, bronversie: cfg.version };

  // Cache op afgerond coördinaat (via CDN); zelfde plek → zelfde profiel.
  // Maar cache een *incompleet* resultaat kort: als een bron haperde (koude/
  // trage WMS of een time-out/fout), mag de lege scan niet 24 uur blijven
  // plakken — een volgende bezoeker moet 'm dan vers kunnen ophalen.
  const gehaperd = !health.bodemOk || data_gaps.some((g) => /niet opgehaald/.test(g));
  const cacheControl = gehaperd ? "public, max-age=60" : "public, max-age=86400";
  return json(profiel, 200, { "Cache-Control": cacheControl });
}
