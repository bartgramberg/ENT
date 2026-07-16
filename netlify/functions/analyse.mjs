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
import { geocode, ahnHeight, wfsIntersect } from "./lib/geo.mjs";
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
  const rdParam = url.searchParams.get("rd"); // "x,y"
  if (!locationText && !rdParam) return json({ error: "location of rd vereist" }, 400);

  const cfg = await bronnen();
  const S = cfg.sources || {};
  const meta = {};
  const provenance = [];
  const data_gaps = [];
  const uncertainties = [];
  const t0 = Date.now();

  // 1) Geocoding + administratieve context
  let geo = null;
  if (rdParam) {
    const [x, y] = rdParam.split(",").map((n) => parseFloat(n));
    if (Number.isFinite(x) && Number.isFinite(y)) geo = { weergavenaam: `RD ${x}, ${y}`, rd: { x, y }, ll: null };
  }
  if (!geo && locationText) {
    geo = await safe("geocoding", () => geocode(locationText, { url: S.locatieserver?.url, timeoutMs: 3000 }), { provenance, data_gaps, meta });
    if (geo) provenance.push({ dataset: S.locatieserver?.dataset || "PDOK Locatieserver", retrieved: TODAY() });
  }
  if (!geo || !geo.rd) {
    return json({ error: "Locatie niet gevonden of geen coördinaat", meta }, 200);
  }
  const rd = geo.rd;

  // 2) Onderzoeksgebied
  const gebied = bepaalOnderzoeksgebied(locationText || geo.weergavenaam || geo.gemeente || "");

  // 3) Parallelle bronnen (graceful degradation)
  const [terrain, natura2000] = await Promise.all([
    // AHN: punt + vier buren (±50 m) → reliëf-indicatie
    (async () => {
      if (!S.ahn?.wms) { data_gaps.push("terrain (AHN niet geconfigureerd)"); return {}; }
      const off = 50;
      const pts = [rd, { x: rd.x, y: rd.y + off }, { x: rd.x + off, y: rd.y }, { x: rd.x, y: rd.y - off }, { x: rd.x - off, y: rd.y }];
      const hs = await safe("terrain", () => Promise.all(pts.map((p) => ahnHeight(S.ahn, p, { timeoutMs: 3000 }))), { provenance, data_gaps, meta });
      if (!hs || hs[0] == null) return {};
      provenance.push({ dataset: S.ahn.dataset, retrieved: TODAY() });
      const relief = reliefIndicatie(hs[0], hs.slice(1));
      return { hoogte_nap_m: +hs[0].toFixed(2), relief: relief || undefined };
    })(),
    // Natura 2000 punt-intersectie
    (async () => {
      if (!S.natura2000?.wfs) { data_gaps.push("protected_areas (Natura2000 niet geconfigureerd)"); return null; }
      const p = await safe("natura2000", () => wfsIntersect(S.natura2000, rd, { timeoutMs: 3000 }), { provenance, data_gaps, meta });
      provenance.push({ dataset: S.natura2000.dataset, retrieved: TODAY() });
      if (!p) return { in_gebied: false };
      return { in_gebied: true, naam: p[S.natura2000.naamProperty] || p.naamN2K || null, nr: p.nr ?? null };
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
    input: { type: rdParam ? "point" : "address", value: locationText || rdParam },
    geo, gebied, terrain, natura2000, provenance, data_gaps, uncertainties,
  });
  profiel.meta = { ms: Date.now() - t0, per_bron_ms: meta, bronversie: cfg.version };

  // Cache op afgerond coördinaat (via CDN); zelfde plek → zelfde profiel.
  return json(profiel, 200, { "Cache-Control": "public, max-age=86400" });
}
